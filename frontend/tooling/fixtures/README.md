# Browser fixtures

These are synthetic test cases, not excerpts of production language datasets.
The names and identifiers exercise UI selection; rectangles are invented.
`map.pmtiles` is a tiny compiled counterpart of `areas.geojson`, shared by
the synthetic layers. Regenerate it with the pinned Tippecanoe compiler:

```bash
tippecanoe --quiet --force --no-feature-limit --no-tile-size-limit --maximum-zoom=5 \
  --named-layer areas:frontend/tooling/fixtures/areas.geojson \
  --named-layer branches:frontend/tooling/fixtures/areas.geojson \
  --named-layer families:frontend/tooling/fixtures/areas.geojson \
  --named-layer land:frontend/tooling/fixtures/areas.geojson \
  --output frontend/tooling/fixtures/map.pmtiles
```

Vitest creates the small JSON release in `.cache/browser-fixtures` before
browser tests. Full-source runs use a separately generated release through
`ATLAS_DATA_DIR`; CI never starts the production data pipeline.
