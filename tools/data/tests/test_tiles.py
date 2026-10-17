import shutil

import pytest

from atlas_data.io import digest, write_json
from atlas_data.tiles import compile_tiles


@pytest.mark.skipif(
    shutil.which("tippecanoe") is None,
    reason="Install the pinned Tippecanoe compiler for tile-compiler integration",
)
def test_archive_identity_does_not_depend_on_scratch_directory(tmp_path):
    hashes = []
    for name in ("local-workspace", "lambda-scratch"):
        directory = tmp_path / name
        geometry = {"type": "Polygon", "coordinates": [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]]}
        source = directory / "input.geojson"
        write_json(
            source,
            {
                "type": "FeatureCollection",
                "features": [
                    {"type": "Feature", "properties": {"id": "stable-id"}, "geometry": geometry}
                ],
            },
        )
        output = directory / "output.pmtiles"
        compile_tiles({"areas": source}, output, 2)
        hashes.append(digest(output))
    assert hashes[0] == hashes[1]
