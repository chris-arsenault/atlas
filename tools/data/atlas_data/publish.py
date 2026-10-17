"""Only a complete, validated immutable release may replace the channel."""

import base64
import gzip
import hashlib

from botocore.exceptions import ClientError

from .build import validate_release
from .io import digest, encode

MIME = {
    ".json": "application/json",
    ".geojson": "application/geo+json",
    ".pmtiles": "application/vnd.pmtiles",
}


def publish(client, bucket, directory):
    manifest = validate_release(directory)
    prefix = f"published/data/v1/releases/{manifest['release']}"
    for name in [*sorted(manifest["artifacts"]), "manifest.json"]:
        path = directory / name
        checksum = digest(path)
        content = path.read_bytes()
        encoding = {}
        if path.suffix in (".json", ".geojson"):
            content = gzip.compress(content, mtime=0)
            encoding = {"ContentEncoding": "gzip"}
        try:
            client.put_object(
                Bucket=bucket,
                Key=f"{prefix}/{name}",
                Body=content,
                ContentType=MIME[path.suffix],
                CacheControl="public,max-age=31536000,immutable",
                Metadata={"sha256": checksum},
                ChecksumSHA256=base64.b64encode(hashlib.sha256(content).digest()).decode(),
                IfNoneMatch="*",
                **encoding,
            )
        except ClientError as error:
            if error.response["Error"]["Code"] not in ("PreconditionFailed", "412"):
                raise
            existing = client.head_object(Bucket=bucket, Key=f"{prefix}/{name}")
            if existing.get("Metadata", {}).get("sha256") != checksum:
                raise ValueError("Immutable S3 object checksum conflict") from error
    channel = {
        "schema": 1,
        "manifest": f"/data/v1/releases/{manifest['release']}/manifest.json",
        "sha256": digest(directory / "manifest.json"),
    }
    body = encode(channel)
    client.put_object(
        Bucket=bucket,
        Key="published/data/v1/channel.json",
        Body=body,
        ContentType="application/json",
        CacheControl="no-store,max-age=0",
        ChecksumSHA256=base64.b64encode(hashlib.sha256(body).digest()).decode(),
    )
    return channel
