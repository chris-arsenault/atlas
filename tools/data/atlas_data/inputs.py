"""Capture authored sources independently of worker packaging and publication."""

import hashlib
import json
import re
import shutil
import subprocess
import urllib.parse
import urllib.request

from .io import digest, encode, read_json, write_json

INPUT_FILES = (
    "data/sources.lock.json",
    "data/mappings/glottolog.json",
    "data/historical/claims.json",
)


def public_bytes(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Atlas-data-pipeline"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def resolve_revision(repository, revision):
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repository):
        raise ValueError("Invalid authored-input repository")
    if not isinstance(revision, str) or not revision:
        raise ValueError("An authored-input revision is required")
    if re.fullmatch(r"[a-f0-9]{40}", revision):
        return revision
    reference = urllib.parse.quote(revision, safe="")
    url = f"https://api.github.com/repos/{repository}/commits/{reference}"
    commit = json.loads(public_bytes(url))["sha"]
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise ValueError("Invalid authored-input commit")
    return commit


def capture_remote(root, repository, commit):
    if resolve_revision(repository, commit) != commit:
        raise ValueError("Capture requires a resolved commit")
    for name in INPUT_FILES:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://raw.githubusercontent.com/{repository}/{commit}/{name}"
        path.write_bytes(public_bytes(url))
    return seal(root, {"kind": "git", "repository": repository, "commit": commit})


def capture_local(source, root):
    """Capture working files locally without claiming they are committed inputs."""
    for name in INPUT_FILES:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / name, path)
    head = subprocess.run(
        ["git", "-C", str(source), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    return seal(root, {"kind": "working-tree", "baseCommit": head})


def seal(root, provenance):
    validate_inputs(root)
    manifest = {
        "schema": 1,
        **provenance,
        "files": {name: digest(root / name) for name in INPUT_FILES},
    }
    write_json(root / "inputs.json", manifest)
    return manifest


def snapshot_id(manifest):
    return hashlib.sha256(encode(manifest)).hexdigest()


def verify_snapshot(root):
    manifest = read_json(root / "inputs.json")
    if manifest["schema"] != 1 or set(manifest["files"]) != set(INPUT_FILES):
        raise ValueError("Unsupported authored-input snapshot")
    for name, checksum in manifest["files"].items():
        if digest(root / name) != checksum:
            raise ValueError(f"Captured authored input mismatch: {name}")
    validate_inputs(root)
    return manifest


def validate_inputs(root):
    """Validate contracts without fetching archives or producing a release."""
    lock = read_json(root / INPUT_FILES[0])
    if lock["schema"] != 1:
        raise ValueError("Unsupported source lock schema")
    sources = lock["sources"] + lock.get("historicalSources", [])
    identifiers, files = set(), set()
    for source in sources:
        if source["id"] in identifiers or source["file"] in files:
            raise ValueError("Duplicate source ID or filename")
        identifiers.add(source["id"])
        files.add(source["file"])
        if "/" in source["file"] or source["file"] in ("", ".", ".."):
            raise ValueError("Unsafe source filename")
        if not re.fullmatch(r"[a-f0-9]{64}", source["sha256"]):
            raise ValueError("Invalid source checksum")
        if not all(source.get(key) for key in ("url", "citation", "reference", "license")):
            raise ValueError("Sources require citations, URLs and licenses")
        if "calendarEpoch" in source and (
            type(source["calendarEpoch"]) is not int
            or not source.get("datingReference")
            or not source.get("datingLocator")
        ):
            raise ValueError("Calendar epochs require a primary reference and locator")
    mappings = read_json(root / INPUT_FILES[1])
    if not isinstance(mappings, dict) or not all(
        isinstance(key, str) and isinstance(value, str) and key and value
        for key, value in mappings.items()
    ):
        raise ValueError("Identifier mappings require nonempty source and target IDs")
    claims = read_json(root / INPUT_FILES[2])
    if claims["schema"] != 1:
        raise ValueError("Unsupported authored claims schema")
    for source in claims["sources"]:
        if source["id"] in identifiers or not all(
            source.get(key) for key in ("id", "citation", "reference", "license")
        ):
            raise ValueError("Invalid or duplicate authored source")
        identifiers.add(source["id"])
    records = set()
    for kind in ("entities", "observations", "relationships", "attestations", "events"):
        for row in claims[kind]:
            if not row["id"] or row["id"] in records:
                raise ValueError("Duplicate or empty authored record ID")
            records.add(row["id"])
            if kind != "entities" and (row["source"] not in identifiers or not row.get("locator")):
                raise ValueError("Authored claims require a known source and locator")
            if kind == "entities":
                continue
            dating = row["dating"]
            if dating["kind"] not in ("undated", "reference", "validity", "uncertain"):
                raise ValueError("Unsupported authored date semantics")
            if dating.get("clock", "calendar") != "calendar":
                raise ValueError("Authored dates require calendar years and original labels")
            if any(
                type(dating[key]) is not int
                for key in ("year", "start", "end")
                if dating.get(key) is not None
            ):
                raise ValueError("Authored dates must use integer calendar years")
            start, end = dating.get("start"), dating.get("end")
            if start is not None and end is not None and start > end:
                raise ValueError("Reversed authored date interval")
            if dating["kind"] == "reference" and dating.get("year") is None:
                raise ValueError("Reference dates require a year")
            if dating["kind"] in ("uncertain", "validity") and start is None and end is None:
                raise ValueError("Dated authored claims require at least one boundary")
    return claims
