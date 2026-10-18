import zipfile

from atlas_data.history import divergences, node_dating, read_phylogeny


def test_model_age_never_acquires_an_invented_calendar_epoch():
    dating = node_dating({"height_95%_HPD": ["1000.2", "1400.8"], "height_median": "1200"})
    assert dating["clock"] == "model"
    assert (dating["start"], dating["end"]) == (1000, 1401)
    assert dating["sourceAgeInterval"] == [1000.2, 1400.8]
    assert dating["sourceMedianAge"] == 1200


def test_verified_epoch_reverses_age_intervals_and_preserves_originals():
    dating = node_dating({"height_95%_HPD": ["1000.2", "2400.8"], "height_median": "1200"}, 2000)
    assert dating["clock"] == "calendar"
    assert (dating["start"], dating["end"]) == (-401, 1000)
    assert dating["sourceAgeInterval"] == [1000.2, 2400.8]
    assert dating["sourceMedianAge"] == 1200
    assert dating["sourceCalendarEpoch"] == 2000
    assert dating["year"] == 800
    present = node_dating({"height": "0.0000000001"}, 2000)
    assert (present["start"], present["end"]) == (2000, 2000)
    assert present["year"] == 2000
    future = node_dating({"height": "-1.5"}, 2000)
    assert (future["start"], future["end"]) == (2001, 2002)
    assert future["sourceMedianAge"] == -1.5


def test_retains_distinct_samples_and_sourced_model_geography(tmp_path):
    archive = tmp_path / "tree.zip"
    with zipfile.ZipFile(archive, "w") as output:
        output.writestr(
            "release/cldf/languages.csv",
            "ID,Name,Glottocode,ISO639P3code\nA,Bengali A,beng1280,ben\nB,Bengali B,beng1280,ben\n",
        )
        output.writestr(
            "release/cldf/summary.trees",
            "#NEXUS\nBEGIN TREES;\ntree summary = [&R] (A[&height=0]:1200,B[&height=0]:1200)[&height_median=1200,height_95%_HPD={1000,1400},posterior=0.8,trait1_median=24,trait2_median=90];\nEND;",
        )
    imported = read_phylogeny(archive, "test")
    assert imported["accounting"]["treeTips"] == 2
    assert len({node["id"] for node in imported["entities"]}) == 3
    assert len(imported["relationships"]) == 2
    assert len(imported["observations"]) == 1
    observation = imported["observations"][0]
    assert observation["geometry"]["coordinates"] == [90, 24]
    assert observation["posterior"] == 0.8
    assert observation["dating"]["clock"] == "model"
    events = divergences(imported, "test")
    assert len(events) == 1
    assert events[0]["kind"] == "divergence"
    assert len(events[0]["participants"]) == 3
    assert events[0]["geometry"]["coordinates"] == [90, 24]
