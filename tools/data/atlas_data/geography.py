"""Preserve source features and assignments; derive unions only for map detail."""

import collections
import json
import zipfile

from shapely import make_valid, union_all
from shapely.geometry import mapping, shape

from .catalogue import ancestry, subject
from .io import archive_read, csv_rows, write_json


def normalized_geometry(raw):
    geometry = shape(raw)
    if geometry.is_empty or geometry.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError("Expected a nonempty polygonal source geometry")
    changes = []
    if not geometry.is_valid:
        geometry = make_valid(geometry)
        if geometry.geom_type == "GeometryCollection":
            geometry = union_all(
                [g for g in geometry.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
            )
        changes.append("Shapely make_valid; retained polygonal components")
    if geometry.is_empty or not geometry.is_valid:
        raise ValueError("Geometry repair failed")
    west, south, east, north = geometry.bounds
    if west < -180.001 or east > 180.001 or south < -90 or north > 90:
        raise ValueError(f"Source geometry outside EPSG:4326 bounds: {geometry.bounds}")
    return geometry, changes


def import_layer(cache, layer, nodes, mappings, output):
    with zipfile.ZipFile(cache / "atlas.zip") as archive:
        base = f"/cldf/{layer}/"
        features = json.loads(archive_read(archive, base + "features.geojson"))["features"]
        tables = {
            name: csv_rows(archive_read(archive, base + name + ".csv"))
            for name in ("languages", "contributions", "media")
        }
        metadata = json.loads(archive_read(archive, base + layer + "-metadata.json"))
    contribution_features = {
        row["ID"] for row in tables["contributions"] if row["Type"] == "feature"
    }
    feature_ids = {str(f["properties"]["id"]) for f in features}
    if len(feature_ids) != len(features) or contribution_features != feature_ids:
        raise ValueError(f"Source feature/contribution accounting mismatch: {layer}")
    observations, geometries = [], []
    joins = collections.Counter()
    for feature in features:
        props = feature["properties"]
        identifier, joined = subject(
            props.get("cldf:languageReference", ""), props["name"], nodes, mappings
        )
        joins[joined] += 1
        geometry, changes = normalized_geometry(feature["geometry"])
        observation_id = f"atlas:{layer}:{props['id']}"
        year = str(props.get("year", ""))
        dating = {"kind": "reference", "year": int(year)} if year.isdigit() else {"kind": "undated"}
        observations.append(
            {
                "id": observation_id,
                "subject": identifier,
                "layer": layer,
                "source": "atlas",
                "locator": {
                    "feature": props["id"],
                    "maps": props.get("maps", []),
                    "name": props["name"],
                },
                "rawDate": year,
                "dating": dating,
                "evidence": "map-derived",
                "variant": None,
                "geographicUncertainty": "Digitized map area; boundaries and multilingualism are source-limited.",
                "note": props.get("note", ""),
                "transformations": changes,
                "join": joined,
                "sourceGlottocode": props.get("cldf:languageReference"),
            }
        )
        geometries.append((identifier, observation_id, geometry))
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "observations.json", observations)
    write_json(output / "source-tables.json", {**tables, "metadata": metadata})
    write_json(
        output / "accounting.json",
        {
            "features": len(features),
            "observations": len(observations),
            "joins": dict(joins),
            "languageRows": len(tables["languages"]),
            "contributionRows": len(tables["contributions"]),
            "maps": sum(row["Type"] == "map" for row in tables["contributions"]),
        },
    )
    write_tiles_input(output, geometries, nodes)
    return observations


def write_tiles_input(output, geometries, nodes):
    groups = {"families": collections.defaultdict(list), "branches": collections.defaultdict(list)}
    with (output / "areas.geojsonl").open("w") as stream:
        for identifier, observation_id, geometry in geometries:
            chain = ancestry(nodes, identifier)
            family = nodes[identifier]["family"]
            branch = chain[-2] if len(chain) > 1 else identifier
            record = {
                "type": "Feature",
                "properties": {
                    "id": observation_id,
                    "subject": identifier,
                    "family": family,
                    "branch": branch,
                    "kind": nodes[identifier]["kind"],
                },
                "geometry": mapping(geometry),
            }
            stream.write(json.dumps(record, separators=(",", ":")) + "\n")
            groups["families"][family].append(geometry)
            groups["branches"][branch].append(geometry)
    for level, buckets in groups.items():
        with (output / f"{level}.geojsonl").open("w") as stream:
            for identifier in sorted(buckets):
                geometry = union_all(buckets[identifier])
                record = {
                    "type": "Feature",
                    "properties": {
                        "subject": identifier,
                        "family": nodes[identifier]["family"],
                        "derived": True,
                    },
                    "geometry": mapping(geometry),
                }
                stream.write(json.dumps(record, separators=(",", ":")) + "\n")
