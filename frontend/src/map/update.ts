import type { FilterSpecification, GeoJSONSource, Map, VectorTileSource } from "maplibre-gl";
import type { WorkspaceModel } from "../atlas/useWorkspace";
import { archiveUrl, emptyFeatures } from "./style";
import { ancestryFeatures, eventFeatures } from "./overlays";

export function displayLevel(model: WorkspaceModel, map: Map) {
  const detail = model.state.detail;
  if (detail !== "auto") return detail === "dialects" ? "areas" : detail;
  if (map.getZoom() < 2.7) return "families";
  return map.getZoom() < 4.7 ? "branches" : "areas";
}
export function updateAreas(map: Map, model: WorkspaceModel) {
  const { state, view } = model;
  const historical = state.layer === "historical";
  const level = displayLevel(model, map);
  const subjects = view?.subjects ?? [];
  const highlight: FilterSpecification = ["in", ["get", "subject"], ["literal", subjects]];
  const allowed = view?.observations.map((row) => row.id) ?? [];
  updateSource(map, model);
  for (const name of ["families", "branches", "areas"]) {
    const visible = !historical && level === name;
    map.setLayoutProperty(name, "visibility", visible ? "visible" : "none");
    map.setLayoutProperty(`${name}-selected`, "visibility", visible ? "visible" : "none");
    map.setFilter(`${name}-selected`, highlight);
    map.setFilter(name, areaFilter(model, name, allowed));
    map.setPaintProperty(
      name,
      "fill-opacity",
      state.selected ? ["case", highlight, 0.7, 0.15] : 0.54
    );
  }
  (map.getSource("locations") as GeoJSONSource).setData(locationFeatures(model));
  (map.getSource("uncertainty") as GeoJSONSource).setData(historicalUncertainty(model));
  (map.getSource("ancestry") as GeoJSONSource).setData(ancestryFeatures(model));
  (map.getSource("events") as GeoJSONSource).setData(eventFeatures(model));
}
function updateSource(map: Map, model: WorkspaceModel) {
  if (model.state.layer === "historical") return;
  const source = map.getSource("areas") as VectorTileSource;
  const url = archiveUrl(model.release, `${model.state.layer}.pmtiles`);
  if (source.url !== url) source.setUrl(url);
}
function areaFilter(model: WorkspaceModel, level: string, allowed: string[]): FilterSpecification {
  if (level === "areas") {
    const includes: FilterSpecification = ["in", ["get", "id"], ["literal", allowed]];
    return model.state.detail === "dialects"
      ? ["all", includes, ["==", ["get", "kind"], "dialect"]]
      : includes;
  }
  if (!model.state.evidence.includes("map-derived")) return ["==", ["get", "subject"], ""];
  if (!model.state.family) return true;
  const isolated = model.release.nodes
    .filter((node) => node.family === model.state.family)
    .map((node) => node.id);
  isolated.push(model.state.family);
  return ["in", ["get", "subject"], ["literal", isolated]];
}
function locationFeatures(model: WorkspaceModel): GeoJSON.FeatureCollection {
  if (model.state.layer === "historical") return historicalFeatures(model, false);
  const selected = model.state.selected ? model.nodes.get(model.state.selected) : null;
  if (!selected?.point) return emptyFeatures;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { subject: selected.id },
        geometry: { type: "Point", coordinates: selected.point },
      },
    ],
  };
}
function historicalUncertainty(model: WorkspaceModel) {
  return model.state.layer === "historical" ? historicalFeatures(model, true) : emptyFeatures;
}
function historicalFeatures(
  model: WorkspaceModel,
  uncertainty: boolean
): GeoJSON.FeatureCollection {
  const active = new Set(model.view?.observations.map((row) => row.id));
  return {
    type: "FeatureCollection",
    features: model.release.history.observations
      .filter((row) => active.has(row.id))
      .flatMap((row) => {
        const geometry = uncertainty ? row.uncertaintyGeometry : row.geometry;
        return geometry
          ? [
              {
                type: "Feature" as const,
                properties: {
                  id: row.id,
                  subject: row.subject,
                  variant: row.variant,
                  evidence: row.evidence,
                },
                geometry,
              },
            ]
          : [];
      }),
  };
}
