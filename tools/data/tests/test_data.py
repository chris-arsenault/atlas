import hashlib
import shutil
from pathlib import Path

import boto3
import pytest
from moto import mock_aws
from shapely.geometry import Polygon, mapping

from atlas_data.build import validate_dating
from atlas_data.catalogue import ancestry, subject
from atlas_data.geography import normalized_geometry
from atlas_data.inputs import capture_local
from atlas_data.io import digest, fetch, write_json
from atlas_data.publish import publish


def test_catalogue_joins_never_guess_by_name():
    nodes = {"beng1280": {"name": "Bengali", "parent": None}}
    identifier, joined = subject("old-id", "Bengali", nodes, {})
    assert joined == "unresolved" and identifier == "atlas:old-id"
    assert subject("old-id", "Bengali", nodes, {"old-id": "beng1280"}) == ("beng1280", "mapped")
    nodes["beng1280"]["parent"] = "beng1280"
    with pytest.raises(ValueError, match="cycle"):
        ancestry(nodes, "beng1280")


def test_geometry_holes_and_antimeridian_parts_remain_distinct():
    ring = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]
    hole = [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]
    geometry, changes = normalized_geometry(mapping(Polygon(ring, [hole])))
    assert len(geometry.interiors) == 1 and not changes
    raw = {
        "type": "MultiPolygon",
        "coordinates": [
            [[[179, 0], [180, 0], [180, 1], [179, 1], [179, 0]]],
            [[[-180, 0], [-179, 0], [-179, 1], [-180, 1], [-180, 0]]],
        ],
    }
    geometry, _ = normalized_geometry(raw)
    assert len(geometry.geoms) == 2 and geometry.area == 2


def test_checksum_failure_never_substitutes_another_source(tmp_path):
    (tmp_path / "source.zip").write_bytes(b"changed")
    with pytest.raises(ValueError, match="Checksum mismatch"):
        fetch(
            {
                "id": "pinned",
                "file": "source.zip",
                "sha256": hashlib.sha256(b"original").hexdigest(),
            },
            tmp_path,
        )
    with pytest.raises(ValueError, match="Reversed"):
        validate_dating({"kind": "uncertain", "start": 1, "end": -1})


@mock_aws
def test_failed_publication_preserves_channel_and_retry_is_safe(tmp_path):
    client = boto3.client("s3", region_name="us-east-1")
    client.create_bucket(Bucket="atlas-data-test")
    client.put_object(
        Bucket="atlas-data-test", Key="published/data/v1/channel.json", Body=b"previous"
    )
    write_json(tmp_path / "catalogue.json", [{"id": "beng1280"}])
    provenance = capture_local(Path(__file__).resolve().parents[3], tmp_path / "inputs")
    shutil.move(tmp_path / "inputs/inputs.json", tmp_path / "inputs/manifest.json")
    write_json(
        tmp_path / "manifest.json",
        {
            "schema": 1,
            "dataContract": "calendar-v1",
            "inputs": provenance,
            "release": "content-id",
            "artifacts": {
                str(path.relative_to(tmp_path)): {"sha256": digest(path)}
                for path in tmp_path.rglob("*")
                if path.is_file()
            },
        },
    )

    class FailedUpload:
        def put_object(self, **kwargs):
            if kwargs["Key"].endswith("manifest.json"):
                raise RuntimeError("interrupted upload")
            return client.put_object(**kwargs)

    with pytest.raises(RuntimeError, match="interrupted"):
        publish(FailedUpload(), "atlas-data-test", tmp_path)
    assert (
        client.get_object(Bucket="atlas-data-test", Key="published/data/v1/channel.json")[
            "Body"
        ].read()
        == b"previous"
    )
    first = publish(client, "atlas-data-test", tmp_path)
    assert publish(client, "atlas-data-test", tmp_path) == first
    response = client.head_object(Bucket="atlas-data-test", Key="published/data/v1/channel.json")
    assert response["CacheControl"] == "no-store,max-age=0"
    catalogue = client.get_object(
        Bucket="atlas-data-test", Key="published/data/v1/releases/content-id/catalogue.json"
    )
    assert catalogue["ContentEncoding"] == "gzip"
