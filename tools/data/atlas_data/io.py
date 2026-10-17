"""Canonical serialization, source integrity, and archive reads."""

import csv
import hashlib
import io
import json
import shutil
import urllib.request
import zipfile
from pathlib import Path


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def encode(value) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode()


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encode(value))


def read_json(path: Path):
    return json.loads(path.read_bytes())


def fetch(source: dict, cache: Path) -> Path:
    path = cache / source["file"]
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        temporary = path.with_suffix(path.suffix + ".part")
        with (
            urllib.request.urlopen(source["url"], timeout=120) as response,
            temporary.open("wb") as out,
        ):
            shutil.copyfileobj(response, out)
        if digest(temporary) != source["sha256"]:
            temporary.unlink()
            raise ValueError(f"Checksum mismatch: {source['id']}")
        temporary.replace(path)
    if digest(path) != source["sha256"]:
        raise ValueError(f"Checksum mismatch: {source['id']}")
    return path


def archive_read(archive: zipfile.ZipFile, suffix: str) -> bytes:
    names = [name for name in archive.namelist() if name.endswith(suffix)]
    if len(names) != 1:
        raise ValueError(f"Expected one archive member: {suffix}, found {len(names)}")
    return archive.read(names[0])


def csv_rows(content: bytes) -> list[dict]:
    return list(csv.DictReader(io.StringIO(content.decode("utf-8-sig"))))
