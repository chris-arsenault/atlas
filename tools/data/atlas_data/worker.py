"""Native Lambda stages. S3 holds retry-safe per-execution intermediates."""

import hashlib
import os
import tempfile
from pathlib import Path

import boto3

from .build import assemble, layer, prepare
from .history import source_list
from .io import digest
from .publish import publish
from .telemetry import observe

LAYER_OUTPUTS = (
    "nodes.json",
    "observations.json",
    "accounting.json",
    "areas.pmtiles",
    "source-tables.json",
)


def stage_sources(root, name):
    sources = source_list(root)
    if name == "layer":
        return [
            source
            for source in sources
            if source["id"] in {"glottolog", "glottolog-metadata", "atlas"}
        ]
    return [source for source in sources if source["id"] not in {"glottolog-metadata", "atlas"}]


def upload_tree(client, bucket, directory, prefix):
    for path in sorted(directory.rglob("*")):
        if path.is_file():
            client.upload_file(str(path), bucket, f"{prefix}/{path.relative_to(directory)}")


def download_tree(client, bucket, directory, prefix):
    pages = client.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix + "/")
    for page in pages:
        for entry in page.get("Contents", []):
            relative = Path(entry["Key"][len(prefix) + 1 :])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("Unsafe intermediate object path")
            destination = directory / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            client.download_file(bucket, entry["Key"], str(destination))


def stage(event):
    root = Path(os.environ.get("ATLAS_ROOT", "/var/task"))
    client, bucket = boto3.client("s3"), os.environ["DATA_BUCKET"]
    run = hashlib.sha256(event["run"].encode()).hexdigest()
    prefix = f"staging/{run}"
    with tempfile.TemporaryDirectory() as temporary:
        base = Path(temporary)
        cache, work, output = base / "sources", base / "work", base / "data"
        cache.mkdir()
        if event["stage"] == "fetch":
            prepare(root, cache)
            for source in source_list(root):
                path = cache / source["file"]
                client.upload_file(
                    str(path), bucket, f"sources/{source['sha256']}/{source['file']}"
                )
            return {"run": event["run"], "layers": ["contemporary", "traditional"]}
        if event["stage"] in ("layer", "assemble"):
            for source in stage_sources(root, event["stage"]):
                path = cache / source["file"]
                client.download_file(
                    bucket, f"sources/{source['sha256']}/{source['file']}", str(path)
                )
                if digest(path) != source["sha256"]:
                    raise ValueError(f"Captured source mismatch: {source['id']}")
        if event["stage"] == "layer":
            counts = layer(root, cache, work, event["layer"])
            for name in LAYER_OUTPUTS:
                client.upload_file(
                    str(work / event["layer"] / name),
                    bucket,
                    f"{prefix}/layers/{event['layer']}/{name}",
                )
            return {"run": event["run"], "layer": event["layer"], "counts": counts}
        if event["stage"] == "assemble":
            download_tree(client, bucket, work, f"{prefix}/layers")
            directory = assemble(root, cache, work, output)
            upload_tree(client, bucket, directory, f"{prefix}/release")
            return {"run": event["run"], "release": directory.name}
        if event["stage"] == "publish":
            directory = output / event["release"]
            download_tree(client, bucket, directory, f"{prefix}/release")
            return publish(client, bucket, directory)
        raise ValueError(f"Unknown stage: {event['stage']}")


def handler(event, context):
    return observe(event, lambda: stage(event))
