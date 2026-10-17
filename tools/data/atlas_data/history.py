"""Source clocks and model variants stay distinct from calendar observations."""

import collections
import hashlib
import math
import zipfile

import dendropy
from shapely import make_valid
from shapely.geometry import MultiPolygon, Polygon, mapping

from .io import archive_read, csv_rows, read_json


def source_list(root):
    lock = read_json(root / "data/sources.lock.json")
    return lock["sources"] + lock.get("historicalSources", [])


def load_history(root, cache):
    result = read_json(root / "data/historical/claims.json")
    for source in result["sources"]:
        source["ingestion"] = "reviewed-editorial"
    result["accounting"] = {}
    result["clocks"] = {
        "calendar": {"unit": "astronomical calendar year"},
        "model": {"unit": "years before each source model's present", "calendarEpoch": None},
    }
    with zipfile.ZipFile(cache / "glottolog.zip") as archive:
        known = {row["id"] for row in csv_rows(archive_read(archive, "languoid.csv"))}
    mappings = read_json(root / "data/mappings/glottolog.json")
    for source in read_json(root / "data/sources.lock.json").get("historicalSources", []):
        imported = read_phylogeny(cache / source["file"], source["id"])
        reconcile_taxa(imported, known, mappings)
        for kind in ("entities", "relationships", "observations"):
            result[kind].extend(imported[kind])
        result["events"].extend(divergences(imported, source["id"]))
        result["sources"].append(source)
        result["accounting"][source["id"]] = imported["accounting"]
    return result


def divergences(imported, variant):
    children = collections.defaultdict(list)
    for claim in imported["relationships"]:
        children[claim["parent"]].append(claim["child"])
    return [
        {
            "id": f"{node['id']}:divergence",
            "name": f"Proposed divergence: {node['name']}",
            "kind": "divergence",
            "participants": [node["id"], *children[node["id"]]],
            "source": variant,
            "locator": f"cldf/summary.trees; node {node['id']}",
            "dating": node["dating"],
            "evidence": "reconstructed",
            "variant": variant,
            "note": "Branching in this source's summary phylogeny. The age interval is uncertainty about a node date; it is not a continuous event or a migration route.",
            "geometry": {"type": "Point", "coordinates": node["point"]} if node["point"] else None,
        }
        for node in imported["entities"]
        if node["id"] in children
    ]


def reconcile_taxa(imported, known, mappings):
    counts = collections.Counter()
    entities = {entity["id"]: entity for entity in imported["entities"]}
    for entity in imported["entities"]:
        if ":taxon:" not in entity["id"]:
            continue
        original = entity["glottocode"]
        target = mappings.get(original, original)
        entity["sourceGlottocode"] = original
        entity["join"] = (
            "exact" if original in known else "mapped" if target in known else "unresolved"
        )
        entity["glottocode"] = target if target in known else None
        counts[entity["join"]] += 1
    for claim in imported["relationships"]:
        claim["sampleGlottocode"] = entities[claim["child"]]["glottocode"]
    imported["accounting"]["joins"] = dict(counts)


def read_phylogeny(path, variant):
    with zipfile.ZipFile(path) as archive:
        taxa = {row["ID"]: row for row in csv_rows(archive_read(archive, "/cldf/languages.csv"))}
        tree = dendropy.Tree.get(
            data=archive_read(archive, "/cldf/summary.trees").decode(),
            schema="nexus",
            extract_comment_metadata=True,
            preserve_underscores=True,
        )
    entities, relationships, observations = [], [], []
    identifiers = {node: node_id(node, variant) for node in tree.preorder_node_iter()}
    for node in tree.preorder_node_iter():
        taxon = taxa.get(node.taxon.label) if node.taxon else None
        if node.taxon and taxon is None:
            raise ValueError(f"Unmapped tree taxon: {node.taxon.label}")
        annotation = {attribute.name: attribute.value for attribute in node.annotations}
        dating = node_dating(annotation)
        coordinate = model_point(annotation)
        identifier = identifiers[node]
        name = taxon["Name"] if taxon else ancestral_name(node)
        entities.append(
            {
                "id": identifier,
                "glottocode": taxon["Glottocode"] or None if taxon else None,
                "name": f"{name} ({variant})",
                "aliases": [taxon["ID"]] if taxon else [],
                "kind": "language" if taxon else "reconstructed",
                "parent": identifiers.get(node.parent_node),
                "family": "indo1319",
                "iso": taxon.get("ISO639P3code") or None if taxon else None,
                "point": coordinate,
                "status": "sampled taxon" if taxon else "model reconstruction",
                "bookkeeping": False,
                "sources": [variant],
                "dating": dating,
                "variant": variant,
            }
        )
        if node.parent_node:
            parent_annotation = {a.name: a.value for a in node.parent_node.annotations}
            relationships.append(
                {
                    "id": f"{identifiers[node.parent_node]}>{identifier}",
                    "parent": identifiers[node.parent_node],
                    "child": identifier,
                    "source": variant,
                    "locator": f"cldf/summary.trees; descendant taxa: {','.join(sorted(leaf.taxon.label for leaf in node.leaf_iter()))}",
                    "dating": node_dating(parent_annotation),
                    "evidence": "reconstructed",
                    "variant": variant,
                    "posterior": number(parent_annotation.get("posterior")),
                    "sampleGlottocode": taxon["Glottocode"] or None if taxon else None,
                }
            )
        if coordinate:
            observations.append(
                {
                    "id": f"{identifier}:location",
                    "subject": identifier,
                    "layer": "historical",
                    "source": variant,
                    "locator": {
                        "tree": "cldf/summary.trees",
                        "clade": sorted(leaf.taxon.label for leaf in node.leaf_iter()),
                    },
                    "rawDate": "source model years before an unspecified present",
                    "dating": dating,
                    "evidence": "reconstructed",
                    "variant": variant,
                    "geographicUncertainty": "Posterior summary location of a phylogenetic node, not a language territory. Source 80% HPD contours are separate geographic uncertainty.",
                    "note": "Possible node date within the source 95% age HPD, not continuous occupation throughout that interval. Model time has no asserted calendar epoch.",
                    "transformations": [
                        "Source age HPD rounded outwards to whole model years for timeline filtering."
                    ],
                    "geometry": {"type": "Point", "coordinates": coordinate},
                    "uncertaintyGeometry": uncertainty_geometry(annotation),
                    "sourceAnnotations": annotation,
                    "posterior": number(annotation.get("posterior")),
                }
            )
    leaves = tree.leaf_nodes()
    if {leaf.taxon.label for leaf in leaves} != set(taxa):
        raise ValueError(f"Taxon accounting mismatch: {variant}")
    return {
        "entities": entities,
        "relationships": relationships,
        "observations": observations,
        "accounting": {
            "taxonRows": len(taxa),
            "treeTips": len(leaves),
            "nodes": len(entities),
            "relationships": len(relationships),
            "geographicObservations": len(observations),
        },
    }


def node_id(node, variant):
    if node.taxon:
        return f"history:{variant}:taxon:{node.taxon.label}"
    leaves = ",".join(sorted(leaf.taxon.label for leaf in node.leaf_iter()))
    return f"history:{variant}:ancestor:{hashlib.sha256(leaves.encode()).hexdigest()[:16]}"


def ancestral_name(node):
    names = sorted(leaf.taxon.label.replace("_", " ") for leaf in node.leaf_iter())
    suffix = f" + {len(names) - 2} others" if len(names) > 2 else ""
    return f"Ancestor of {' / '.join(names[:2])}{suffix}"


def number(value):
    return None if value is None else float(value)


def node_dating(annotation):
    interval = annotation.get("height_95%_HPD")
    median = number(annotation.get("height_median", annotation.get("height")))
    if interval:
        low, high = map(float, interval)
    elif median is not None:
        low = high = median
    else:
        return {"kind": "undated", "clock": "model"}
    return {
        "kind": "uncertain",
        "clock": "model",
        "start": max(0, math.floor(low)),
        "end": max(0, math.ceil(high)),
        "label": "95% age HPD" if interval else "Source point estimate; uncertainty not supplied",
        "sourceAgeInterval": [low, high],
        "sourceMedianAge": median,
    }


def model_point(annotation):
    latitude = number(annotation.get("trait1_median", annotation.get("trait1")))
    longitude = number(annotation.get("trait2_median", annotation.get("trait2")))
    if latitude is None or longitude is None:
        return None
    if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
        raise ValueError("Invalid source model coordinate")
    return [longitude, latitude]


def uncertainty_geometry(annotation):
    polygons = []
    for index in range(1, int(float(annotation.get("trait_80%HPD_modality", 0))) + 1):
        latitudes = annotation.get(f"trait1_80%HPD_{index}", [])
        longitudes = annotation.get(f"trait2_80%HPD_{index}", [])
        if len(latitudes) != len(longitudes) or len(latitudes) < 4:
            raise ValueError("Malformed source geographic HPD contour")
        polygon = make_valid(Polygon(zip(map(float, longitudes), map(float, latitudes))))
        if polygon.geom_type == "Polygon":
            polygons.append(polygon)
        elif polygon.geom_type == "MultiPolygon":
            polygons.extend(polygon.geoms)
        else:
            raise ValueError("Non-polygonal source geographic HPD contour")
    return mapping(MultiPolygon(polygons)) if polygons else None
