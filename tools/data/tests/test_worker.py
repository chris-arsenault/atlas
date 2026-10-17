import hashlib

import boto3
from moto import mock_aws

from atlas_data import worker
from atlas_data.io import write_json


@mock_aws
def test_layer_handoff_contains_only_inputs_needed_by_assembly(tmp_path, monkeypatch):
    root = tmp_path / "root"
    sources = []
    for identifier in ("glottolog", "glottolog-metadata", "atlas", "basemap", "bouckaert"):
        sources.append(
            {
                "id": identifier,
                "file": identifier,
                "sha256": hashlib.sha256(identifier.encode()).hexdigest(),
            }
        )
    write_json(
        root / "data/sources.lock.json", {"sources": sources[:4], "historicalSources": sources[4:]}
    )
    monkeypatch.setenv("ATLAS_ROOT", str(root))
    monkeypatch.setenv("DATA_BUCKET", "atlas-test")
    client = boto3.client("s3", region_name="us-east-1")
    client.create_bucket(Bucket="atlas-test")
    # Historical/basemap sources are deliberately absent: this stage cannot need them.
    for source in sources[:3]:
        client.put_object(
            Bucket="atlas-test",
            Key=f"sources/{source['sha256']}/{source['file']}",
            Body=source["id"].encode(),
        )

    def import_layer(_root, cache, work, name):
        assert sorted(path.name for path in cache.iterdir()) == [
            "atlas",
            "glottolog",
            "glottolog-metadata",
        ]
        for output in (*worker.LAYER_OUTPUTS, "areas.geojsonl", "families.geojsonl"):
            write_json(work / name / output, {})
        return {"sourceFeatures": 1}

    monkeypatch.setattr(worker, "layer", import_layer)
    worker.stage({"stage": "layer", "run": "execution", "layer": "contemporary"})
    prefix = f"staging/{hashlib.sha256(b'execution').hexdigest()}/layers/contemporary/"
    objects = client.list_objects_v2(Bucket="atlas-test", Prefix=prefix)["Contents"]
    assert {row["Key"].removeprefix(prefix) for row in objects} == set(worker.LAYER_OUTPUTS)
    assert {source["id"] for source in worker.stage_sources(root, "assemble")} == {
        "glottolog",
        "basemap",
        "bouckaert",
    }
