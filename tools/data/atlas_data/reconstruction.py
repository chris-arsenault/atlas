"""Pipeline-owned historical inference. Source observations remain separate."""

import collections
import functools
import itertools
import json
import math
import re
import zipfile

from shapely import affinity, make_valid, transform, union_all
from shapely.geometry import Point, Polygon, box, mapping, shape
from shapely.ops import nearest_points
from shapely.prepared import prep

from .catalogue import ancestry
from .io import archive_read, read_json, write_json

EARTH_KM = 6371.0


def historical_span(value):
    """Keep a period distinct from an isolated reference year."""
    if not value:
        return None
    years = re.fullmatch(r"(-?\d+)-\d\d-\d\d/(-?\d+)-\d\d-\d\d", value)
    if not years:
        raise ValueError(f"Unsupported historical time span: {value}")
    start, end = map(int, years.groups())
    if start > end:
        raise ValueError(f"Reversed historical time span: {value}")
    return start, end


def vector(point):
    longitude, latitude = map(math.radians, point)
    return (
        math.cos(latitude) * math.cos(longitude),
        math.cos(latitude) * math.sin(longitude),
        math.sin(latitude),
    )


def coordinate(v):
    return [
        math.degrees(math.atan2(v[1], v[0])),
        math.degrees(math.atan2(v[2], math.hypot(v[0], v[1]))),
    ]


def mean_point(points):
    if not points:
        return None
    vectors = list(map(vector, points))
    return coordinate([sum(v[i] for v in vectors) / len(vectors) for i in range(3)])


def interpolate(start, end, fraction):
    """Spherical interpolation crosses the antimeridian by the short route."""
    fraction = max(0.0, min(1.0, fraction))
    a, b = vector(start), vector(end)
    angle = math.acos(max(-1.0, min(1.0, sum(x * y for x, y in zip(a, b)))))
    if angle < 1e-8:
        return list(start)
    if abs(math.sin(angle)) < 1e-8:
        # The great circle is undefined at antipodes; use a declared longitude path.
        delta = (end[0] - start[0] + 180) % 360 - 180
        return [
            (start[0] + delta * fraction + 180) % 360 - 180,
            start[1] + (end[1] - start[1]) * fraction,
        ]
    left, right = (
        math.sin((1 - fraction) * angle) / math.sin(angle),
        math.sin(fraction * angle) / math.sin(angle),
    )
    return coordinate([left * x + right * y for x, y in zip(a, b)])


def distance(a, b):
    return EARTH_KM * math.acos(
        max(-1.0, min(1.0, sum(x * y for x, y in zip(vector(a), vector(b)))))
    )


def wrapped(geometry):
    left, bottom, right, top = geometry.bounds
    if -180 <= left <= right <= 180 and -90 <= bottom <= top <= 90:
        return make_valid(geometry)
    pieces = []
    for offset in (-360, 0, 360):
        part = geometry.intersection(box(-180 + offset, -90, 180 + offset, 90))
        if not part.is_empty:
            pieces.append(affinity.translate(part, xoff=-offset))
    result = make_valid(union_all(pieces))
    if result.geom_type == "GeometryCollection":
        result = union_all([g for g in result.geoms if g.geom_type in ("Polygon", "MultiPolygon")])
    return result


def kernel(point, radius):
    """Geodesic spatial kernel; its radius is a model parameter, not a CI."""
    longitude, latitude = map(math.radians, point)
    angle, ring = radius / EARTH_KM, []
    for index in range(25):
        bearing = index * 2 * math.pi / 24
        lat = math.asin(
            math.sin(latitude) * math.cos(angle)
            + math.cos(latitude) * math.sin(angle) * math.cos(bearing)
        )
        lon = longitude + math.atan2(
            math.sin(bearing) * math.sin(angle) * math.cos(latitude),
            math.cos(angle) - math.sin(latitude) * math.sin(lat),
        )
        lon = point[0] + (math.degrees(lon) - point[0] + 180) % 360 - 180
        ring.append([lon, math.degrees(lat)])
    return wrapped(Polygon(ring))


def model_areas(cache, nodes, tolerance, mappings=None):
    mappings = mappings or {}
    buckets = collections.defaultdict(list)
    with zipfile.ZipFile(cache / "atlas.zip") as archive:
        features = json.loads(archive_read(archive, "/cldf/contemporary/features.geojson"))[
            "features"
        ]
    for feature in features:
        original = feature["properties"].get("cldf:languageReference")
        subject = mappings.get(original, original)
        if subject in nodes:
            geometry = make_valid(shape(feature["geometry"]))
            buckets[subject].append(geometry)
    return {
        key: union_all(values).simplify(tolerance, preserve_topology=True)
        for key, values in buckets.items()
    }


def surface_parts(geometry):
    if geometry.geom_type == "Polygon":
        yield geometry
    elif geometry.geom_type in ("MultiPolygon", "GeometryCollection"):
        for part in geometry.geoms:
            yield from surface_parts(part)


def rounded_geometry(geometry, point):
    if geometry.geom_type == "Point":
        return mapping(transform(geometry, lambda coordinates: coordinates.round(3)))
    polygons = [
        make_valid(
            transform(part, lambda coordinates: coordinates.round(3)),
            method="structure",
            keep_collapsed=False,
        )
        for part in surface_parts(geometry)
    ]
    result = union_all(polygons)
    return mapping(result) if not result.is_empty else mapping(Point([round(v, 3) for v in point]))


class LineageModel:
    def __init__(self, nodes, history, config, scenario, areas=None, land=None):
        self.config, self.scenario = config, scenario
        self.parameters = config["parameters"]
        self.last = self.parameters["lastYear"]
        self.stages = config["stages"]
        self.areas = areas or {}
        self.land = prep(land) if land is not None else None
        self.nodes = {
            key: value
            for key, value in nodes.items()
            if not key.startswith(("history:", "atlas:"))
            and not value["bookkeeping"]
            and value["family"] not in config["excludedFamilies"]
            and (value["kind"] in ("family", "language") or key in self.stages)
        }
        for key in (*config["calibrations"], *self.stages, *config["expansions"]):
            if key not in nodes:
                raise ValueError(f"Unknown model calibration subject: {key}")
        self.continuations = config.get("continuations", {})
        for subject, link in self.continuations.items():
            if subject not in nodes or any(stage not in self.stages for stage in link["stages"]):
                raise ValueError(f"Unknown historical stage correspondence: {subject}")
        self.children = collections.defaultdict(list)
        self.parents = {}
        for key, node in self.nodes.items():
            parent = node["parent"]
            while parent and parent not in self.nodes:
                parent = nodes[parent]["parent"]
            self.parents[key] = parent
            self.children[parent].append(key)
        self.periods = {
            key: historical_span(node.get("historicalSpan")) for key, node in self.nodes.items()
        }
        self.calibrations = self.study_calibrations(nodes, history)
        self.descendants = functools.cache(self.descendants)
        self.dispersal_prior = functools.cache(self.dispersal_prior)
        self.points, self.years, self.methods = {}, {}, {}
        for root in self.children[None]:
            self.fit(root)
        for root in self.children[None]:
            self.fit_geography(root, None)
        for root in self.children[None]:
            self.inherit_stage_points(root)

    def fit_geography(self, key, inherited):
        """Diaspora coordinates must not pull an ancestral core into an ocean."""
        fixed = (
            self.calibrations.get(key, {}).get("point")
            or self.config["calibrations"].get(key, {}).get("point")
            or self.nodes[key].get("point")
        )
        if self.children[key] and not fixed:
            candidates = [
                self.config["expansions"].get(child, {}).get("point") or self.nodes[child]["point"]
                for child in self.descendants(key)
                if not self.children[child] and self.nodes[child].get("point")
            ]
            anchor = inherited or self.points[key]
            if candidates and anchor:
                nearest = min(candidates, key=lambda point: distance(anchor, point))
                core = [
                    point
                    for point in candidates
                    if distance(nearest, point) <= self.parameters.get("geographicCoreKm", 1800)
                ]
                center = mean_point(core)
                self.points[key] = min(core, key=lambda point: distance(center, point))
        for child in self.children[key]:
            self.fit_geography(child, self.points[key] or inherited)

    def inherit_stage_points(self, key):
        if self.points[key] is None and key in self.stages:
            self.points[key] = self.points.get(self.parents[key])
        for child in self.children[key]:
            self.inherit_stage_points(child)

    def study_calibrations(self, all_nodes, history):
        children = collections.defaultdict(list)
        for claim in history["relationships"]:
            if claim["variant"] == self.scenario:
                children[claim["parent"]].append(claim["child"])

        @functools.cache
        def taxa(key):
            node = all_nodes[key]
            if not children[key]:
                return {node["glottocode"]} if node["glottocode"] in self.nodes else set()
            return set().union(*(taxa(child) for child in children[key]))

        result = {}
        for key in sorted(children):
            sample = all_nodes[key]
            year = sample.get("dating", {}).get("year")
            identifiers = taxa(key)
            if year is None or len(identifiers) < 2:
                continue
            chains = [ancestry(all_nodes, identifier) for identifier in sorted(identifiers)]
            shared = set(chains[0]).intersection(*chains[1:])
            common = next(
                (
                    identifier
                    for identifier in chains[0]
                    if identifier in shared and identifier in self.nodes
                ),
                None,
            )
            if common and (common not in result or year < result[common]["year"]):
                result[common] = {
                    "year": year,
                    "point": sample.get("point"),
                    "sourceNode": key,
                    "dating": sample["dating"],
                }
        return result

    @functools.cached_property
    def heights(self):
        heights = {}

        def visit(key):
            children = self.children[key]
            heights[key] = (
                (max(visit(child) for child in children) + (1 if len(children) > 1 else 0))
                if children
                else 0
            )
            return heights[key]

        for root in self.children[None]:
            visit(root)
        return heights

    def fit(self, root):
        prior = self.config["calibrations"].get(root)
        study = self.calibrations.get(root)
        root_year = (
            study["year"]
            if study
            else prior["year"]
            if prior
            else self.parameters["defaultRootYear"]
        )
        height = max(1, self.heights[root])

        def visit(key, base_year, base_height):
            node, children = self.nodes[key], self.children[key]
            period = self.periods[key]
            stage = self.stages.get(key)
            calibration = self.config["calibrations"].get(key)
            estimate = self.calibrations.get(key)
            if estimate:
                year, method = estimate["year"], "study-calibrated"
            elif calibration:
                year, method = calibration["year"], "authored-calibration"
            elif children:
                year, method = (
                    round(self.last - (self.last - base_year) * self.heights[key] / base_height),
                    "classification-prior",
                )
            else:
                year, method = self.last, "reference-continuity"
            if stage:
                year = stage["end"]
            elif period:
                year = period[1]
            for child in children:
                visit(child, year, max(1, self.heights[key]))
            if children:
                gap = self.parameters["minimumBranchYears"] if len(children) > 1 else 0
                year = min(year, min(self.years[child] for child in children) - gap)
            self.years[key] = year
            point = estimate.get("point") if estimate else None
            if point is None and calibration:
                point = calibration.get("point")
            point = (
                self.config["expansions"].get(key, {}).get("point")
                or point
                or node.get("point")
                or mean_point([self.points[child] for child in children if self.points.get(child)])
            )
            self.points[key], self.methods[key] = point, method

        visit(root, root_year, height)

    def active(self, year):
        result = []

        def visit(key):
            children = self.children[key]
            if not children and year > self.end_year(key):
                return
            if children and (self.structural_unary(key) or year >= self.years[key]):
                for child in children:
                    visit(child)
            elif key not in self.stages:
                result.append(key)

        for root in self.children[None]:
            visit(root)
        for key, stage in self.stages.items():
            if key in self.nodes and stage["start"] <= year <= stage["end"]:
                result.append(key)
        for key, period in self.periods.items():
            if period and period[0] != period[1] and period[0] <= year <= period[1]:
                result.append(key)
        return sorted(set(result))

    def descendants(self, key):
        return (key, *(item for child in self.children[key] for item in self.descendants(child)))

    def dispersal_prior(self, key):
        prior = self.config["calibrations"].get(key, {})
        if prior.get("spatialModel") == "dispersal":
            return key, prior
        parent = self.parents[key]
        return self.dispersal_prior(parent) if parent else None

    def eligible(self, key, year):
        """Contact membership cannot backdate a variety into its lexifier's past."""
        lineage = key
        while lineage:
            prior = self.config["calibrations"].get(lineage, {})
            if year < prior.get("earliestYear", -99999):
                return False
            if (
                prior.get("spatialModel") == "dispersal"
                and key != lineage
                and prior.get("primary") not in self.descendants(key)
                and key not in self.stages
                and not self.periods[key]
                and year < prior.get("descendantSince", -99999)
            ):
                return False
            lineage = self.parents[lineage]
        return year <= self.end_year(key)

    def end_year(self, key):
        if key in self.stages:
            return self.stages[key]["end"]
        period = self.periods[key]
        if not period:
            return self.last
        if period[0] != period[1]:
            return period[1]
        # A reference year is an anchor, not an extinction boundary.
        return (
            min(self.last, period[1] + self.parameters["isolatedAnchorYears"])
            if period[1] < 500
            else self.last
        )

    def structural_unary(self, key):
        return (
            len(self.children[key]) == 1
            and key not in self.calibrations
            and key not in self.config["calibrations"]
            and key not in self.stages
            and not self.periods[key]
        )

    def lineage_parent(self, key):
        parent = self.parents[key]
        while parent and self.structural_unary(parent):
            parent = self.parents[parent]
        return parent

    def estimate(self, key, year):
        if not self.eligible(key, year):
            return None
        point, parent = self.points[key], self.lineage_parent(key)
        if point is None:
            return None
        stage = self.stages.get(key)
        period = self.periods[key]
        method = self.methods[key]
        if stage:
            if not stage["start"] <= year <= stage["end"]:
                return None
            position, fraction, method = point, 1, "historical-stage"
            anchor = max(stage["start"], min(stage["end"], year))
        elif period and period[0] != period[1]:
            if not period[0] <= year <= period[1]:
                return None
            position, fraction, method = point, 1, "historical-period"
            anchor = year
        elif contact := self.dispersal_prior(key):
            _, prior = contact
            anchor = prior["year"]
            position = prior.get("point", point) if self.children[key] and year < anchor else point
            fraction = max(0, min(1, (year - anchor) / max(1, self.last - anchor)))
            method = "dispersal-prior"
        else:
            origin = self.points.get(parent) or point
            begin = self.years.get(parent, self.years[key] - 2000)
            end = self.years[key]
            fraction = max(0, min(1, (year - begin) / max(1, end - begin)))
            position = interpolate(origin, point, fraction)
            if distance(origin, point) > self.parameters.get("maximumInterpolationKm", 2000):
                position = point
            elif self.land is not None and not self.land.covers(Point(position)):
                # Keep a destination anchor instead of inventing ocean occupancy.
                # Source island points remain usable when the coarse land mask omits them.
                position = point
            anchor = end
            if period and period[0] == period[1]:
                window = self.parameters["isolatedAnchorYears"]
                if period[0] < 500 and abs(year - period[0]) > window:
                    return None
            if self.methods.get(parent) in ("study-calibrated", "authored-calibration"):
                method = "lineage-interpolation"
        radius = (
            self.parameters["referenceRadiusKm"]
            if not self.children[key]
            else self.parameters["ancestralRadiusKm"]
        )
        lineage = key
        temporal_uncertainty = 0
        while lineage:
            study = self.calibrations.get(lineage)
            if (
                study
                and study["dating"].get("start") is not None
                and study["dating"].get("end") is not None
            ):
                temporal_uncertainty = max(
                    abs(study["year"] - study["dating"][boundary]) for boundary in ("start", "end")
                )
                break
            calibration = self.config["calibrations"].get(lineage)
            if calibration:
                temporal_uncertainty = calibration["uncertaintyYears"]
                break
            lineage = self.parents[lineage]
        uncertainty = (
            radius
            + (abs(year - anchor) + temporal_uncertainty) * self.parameters["uncertaintyKmPerYear"]
        )
        return position, fraction, radius, uncertainty, method

    def distribution(self, key, year, estimate):
        point, fraction, radius, _, _ = estimate
        area = self.areas.get(key)
        reference = self.points[key]
        regions = self.stages.get(key, {}).get("regions", [])
        if regions:
            shapes = [
                kernel(region["point"], region["radiusKm"])
                for region in regions
                if region.get("start", -99999) <= year <= region.get("end", 99999)
            ]
            if shapes:
                return union_all(shapes)
        if self.children[key] and (contact := self.dispersal_prior(key)):
            _, prior = contact
            if year >= prior["year"]:
                shapes = [
                    self.distribution(child, year, value)
                    for child in self.descendants(key)
                    if not self.children[child] and (value := self.estimate(child, year))
                ]
                if shapes:
                    return union_all(shapes)
        if area is None or self.children[key]:
            return kernel(point, radius)
        parts = list(area.geoms) if area.geom_type == "MultiPolygon" else [area]
        shapes = [kernel(point, radius)]
        expansion = self.config["expansions"].get(key, {})
        for part in parts:
            center = part.representative_point()
            remote = distance(reference, [center.x, center.y]) > 2000
            regional = next(
                (
                    region
                    for region in expansion.get("regions", [])
                    if box(*region["bounds"]).covers(center)
                ),
                {},
            )
            expansion_start = regional.get("start", expansion.get("start", 1850))
            growth = (
                max(0, min(1, (year - expansion_start) / max(1, self.last - expansion_start)))
                if remote
                else 1
            )
            if growth <= 0:
                continue
            scale = (0.25 + 0.75 * fraction) * growth
            origin = (
                nearest_points(part, Point(regional["point"]))[0]
                if remote and regional.get("point")
                else center
            )
            geometry = affinity.scale(part, xfact=scale, yfact=scale, origin=(origin.x, origin.y))
            if not remote:
                delta = (point[0] - reference[0] + 180) % 360 - 180
                geometry = affinity.translate(geometry, xoff=delta, yoff=point[1] - reference[1])
            shapes.append(wrapped(geometry))
        return union_all(shapes) if shapes else kernel(point, radius)

    def row(self, key, year, start, end, land, prepared_land):
        estimate = self.estimate(key, year)
        if estimate is None:
            return None
        point, _, _radius, uncertainty, method = estimate
        geometry = self.distribution(key, year, estimate)
        if not prepared_land.covers(geometry):
            geometry = make_valid(geometry.intersection(land))
        if geometry.is_empty:
            geometry = Point(point)
        stage = self.stages.get(key)
        contact = self.dispersal_prior(key)
        if contact and self.children[key] and not geometry.is_empty:
            center = geometry.representative_point()
            point = [center.x, center.y]
        calibration = self.config["calibrations"].get(key)
        lineage = key
        provenance = None
        while lineage:
            if lineage in self.calibrations:
                provenance = {"subject": lineage, "study": self.calibrations[lineage]}
                break
            if lineage in self.config["calibrations"]:
                provenance = {"subject": lineage, "prior": self.config["calibrations"][lineage]}
                break
            lineage = self.parents[lineage]
        label = self.nodes[key]["name"]
        if stage and stage.get("earlyLabel") and year < stage.get("changeYear", self.last):
            label = stage["earlyLabel"]
        elif contact and self.children[key]:
            if year < contact[1]["year"] and (primary := contact[1].get("primary")):
                label = self.nodes[primary]["name"] + " ancestral lineage"
            else:
                label += " dispersal grouping"
        elif not stage and (
            self.children[key]
            or year
            < self.config["expansions"].get(key, {}).get("namedSince", self.years[key] - 1000)
        ):
            label += " ancestral lineage"
        use = (
            stage.get("earlyUse", stage["use"])
            if stage and year < stage.get("changeYear", self.last + 1)
            else stage["use"]
            if stage
            else "estimated contact-era presence"
            if contact
            else "estimated language presence"
        )
        basis = (
            stage["basis"]
            if stage
            else calibration["basis"]
            if calibration
            else contact[1]["basis"]
            if contact
            else "Interpolate the lineage toward descendant locations; chronology uses source calibrations where available and explicit branching/continuity priors elsewhere."
        )
        if expansion := self.config["expansions"].get(key):
            basis += " " + expansion["basis"]
        regions = stage.get("regions", []) if stage else []
        envelope = union_all(
            [geometry, kernel(point, uncertainty)]
            + [
                kernel(region["point"], region["radiusKm"] + uncertainty)
                for region in regions
                if region.get("start", -99999) <= year <= region.get("end", 99999)
            ]
        )
        return {
            "id": f"model:{self.scenario}:{key}",
            "subject": key,
            "layer": "modeled",
            "source": "atlas-model",
            "locator": {"model": self.config["id"], "subject": key, "scenario": self.scenario},
            "dating": {
                "kind": "validity",
                "clock": "calendar",
                "start": start,
                "end": end,
                "year": year,
            },
            "evidence": "hypothesized"
            if method in ("classification-prior", "reference-continuity", "dispersal-prior")
            else "reconstructed",
            "variant": self.scenario,
            "rawDate": f"Model evaluated at {year}; frame {start} to {end}",
            "geographicUncertainty": "Estimated overlapping region. The envelope is a heuristic sensitivity region, not a probability contour or an exclusive boundary.",
            "note": basis,
            "transformations": [
                "Pipeline lineage reconstruction, spatial interpolation, land clipping, modeled surface extraction and 0.001-degree rounding"
            ],
            "geometry": rounded_geometry(geometry, point),
            "uncertaintyGeometry": rounded_geometry(envelope, point),
            "model": {
                "label": label,
                "method": method,
                "use": use,
                "point": [round(v, 3) for v in point],
                "uncertaintyKm": round(uncertainty),
                "anchorYear": self.years[key],
                "calibration": provenance,
                "stageSource": stage["source"] if stage else None,
                "selectionSubjects": [
                    *[subject for subject in self.descendants(key) if self.eligible(subject, year)],
                    *[
                        subject
                        for subject, link in self.continuations.items()
                        if key in link["stages"]
                    ],
                ],
                "continuationBasis": {
                    subject: link
                    for subject, link in self.continuations.items()
                    if key in link["stages"]
                },
            },
        }


def generate_model(root, cache, nodes, history, directory):
    config = read_json(root / "data/historical/model.json")
    tolerance = config["parameters"]["geometryToleranceDegrees"]
    areas = model_areas(cache, nodes, tolerance, read_json(root / "data/mappings/glottolog.json"))
    countries = read_json(cache / "basemap.geojson")["features"]
    land = make_valid(union_all([shape(row["geometry"]) for row in countries]).simplify(tolerance))
    prepared_land = prep(land)
    start, last, step = (
        config["parameters"][key] for key in ("firstYear", "lastYear", "frameYears")
    )
    stage_boundaries = {
        value
        for stage in config["stages"].values()
        for value in (stage["start"], stage["end"] + 1, stage.get("changeYear", last))
        if start < value < last
    }
    stage_boundaries.update(
        value
        for stage in config["stages"].values()
        for region in stage.get("regions", [])
        for value in (region.get("start", start), region.get("end", last) + 1)
        if start < value < last
    )
    stage_boundaries.update(
        region["start"]
        for expansion in config["expansions"].values()
        for region in expansion.get("regions", [])
        if start < region["start"] < last
    )
    stage_boundaries.update(
        value
        for prior in config["calibrations"].values()
        for value in (prior.get("earliestYear", start), prior.get("descendantSince", start))
        if start < value < last
    )
    boundaries = sorted(
        {start, *range(math.ceil(start / step) * step, last, step), *stage_boundaries, last}
    )
    scenarios = sorted({row["variant"] for row in history["relationships"] if row.get("variant")})
    frames, summaries = [], {}
    for scenario in scenarios:
        model = LineageModel(nodes, history, config, scenario, areas, land)
        for begin, finish in itertools.pairwise(boundaries):
            year = (begin + finish - 1) // 2
            rows = [
                model.row(key, year, begin, finish - 1, land, prepared_land)
                for key in model.active(year)
            ]
            rows = [row for row in rows if row is not None]
            historical_subjects = {
                subject
                for row in rows
                if row["model"]["method"] in ("historical-stage", "historical-period")
                for subject in row["model"]["selectionSubjects"]
            }
            for row in rows:
                if row["model"]["method"] not in ("historical-stage", "historical-period"):
                    row["model"]["selectionSubjects"] = [
                        subject
                        for subject in row["model"]["selectionSubjects"]
                        if subject == row["subject"] or subject not in historical_subjects
                    ]
            name = f"model/{scenario}/{begin}.json"
            write_json(
                directory / name,
                {
                    "schema": 1,
                    "scenario": scenario,
                    "year": year,
                    "start": begin,
                    "end": finish - 1,
                    "observations": rows,
                },
            )
            counts = collections.Counter(row["model"]["method"] for row in rows)
            families = collections.Counter(nodes[row["subject"]]["family"] for row in rows)
            coverage = collections.defaultdict(collections.Counter)
            for row in rows:
                coverage[nodes[row["subject"]]["family"]][row["evidence"]] += 1
            frames.append(
                {
                    "scenario": scenario,
                    "start": begin,
                    "end": finish - 1,
                    "year": year,
                    "artifact": name,
                    "count": len(rows),
                    "methods": dict(counts),
                    "families": dict(families),
                    "coverage": {family: dict(counts) for family, counts in coverage.items()},
                }
            )
        summaries[scenario] = {
            "lineages": len(model.nodes),
            "studyCalibrations": len(model.calibrations),
        }
    if not scenarios:
        raise ValueError("Historical model requires a chronology scenario")
    index = {
        "schema": 1,
        "id": config["id"],
        "defaultScenario": config["defaultScenario"],
        "description": config["description"],
        "assumptions": config["assumptions"],
        "references": config["references"],
        "frames": frames,
        "scenarios": summaries,
    }
    write_json(directory / "model/index.json", index)
    return index
