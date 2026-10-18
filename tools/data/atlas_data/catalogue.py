"""Catalogue identifiers are authoritative; names never resolve joins."""

import configparser
import zipfile

from .io import archive_read, csv_rows


def load_catalogue(cache):
    with zipfile.ZipFile(cache / "glottolog.zip") as archive:
        rows = csv_rows(archive_read(archive, "languoid.csv"))
    nodes = {}
    for row in rows:
        identifier = row["id"]
        if identifier in nodes:
            raise ValueError(f"Duplicate catalogue identifier: {identifier}")
        point = None
        if row["longitude"] and row["latitude"]:
            point = [float(row["longitude"]), float(row["latitude"])]
        nodes[identifier] = {
            "id": identifier,
            "glottocode": identifier,
            "name": row["name"],
            "aliases": [],
            "kind": row["level"],
            "parent": row["parent_id"] or None,
            "family": row["family_id"] or identifier,
            "iso": row["iso639P3code"] or None,
            "point": point,
            "status": "unknown",
            "bookkeeping": row["bookkeeping"] == "True",
            "sources": ["glottolog"],
        }
    with zipfile.ZipFile(cache / "glottolog-metadata.zip") as archive:
        for member in archive.namelist():
            if not member.endswith("/md.ini"):
                continue
            identifier = member.split("/")[-2]
            if identifier not in nodes:
                continue
            config = configparser.ConfigParser(interpolation=None, strict=False)
            config.read_string(archive.read(member).decode("utf-8-sig"))
            aliases = set()
            if config.has_section("altnames"):
                for value in config["altnames"].values():
                    aliases.update(name.strip() for name in value.splitlines() if name.strip())
            nodes[identifier]["aliases"] = sorted(aliases - {nodes[identifier]["name"]})
            nodes[identifier]["status"] = config.get("endangerment", "status", fallback="unknown")
            nodes[identifier]["historicalSpan"] = config.get("core", "timespan", fallback=None)
            nodes[identifier]["macroareas"] = config.get("core", "macroareas", fallback="").split()
            nodes[identifier]["sourceRecord"] = member
    validate_hierarchy(nodes)
    return nodes


def ancestry(nodes, identifier):
    chain = []
    while identifier:
        if identifier in chain:
            raise ValueError(f"Hierarchy cycle: {identifier}")
        if identifier not in nodes:
            raise ValueError(f"Missing parent: {identifier}")
        chain.append(identifier)
        identifier = nodes[identifier]["parent"]
    return chain


def validate_hierarchy(nodes):
    for identifier in nodes:
        ancestry(nodes, identifier)


def subject(identifier, name, nodes, mappings):
    target = mappings.get(identifier, identifier)
    if target in nodes:
        return target, "mapped" if target != identifier else "exact"
    external = f"atlas:{identifier or name}"
    nodes.setdefault(
        external,
        {
            "id": external,
            "glottocode": identifier or None,
            "name": name or identifier,
            "aliases": [],
            "kind": "unresolved",
            "parent": None,
            "family": external,
            "iso": None,
            "point": None,
            "status": "unresolved source identifier",
            "bookkeeping": False,
            "sources": ["atlas"],
        },
    )
    return external, "unresolved"
