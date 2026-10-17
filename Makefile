.PHONY: ci data lambda data-test build browser-test
ci: data-test
	cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build
	terraform fmt -check -recursive infrastructure
data-test:
	uv sync --project tools/data --frozen --extra dev
	uv run --project tools/data --extra dev ruff check tools/data
	uv run --project tools/data --extra dev ruff format --check tools/data
	uv run --project tools/data --extra dev pytest -q
lambda:
	docker build --platform linux/amd64 -f tools/data/Dockerfile --output type=local,dest=.cache .
data:
	uv run --project tools/data atlas-data build
build:
	cd frontend && pnpm build
browser-test:
	cd frontend && pnpm test:browser
