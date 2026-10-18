import type { ExpressionSpecification, StyleSpecification, Map } from "maplibre-gl";
import { PMTiles, Protocol, SharedPromiseCache } from "pmtiles";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Release } from "../data/schema";
import { familyColor } from "../atlas/color";

const protocol = new Protocol();
maplibregl.setWorkerUrl(mapWorkerUrl);
maplibregl.addProtocol("pmtiles", protocol.tile);
const directoryCache = new SharedPromiseCache(64);
export const emptyFeatures: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export function archiveUrl(release: Release, name: string) {
  const url = new URL(release.base + name, location.href).href;
  protocol.add(new PMTiles(url, directoryCache));
  return `pmtiles://${url}`;
}
export function mapStyle(release: Release): StyleSpecification {
  return {
    version: 8,
    sources: { land: { type: "vector", url: archiveUrl(release, "basemap.pmtiles") } },
    layers: [
      { id: "water", type: "background", paint: { "background-color": "#dce7e6" } },
      {
        id: "land",
        type: "fill",
        source: "land",
        "source-layer": "land",
        paint: { "fill-color": "#eeeae0", "fill-outline-color": "#c4cbc5" },
      },
    ],
  };
}
export function addAreas(map: Map, release: Release) {
  const families = [...new Set(release.nodes.map((node) => node.family))].sort();
  const colors: ExpressionSpecification = [
    "match",
    ["get", "family"],
    "__unclassified__",
    "#7c8075",
    "#7c8075",
  ];
  for (const id of families) colors.splice(colors.length - 1, 0, id, familyColor(id));
  map.addSource("areas", { type: "vector", url: archiveUrl(release, "contemporary.pmtiles") });
  for (const level of ["families", "branches", "areas"]) {
    map.addLayer({
      id: level,
      type: "fill",
      source: "areas",
      "source-layer": level,
      paint: { "fill-color": colors, "fill-opacity": 0.54, "fill-outline-color": "#fffdf4" },
    });
    map.addLayer({
      id: `${level}-selected`,
      type: "line",
      source: "areas",
      "source-layer": level,
      filter: ["==", ["get", "subject"], ""],
      paint: { "line-color": "#172c32", "line-width": 2.5 },
    });
  }
  map.addSource("locations", { type: "geojson", data: emptyFeatures });
  map.addSource("modeled", { type: "geojson", data: emptyFeatures });
  map.addLayer({
    id: "modeled",
    type: "fill",
    source: "modeled",
    paint: { "fill-color": colors, "fill-opacity": 0.48, "fill-outline-color": "#fffdf4" },
  });
  map.addLayer({
    id: "modeled-selected",
    type: "line",
    source: "modeled",
    filter: ["==", ["get", "subject"], ""],
    paint: { "line-color": "#172c32", "line-width": 2.5 },
  });
  addOverlays(map);
  map.addSource("uncertainty", { type: "geojson", data: emptyFeatures });
  map.addLayer({
    id: "uncertainty-fill",
    type: "fill",
    source: "uncertainty",
    paint: { "fill-color": "#af854e", "fill-opacity": 0.08 },
  });
  map.addLayer({
    id: "uncertainty-border",
    type: "line",
    source: "uncertainty",
    paint: { "line-color": "#987044", "line-width": 1, "line-dasharray": [3, 3] },
  });
  map.addLayer({
    id: "locations",
    type: "circle",
    source: "locations",
    paint: {
      "circle-radius": 3,
      "circle-color": colors,
      "circle-stroke-color": "#fffdf4",
      "circle-stroke-width": 0.75,
    },
  });
}
function addOverlays(map: Map) {
  map.addSource("ancestry", { type: "geojson", data: emptyFeatures });
  map.addSource("events", { type: "geojson", data: emptyFeatures });
  map.addLayer({
    id: "ancestry-links",
    type: "line",
    source: "ancestry",
    paint: { "line-color": "#846743", "line-width": 1.8, "line-dasharray": [4, 3] },
  });
  map.addLayer({
    id: "event-lines",
    type: "line",
    source: "events",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": "#89779d", "line-width": 2, "line-dasharray": [2, 3] },
  });
  map.addLayer({
    id: "event-points",
    type: "circle",
    source: "events",
    filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 10, "circle-color": "#b17552", "circle-opacity": 0.6 },
  });
}
