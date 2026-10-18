import argparse
from pathlib import Path

from .build import assemble, build, layer, prepare, validate_release
from .inputs import capture_local, verify_snapshot


def main():
    parser = argparse.ArgumentParser(description="Build Atlas data locally without publication")
    parser.add_argument("command", choices=("fetch", "layer", "assemble", "build", "validate"))
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--cache", type=Path, default=Path(".cache/sources"))
    parser.add_argument("--work", type=Path, default=Path(".cache/work"))
    parser.add_argument("--output", type=Path, default=Path(".cache/site/data"))
    parser.add_argument("--layer", choices=("contemporary", "traditional"))
    args = parser.parse_args()
    inputs = args.work / "inputs"
    if args.command == "fetch":
        capture_local(args.root, inputs)
        result = prepare(inputs, args.cache)
    elif args.command == "layer":
        verify_snapshot(inputs)
        result = layer(inputs, args.cache, args.work, args.layer)
    elif args.command == "assemble":
        result = assemble(inputs, args.cache, args.work, args.output, code_root=args.root)
    elif args.command == "validate":
        result = validate_release(args.output)
    else:
        result = build(args.root, args.cache, args.work, args.output)
    print(result)
