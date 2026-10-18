import hashlib
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

from atlas_data import inputs, worker
from atlas_data.io import read_json, write_json


def synthetic_inputs(root):
    sources = [
        {
            "id": identifier,
            "file": identifier,
            "sha256": hashlib.sha256(identifier.encode()).hexdigest(),
            "url": f"https://example.invalid/{identifier}",
            "license": "CC0-1.0",
            "citation": "Synthetic test source",
            "reference": "https://example.invalid/",
        }
        for identifier in ("glottolog", "glottolog-metadata", "atlas", "basemap", "bouckaert")
    ]
    write_json(
        root / "data/sources.lock.json",
        {
            "schema": 1,
            "sources": sources[:4],
            "historicalSources": sources[4:],
            "tools": {},
        },
    )
    write_json(root / "data/mappings/glottolog.json", {})
    write_json(
        root / "data/historical/claims.json",
        {
            "schema": 1,
            "sources": [],
            "entities": [],
            "observations": [],
            "relationships": [],
            "attestations": [],
            "events": [],
        },
    )
    return sources


def store_inputs(client, root):
    manifest = inputs.seal(root, {"kind": "git", "repository": "owner/repo", "commit": "a" * 40})
    identifier = inputs.snapshot_id(manifest)
    worker.upload_tree(client, "atlas-test", root, f"sources/authored/{identifier}")
    prefix = f"sources/runs/{hashlib.sha256(b'execution').hexdigest()}"
    worker.pin_json(client, "atlas-test", f"{prefix}/inputs.json", {"snapshot": identifier})
    return identifier


@mock_aws
def test_layer_handoff_contains_only_inputs_needed_by_assembly(tmp_path, monkeypatch):
    root = tmp_path / "root"
    sources = synthetic_inputs(root)
    monkeypatch.setenv("ATLAS_ROOT", str(tmp_path / "worker-without-data"))
    monkeypatch.setenv("DATA_BUCKET", "atlas-test")
    client = boto3.client("s3", region_name="us-east-1")
    client.create_bucket(Bucket="atlas-test")
    identifier = store_inputs(client, root)
    # Historical/basemap sources are deliberately absent: this stage cannot need them.
    for source in sources[:3]:
        client.put_object(
            Bucket="atlas-test",
            Key=f"sources/{source['sha256']}/{source['file']}",
            Body=source["id"].encode(),
        )

    def import_layer(_root, cache, work, name):
        assert _root != root
        assert read_json(_root / "data/sources.lock.json")["sources"] == sources[:4]
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
    client.put_object(
        Bucket="atlas-test",
        Key=f"sources/authored/{identifier}/data/mappings/glottolog.json",
        Body=b'{"unexpected":"mapping"}',
    )
    with pytest.raises(ValueError, match="Captured authored input mismatch"):
        worker.stage({"stage": "layer", "run": "execution", "layer": "contemporary"})


@mock_aws
def test_capture_pins_revision_before_download_and_reuses_it_on_retry(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_BUCKET", "atlas-test")
    monkeypatch.setenv("INPUT_REPOSITORY", "owner/repo")
    monkeypatch.setenv("INPUT_REVISION", "main")
    client = boto3.client("s3", region_name="us-east-1")
    client.create_bucket(Bucket="atlas-test")
    resolutions, captures = [], []

    def resolve(repository, revision):
        resolutions.append((repository, revision))
        return "a" * 40

    def capture(root, repository, commit):
        captures.append(commit)
        if len(captures) == 1:
            raise RuntimeError("interrupted capture")
        synthetic_inputs(root)
        return inputs.seal(root, {"kind": "git", "repository": repository, "commit": commit})

    def prepare(root, cache):
        for source in worker.source_list(root):
            (cache / source["file"]).write_bytes(source["id"].encode())

    monkeypatch.setattr(worker, "resolve_revision", resolve)
    monkeypatch.setattr(worker, "capture_remote", capture)
    monkeypatch.setattr(worker, "prepare", prepare)
    event = {"stage": "fetch", "run": "execution", "input": {"revision": "selected-ref"}}
    with pytest.raises(RuntimeError, match="interrupted capture"):
        worker.stage(event)
    assert worker.stage(event)["layers"] == ["contemporary", "traditional"]
    assert worker.stage(event)["run"] == "execution"
    assert resolutions == [("owner/repo", "selected-ref")]
    assert captures == ["a" * 40, "a" * 40]
    root = tmp_path / "recovered"
    prefix = f"sources/runs/{hashlib.sha256(b'execution').hexdigest()}"
    # Subsequent stages have no repository access or dependency on packaged inputs.
    manifest = worker.authored_inputs(client, "atlas-test", prefix, root, {"stage": "assemble"})
    assert manifest["commit"] == "a" * 40
    assert read_json(root / "data/historical/claims.json")["schema"] == 1


def test_authored_inputs_validate_without_fetching_and_preserve_exact_bytes(tmp_path):
    source = Path(__file__).resolve().parents[3]
    manifest = inputs.capture_local(source, tmp_path)
    assert manifest["kind"] == "working-tree"
    assert "commit" not in manifest
    for name in inputs.INPUT_FILES:
        assert (source / name).read_bytes() == (tmp_path / name).read_bytes()
    claims = read_json(tmp_path / "data/historical/claims.json")
    claims["attestations"][0]["locator"] = ""
    write_json(tmp_path / "data/historical/claims.json", claims)
    with pytest.raises(ValueError, match="known source and locator"):
        inputs.validate_inputs(tmp_path)
    with pytest.raises(ValueError, match="Captured authored input mismatch"):
        inputs.verify_snapshot(tmp_path)


def test_remote_capture_reads_every_file_at_one_resolved_commit(tmp_path, monkeypatch):
    source = Path(__file__).resolve().parents[3]
    urls = []
    commit = "b" * 40

    def request(url):
        urls.append(url)
        if url.startswith("https://api.github.com/"):
            return ('{"sha":"' + commit + '"}').encode()
        prefix = f"https://raw.githubusercontent.com/owner/repo/{commit}/"
        assert url.startswith(prefix)
        return (source / url.removeprefix(prefix)).read_bytes()

    monkeypatch.setattr(inputs, "public_bytes", request)
    resolved = inputs.resolve_revision("owner/repo", "data/reviewed")
    manifest = inputs.capture_remote(tmp_path, "owner/repo", resolved)
    assert manifest["commit"] == commit
    assert manifest["kind"] == "git"
    assert len(urls) == 4
    assert urls[0].endswith("/commits/data%2Freviewed")
    assert inputs.verify_snapshot(tmp_path) == manifest
