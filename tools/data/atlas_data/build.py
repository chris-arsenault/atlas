"""Generate one deterministic, compatible release from complete pinned inputs."""

import hashlib
import shutil
from pathlib import Path

from .catalogue import load_catalogue, validate_hierarchy
from .geography import import_layer
from .history import load_history, source_list
from .inputs import INPUT_FILES, capture_local, validate_inputs, verify_snapshot
from .io import digest, encode, fetch, read_json, write_json
from .reconstruction import generate_model
from .tiles import compile_tiles, inspect_tiles

LAYERS = ("contemporary", "traditional")


def build_fingerprint(root: Path):
    return hashlib.sha256(
        b"".join(path.read_bytes() for path in sorted(Path(__file__).parent.glob("*.py")))
        + (root / "tools/data/uv.lock").read_bytes()
    ).hexdigest()


def prepare(root: Path, cache: Path):
    sources = read_json(root / "data/sources.lock.json")
    for source in source_list(root):
        if source["license"] not in ("CC-BY-4.0", "CC0-1.0", "Public-Domain") or not source.get(
            "reference"
        ):
            raise ValueError(f"Unapproved source license or missing citation: {source['id']}")
        fetch(source, cache)
    return sources


def layer(root: Path, cache: Path, work: Path, name: str):
    if name not in LAYERS:
        raise ValueError(f"Unsupported layer: {name}")
    nodes = load_catalogue(cache)
    import_layer(cache, name, nodes, read_json(root / "data/mappings/glottolog.json"), work / name)
    write_json(work / name / "nodes.json", sorted(nodes.values(), key=lambda node: node["id"]))
    compile_tiles(
        {kind: work / name / f"{kind}.geojsonl" for kind in ("families", "branches", "areas")},
        work / name / "areas.pmtiles",
    )
    return read_json(work / name / "accounting.json")


def assemble(root: Path, cache: Path, work: Path, destination: Path, *, code_root=None):
    inputs = verify_snapshot(root)
    stage = work / "release"
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True, exist_ok=True)
    for name in INPUT_FILES:
        target = stage / "inputs" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / name, target)
    shutil.copyfile(root / "inputs.json", stage / "inputs/manifest.json")
    nodes, observations, counts = {}, [], {}
    for name in LAYERS:
        for node in read_json(work / name / "nodes.json"):
            nodes[node["id"]] = node
        observations.extend(read_json(work / name / "observations.json"))
        counts[name] = read_json(work / name / "accounting.json")
        shutil.copyfile(work / name / "areas.pmtiles", stage / f"{name}.pmtiles")
        shutil.copyfile(work / name / "source-tables.json", stage / f"{name}-source-tables.json")
    history = load_history(root, cache)
    for node in history["entities"]:
        if node["id"] in nodes:
            raise ValueError(f"Historical identifier collision: {node['id']}")
        nodes[node["id"]] = node
    observations.extend(history["observations"])
    validate_hierarchy(nodes)
    validate_claims(nodes, observations, history)
    reconstruction = generate_model(root, cache, nodes, history, stage)
    write_json(stage / "catalogue.json", sorted(nodes.values(), key=lambda node: node["id"]))
    write_json(stage / "history.json", history)
    publish_observations(stage, observations)
    compile_tiles({"land": cache / "basemap.geojson"}, stage / "basemap.pmtiles", 4)
    sources = read_json(root / "data/sources.lock.json")
    artifacts = {
        str(path.relative_to(stage)): {"sha256": digest(path), "bytes": path.stat().st_size}
        for path in sorted(stage.rglob("*"))
        if path.is_file() and path != stage / "manifest.json"
    }
    build_code = build_fingerprint(code_root or root)
    manifest = {
        "schema": 1,
        "dataContract": "calendar-v1",
        "model": "model/index.json",
        "inputs": inputs,
        "build": build_code,
        "sources": list(
            {source["id"]: source for source in source_list(root) + history["sources"]}.values()
        )
        + [
            {
                "id": "atlas-model",
                "citation": f"Atlas {reconstruction['id']}: pipeline reconstruction with explicit model assumptions.",
                "reference": "https://github.com/chris-arsenault/atlas/blob/main/data/historical/model.json",
                "license": "Derived source data with attribution; authored model assumptions.",
            }
        ],
        "tools": sources["tools"],
        "artifacts": artifacts,
        "counts": {"catalogue": len(nodes), "observations": len(observations), "layers": counts},
        "coverage": {
            "historicalAccounting": history["accounting"],
            "clocks": history["clocks"],
            "historicalObservations": len(history["observations"]),
            "variants": sorted(
                {
                    row["variant"]
                    for kind in ("relationships", "observations", "attestations", "events")
                    for row in history[kind]
                    if row.get("variant")
                }
            ),
            "dateSystem": "astronomical years; inclusive intervals",
            "gaps": [
                "Traditional is not a global date: contact-era Americas/Australia, contemporary proxies elsewhere.",
                "Source maps do not exhaustively record multilingualism.",
                "Contemporary areas are a 2007 reference snapshot, not evidence of continuous occupation. Undated traditional areas remain source records, not calendar-dated territories.",
                "Reconstructed node date intervals describe uncertainty, not continuous occupation. Calendar dating references and epochs remain attached to each source.",
                "Reviewed contact events are initially limited to Bengal. Modeled dispersal and colonial expansion use explicit priors rather than a complete historical event inventory.",
                "Global chronology outside the dated Indo-European studies and selected family calibrations relies heavily on classification and continuity priors. Regions are approximations, not exhaustive linguistic borders.",
                "Contact evidence without historical coordinates has no geographic route. Ancestry links connect model node estimates, not documented journeys.",
            ],
        },
    }
    release = hashlib.sha256(encode(manifest)).hexdigest()[:24]
    manifest["release"] = release
    write_json(stage / "manifest.json", manifest)
    release_dir = destination / "v1/releases" / release
    if release_dir.exists():
        if read_json(release_dir / "manifest.json") != manifest:
            raise ValueError("Immutable release identity collision")
    else:
        release_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(stage, release_dir)
    validate_release(release_dir)
    write_json(
        destination / "v1/channel.json",
        {
            "schema": 1,
            "manifest": f"/data/v1/releases/{release}/manifest.json",
            "sha256": digest(release_dir / "manifest.json"),
        },
    )
    return release_dir


def publish_observations(stage, observations):
    shards, index = {}, []
    for observation in sorted(observations, key=lambda row: row["id"]):
        shard = hashlib.sha256(observation["id"].encode()).hexdigest()[:2]
        shards.setdefault(shard, {})[observation["id"]] = observation
        index.append(
            {
                key: observation.get(key)
                for key in ("id", "subject", "layer", "dating", "evidence", "variant")
            }
        )
    write_json(stage / "observations-index.json", index)
    for shard, rows in shards.items():
        write_json(stage / "details" / f"{shard}.json", rows)


def validate_claims(nodes, observations, history):
    ids = set()
    source_ids = {"atlas", "glottolog", "glottolog-metadata", "basemap"} | {
        row["id"] for row in history["sources"]
    }
    for observation in observations:
        if observation["id"] in ids:
            raise ValueError("Duplicate observation ID")
        ids.add(observation["id"])
        if observation["subject"] not in nodes or observation["source"] not in source_ids:
            raise ValueError("Unknown observation subject/source")
        validate_dating(observation["dating"])
    for kind in ("relationships", "attestations", "events"):
        for row in history[kind]:
            if kind == "relationships" and (
                row["parent"] not in nodes or row["child"] not in nodes
            ):
                raise ValueError("Unknown relationship endpoint")
            if not row.get("locator") or row["source"] not in source_ids:
                raise ValueError("Historical claims require a source locator")
            for identifier in row.get("participants", [row.get("subject")]):
                if identifier is not None and identifier not in nodes:
                    raise ValueError(f"Unknown {kind} participant: {identifier}")
            if "dating" in row:
                validate_dating(row["dating"])


def validate_dating(dating):
    if dating["kind"] not in ("undated", "reference", "validity", "uncertain"):
        raise ValueError("Unsupported date semantics")
    start, end = dating.get("start"), dating.get("end")
    if start is not None and end is not None and start > end:
        raise ValueError("Reversed date interval")


def validate_release(directory):
    manifest = read_json(directory / "manifest.json")
    if manifest["schema"] != 1 or manifest.get("dataContract") != "calendar-v1":
        raise ValueError("Unsupported release schema")
    for name, artifact in manifest["artifacts"].items():
        path = directory / name
        if not path.is_file() or digest(path) != artifact["sha256"]:
            raise ValueError(f"Release integrity failure: {name}")
        if path.suffix == ".pmtiles":
            inspect_tiles(path)
    captured = directory / "inputs"
    # Release artifact name differs from the run's inputs.json to stay self-describing.
    inputs = read_json(captured / "manifest.json")
    if inputs != manifest["inputs"]:
        raise ValueError("Release input provenance mismatch")
    if set(inputs["files"]) != set(INPUT_FILES):
        raise ValueError("Unsupported release inputs")
    for name, checksum in inputs["files"].items():
        if f"inputs/{name}" not in manifest["artifacts"]:
            raise ValueError(f"Release is missing captured input artifact: {name}")
        if digest(captured / name) != checksum:
            raise ValueError(f"Release input integrity failure: {name}")
    if "inputs/manifest.json" not in manifest["artifacts"]:
        raise ValueError("Release is missing input provenance artifact")
    validate_inputs(captured)
    return manifest


def build(root, cache, work, destination):
    inputs_root = work / "inputs"
    capture_local(root, inputs_root)
    prepare(inputs_root, cache)
    for name in LAYERS:
        layer(inputs_root, cache, work, name)
    return assemble(inputs_root, cache, work, destination, code_root=root)
