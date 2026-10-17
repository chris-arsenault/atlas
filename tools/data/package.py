"""Package deployable files with stable ZIP metadata and Lambda's size limit."""

import sys
import zipfile
from pathlib import Path


def package(directory, output):
    files = [
        path
        for path in sorted(directory.rglob("*"))
        if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc"
    ]
    if sum(path.stat().st_size for path in files) > 250 * 1024 * 1024:
        raise ValueError("Lambda ZIP contents exceed the 250 MB deployment limit")
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            info = zipfile.ZipInfo(path.relative_to(directory).as_posix(), (2020, 1, 1, 0, 0, 0))
            info.external_attr = (0o100755 if path.parent.name == "bin" else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())


if __name__ == "__main__":
    package(Path(sys.argv[1]), Path(sys.argv[2]))
