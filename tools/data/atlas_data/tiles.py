"""Bounded static tile archives; never silently drop oversized tiles."""

import shutil
import subprocess
import tempfile
import zlib
from pathlib import Path

import mapbox_vector_tile
from pmtiles.reader import MmapSource, Reader


def compile_tiles(inputs: dict[str, Path], output: Path, max_zoom=7):
    command = [
        "tippecanoe",
        "--quiet",
        "--name",
        "Atlas geographic evidence",
        "--force",
        "--no-tile-size-limit",
        "--no-feature-limit",
        "--read-parallel",
        "--preserve-input-order",
        "--maximum-zoom",
        str(max_zoom),
        "--output",
        "tiles.pmtiles",
        "--attribution",
        "Glottography / Glottolog CC BY 4.0; Natural Earth public domain",
    ]
    with tempfile.TemporaryDirectory() as temporary:
        directory = Path(temporary)
        for layer, path in sorted(inputs.items()):
            filename = f"{layer}.geojson"
            (directory / filename).symlink_to(path.resolve())
            command.extend(["--named-layer", f"{layer}:{filename}"])
        subprocess.run(command, cwd=directory, check=True, stdout=subprocess.DEVNULL)
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(directory / "tiles.pmtiles", output)
    inspect_tiles(output)


def inspect_tiles(path):
    with path.open("rb") as stream:
        reader = Reader(MmapSource(stream))
        header = reader.header()
        if header["tile_type"].value != 1 or header["addressed_tiles_count"] == 0:
            raise ValueError(f"Empty or unsupported vector archive: {path}")
        tile = reader.get(0, 0, 0)
        if not tile:
            raise ValueError(f"Missing world tile: {path}")
        if header["tile_compression"].value == 2:
            tile = zlib.decompress(tile, 16 + zlib.MAX_WBITS)
        if not tile:
            raise ValueError(f"Empty decoded tile: {path}")
        if not mapbox_vector_tile.decode(tile):
            raise ValueError(f"Invalid vector tile: {path}")
        return header
