"""Historical inference must differ from displaying dated source samples."""

import copy
import json
import zipfile

import pytest
from shapely.geometry import (
    GeometryCollection,
    LineString,
    MultiPolygon,
    Point,
    box,
    mapping,
    shape,
)
from shapely.prepared import prep

from atlas_data.io import read_json, write_json
from atlas_data.reconstruction import (
    LineageModel,
    distance,
    generate_model,
    historical_span,
    interpolate,
    kernel,
    model_areas,
    rounded_geometry,
)


def fixture_model():
    def node(key, parent, point, kind="language", **extra):
        return {
            "id": key,
            "name": key,
            "parent": parent,
            "family": "root",
            "kind": kind,
            "point": point,
            "bookkeeping": False,
            "glottocode": key,
            **extra,
        }

    nodes = {
        "root": node("root", None, [0, 0], "family"),
        "west": node("west", "root", [-10, 0]),
        "east": node("east", "root", [10, 0]),
        "latin": node("latin", "root", [12, 42], historicalSpan="-0100-01-01/0100-01-01"),
        "sample": node("sample", None, [0, 0], "reconstructed", dating={"year": -1000}),
    }
    nodes["sample"]["glottocode"] = None
    config = {
        "id": "test",
        "excludedFamilies": [],
        "expansions": {},
        "parameters": {
            "lastYear": 2007,
            "defaultRootYear": -4000,
            "minimumBranchYears": 40,
            "isolatedAnchorYears": 700,
            "referenceRadiusKm": 70,
            "ancestralRadiusKm": 180,
            "uncertaintyKmPerYear": 0.12,
        },
        "calibrations": {
            "root": {
                "year": -2000,
                "point": [0, 0],
                "uncertaintyYears": 500,
                "basis": "Synthetic prior",
                "source": "test",
            }
        },
        "stages": {
            "latin": {
                "start": -200,
                "end": 600,
                "use": "vernacular",
                "source": "test",
                "basis": "period",
            }
        },
    }
    history = {
        "relationships": [
            {"variant": "test", "parent": "sample", "child": key} for key in ("west", "east")
        ]
    }
    return nodes, history, config


def test_lineage_cut_continuity_and_historical_stage():
    nodes, history, config = fixture_model()
    model = LineageModel(nodes, history, config, "test")
    assert model.years["root"] == -1000
    assert model.active(-2000) == ["root"]
    assert {"west", "east", "latin"} <= set(model.active(400))
    assert "latin" not in model.active(700)
    assert "west" in model.active(1900)
    assert model.estimate("latin", 400)[-1] == "historical-stage"
    assert model.estimate("west", -500)[0][0] < 0
    assert model.estimate("west", -500)[0][0] > -10


def test_prior_changes_inferred_location_and_uncertainty():
    nodes, _, config = fixture_model()
    model = LineageModel(nodes, {"relationships": []}, config, "test")
    changed = copy.deepcopy(config)
    changed["calibrations"]["root"].update(point=[2, 0], uncertaintyYears=2000)
    alternative = LineageModel(nodes, {"relationships": []}, changed, "test")
    assert alternative.estimate("west", -1000)[0] != model.estimate("west", -1000)[0]
    assert alternative.estimate("west", -1000)[3] > model.estimate("west", -1000)[3]


def test_antimeridian_and_period_semantics():
    midpoint = interpolate([179, 0], [-179, 0], 0.5)
    assert abs(midpoint[0]) == pytest.approx(180)
    assert distance([179, 0], [-179, 0]) < 225
    region = kernel([179, 0], 300)
    assert region.is_valid and region.area < 40
    assert historical_span("-3100-01-01/-3100-01-01") == (-3100, -3100)
    with pytest.raises(ValueError, match="Reversed"):
        historical_span("1100-01-01/0450-01-01")


def test_isolated_reference_year_does_not_imply_immediate_extinction():
    nodes, history, config = fixture_model()
    nodes["west"]["historicalSpan"] = "-1000-01-01/-1000-01-01"
    model = LineageModel(nodes, history, config, "test")
    assert "west" in model.active(-800)
    assert model.estimate("west", -800) is not None
    assert "west" not in model.active(-299)
    assert model.estimate("west", -299) is None


def test_remote_modern_areas_do_not_become_ancient_territories():
    nodes, history, config = fixture_model()
    areas = {"west": MultiPolygon([box(-11, -1, -9, 1), box(-81, -1, -79, 1)])}
    model = LineageModel(nodes, history, config, "test", areas)
    early = model.distribution("west", 1000, model.estimate("west", 1000))
    recent = model.distribution("west", 2007, model.estimate("west", 2007))
    assert early.bounds[0] > -20
    assert recent.bounds[0] < -70


def test_regional_settlement_onset_and_entry_point_control_local_expansion():
    nodes, history, config = fixture_model()
    config["expansions"]["west"] = {
        "start": 1600,
        "regions": [{"bounds": [110, -45, 155, -10], "start": 1788, "point": [150, -34]}],
    }
    model = LineageModel(nodes, history, config, "test", {"west": box(130, -35, 150, -15)})
    before = model.distribution("west", 1700, model.estimate("west", 1700))
    early = model.distribution("west", 1850, model.estimate("west", 1850))
    recent = model.distribution("west", 2007, model.estimate("west", 2007))
    assert not before.intersects(box(110, -45, 155, -10))
    assert early.covers(Point(149, -33))
    assert not early.covers(Point(140, -25))
    assert recent.covers(Point(140, -25))


def test_unknown_authored_subject_is_an_error():
    nodes, history, config = fixture_model()
    config["calibrations"]["typo"] = config["calibrations"]["root"]
    with pytest.raises(ValueError, match="Unknown model calibration"):
        LineageModel(nodes, history, config, "test")


def test_local_calibration_controls_subtree_and_unlocated_stages_inherit_anchor():
    nodes, _history, config = fixture_model()
    nodes["recent"] = {**nodes["root"], "id": "recent", "parent": "root"}
    nodes["west"]["parent"] = "recent"
    nodes["east"]["parent"] = "recent"
    nodes["latin"]["point"] = None
    config["calibrations"]["recent"] = {"year": 1600, "point": [0, 0], "uncertaintyYears": 200}
    model = LineageModel(nodes, {"relationships": []}, config, "test")
    assert model.years["recent"] == 1600
    assert "west" not in model.active(800)
    assert "recent" in model.active(800)
    assert model.estimate("latin", 400)[0] == [0, 0]


def test_authored_expansion_origin_overrides_reference_coordinate():
    nodes, history, config = fixture_model()
    config["expansions"]["west"] = {"start": 1600, "point": [2, 1]}
    model = LineageModel(nodes, history, config, "test")
    assert model.points["west"] == [2, 1]


def test_generated_frames_cover_calendar_with_canonical_geometry_and_counts(tmp_path):
    nodes, history, config = fixture_model()
    config.update(
        defaultScenario="test",
        description="Synthetic test",
        assumptions=["Test prior"],
        references={},
        continuations={
            "west": {
                "stages": ["latin"],
                "source": "test",
                "basis": "Synthetic historical stage link",
            }
        },
    )
    config["parameters"].update(firstYear=-2000, frameYears=1000, geometryToleranceDegrees=0.1)
    root, cache, output = (tmp_path / name for name in ("root", "cache", "output"))
    cache.mkdir()
    write_json(root / "data/historical/model.json", config)
    write_json(root / "data/mappings/glottolog.json", {"old-code": "west"})
    with zipfile.ZipFile(cache / "atlas.zip", "w") as archive:
        archive.writestr(
            "test/cldf/contemporary/features.geojson",
            json.dumps(
                {
                    "features": [
                        {
                            "properties": {"cldf:languageReference": "old-code"},
                            "geometry": mapping(box(-11, -1, -9, 1)),
                        }
                    ]
                }
            ),
        )
    assert "west" in model_areas(cache, nodes, 0.1, {"old-code": "west"})
    write_json(
        cache / "basemap.geojson", {"features": [{"geometry": mapping(box(-180, -90, 180, 90))}]}
    )
    index = generate_model(root, cache, nodes, history, output)
    assert index["frames"][0]["start"] == -2000
    assert index["frames"][-1]["end"] == 2006
    prior_end = -2001
    for entry in index["frames"]:
        assert entry["start"] == prior_end + 1
        prior_end = entry["end"]
        frame = read_json(output / entry["artifact"])
        assert entry["count"] == len(frame["observations"])
        assert sum(sum(counts.values()) for counts in entry["coverage"].values()) == entry["count"]
        for row in frame["observations"]:
            assert row["subject"] in nodes
            assert row["source"] == "atlas-model"
            assert row["model"]["calibration"]
            if row["subject"] == "latin":
                assert row["model"]["selectionSubjects"] == ["latin", "west"]
            assert shape(row["geometry"]).is_valid
            assert shape(row["uncertaintyGeometry"]).is_valid
    assert any(entry["start"] == -200 for entry in index["frames"])


def test_rounding_extracts_surfaces_from_mixed_and_collapsed_model_fragments():
    mixed = GeometryCollection(
        [
            box(0, 0, 2, 2),
            box(1, 1, 3, 3),
            LineString([(1, 1), (4, 4)]),
            box(5, 5, 5.00001, 5.00001),
        ]
    )
    result = shape(rounded_geometry(mixed, [1, 1]))
    assert result.is_valid and result.area == pytest.approx(7)
    collapsed = shape(rounded_geometry(box(5, 5, 5.00001, 5.00001), [5, 5]))
    assert collapsed.geom_type == "Point" and next(iter(collapsed.coords)) == (5, 5)


def test_structural_single_child_groups_do_not_delay_or_move_the_language():
    nodes, history, config = fixture_model()
    nodes["wrapper"] = {**nodes["root"], "id": "wrapper", "parent": "root", "point": [-50, 20]}
    nodes["west"]["parent"] = "wrapper"
    model = LineageModel(nodes, history, config, "test")
    assert "west" in model.active(1900)
    assert "wrapper" not in model.active(1900)
    assert -10 < model.estimate("west", 1900)[0][0] < -9
    config["calibrations"]["wrapper"] = {**config["calibrations"]["root"], "year": 1600}
    calibrated = LineageModel(nodes, history, config, "test")
    assert "wrapper" in calibrated.active(1500)


def test_contact_destinations_and_late_varieties_do_not_relocate_the_lexifier():
    nodes, _, config = fixture_model()
    nodes["root"]["point"] = None
    nodes["west"]["point"] = [-1, 52]
    nodes["east"]["point"] = [-80, 20]
    nodes["recent"] = {**nodes["east"], "id": "recent", "point": [-5, 7]}
    nodes["global"] = {**nodes["root"], "id": "global", "parent": "root", "point": [-40, 30]}
    nodes["west"]["parent"] = "global"
    nodes["east"]["parent"] = "global"
    config["calibrations"]["root"].update(
        year=1600, point=[-1, 52], spatialModel="dispersal", primary="west", descendantSince=1650
    )
    config["calibrations"]["recent"] = {
        "year": 1980,
        "earliestYear": 1970,
        "spatialModel": "dispersal",
        "uncertaintyYears": 50,
        "basis": "Synthetic recent contact",
    }
    model = LineageModel(nodes, {"relationships": []}, config, "test")
    assert model.estimate("east", 1500) is None
    assert model.estimate("global", 1500)[0] == [-1, 52]
    assert model.estimate("recent", 1900) is None
    assert model.estimate("east", 1700)[0] == [-80, 20]
    land = box(-180, -90, 180, 90)
    row = model.row("root", 1700, 1700, 1799, land, prep(land))
    region = shape(row["geometry"])
    assert region.covers(Point(-1, 52)) and region.covers(Point(-80, 20))
    assert not region.covers(Point(-40, 40))
    assert "recent" not in row["model"]["selectionSubjects"]
    assert row["evidence"] == "hypothesized"
    assert model.estimate("recent", 2000)[0] == [-5, 7]


def test_source_period_survives_a_coarser_lineage_cut_and_regions_can_expire():
    nodes, _, config = fixture_model()
    config["stages"] = {}
    config["calibrations"]["root"]["year"] = 1600
    model = LineageModel(nodes, {"relationships": []}, config, "test")
    assert "latin" in model.active(1)
    assert model.estimate("latin", 1)[-1] == "historical-period"
    config["stages"]["west"] = {
        "start": 1000,
        "end": 2007,
        "use": "vernacular",
        "basis": "test",
        "source": "test",
        "regions": [{"point": [30, 10], "radiusKm": 100, "end": 1499}],
    }
    model = LineageModel(
        nodes, {"relationships": []}, config, "test", {"west": box(-11, -1, -9, 1)}
    )
    assert model.distribution("west", 1200, model.estimate("west", 1200)).covers(Point(30, 10))
    assert model.distribution("west", 1700, model.estimate("west", 1700)).covers(Point(-10, 0))


def test_diaspora_does_not_move_the_ancestral_core_into_the_atlantic():
    nodes, _, config = fixture_model()
    nodes["core"] = {**nodes["root"], "id": "core", "parent": "root", "point": None}
    nodes["west"].update(parent="core", point=[3, 7])
    nodes["east"].update(parent="core", point=[-82, 23])
    config["calibrations"]["root"]["point"] = [7, 8]
    land = MultiPolygon([box(-15, -5, 30, 35), box(-90, 15, -70, 30)])
    model = LineageModel(nodes, {"relationships": []}, config, "test", land=land)
    assert model.points["core"] == [3, 7]
    assert model.estimate("west", 1700)[0] == pytest.approx([3, 7])
    assert model.estimate("east", 1700)[0] == [-82, 23]
    unconstrained = LineageModel(nodes, {"relationships": []}, config, "test")
    assert unconstrained.estimate("east", 1700)[0] == [-82, 23]


def test_interpolation_over_water_uses_destination_and_preserves_small_island_anchors():
    nodes, history, config = fixture_model()
    land = box(-1, -1, 1, 1)
    unconstrained = LineageModel(nodes, history, config, "test")
    constrained = LineageModel(nodes, history, config, "test", land=land)
    assert -10 < unconstrained.estimate("west", 500)[0][0] < -1
    assert constrained.estimate("west", 500)[0] == [-10, 0]
    assert constrained.estimate("east", 2007)[0] == [10, 0]
