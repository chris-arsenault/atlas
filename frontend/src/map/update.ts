import type { FilterSpecification, GeoJSONSource, Map } from "maplibre-gl";
import type { WorkspaceModel } from "../atlas/useWorkspace";
import { emptyFeatures } from "./style";
import { referenceYear } from "../atlas/state";
import { ancestryFeatures, eventFeatures } from "./overlays";

export function displayLevel(_model: WorkspaceModel, map: Map) {
  if (map.getZoom() < 2.7) return "families";
  return map.getZoom() < 4.7 ? "branches" : "areas";
}
export function updateAreas(map: Map, model: WorkspaceModel) {
  const { state, view } = model;
  const level = displayLevel(model, map);
  const subjects = view?.subjects ?? [];
  const highlight: FilterSpecification = ["in", ["get", "subject"], ["literal", subjects]];
  const allowed = view?.observations.map((row) => row.id) ?? [];
  const hasAreas = state.year === referenceYear;
  for (const name of ["families", "branches", "areas"]) {
    const visible = hasAreas && level === name;
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
function areaFilter(model: WorkspaceModel, level: string, allowed: string[]): FilterSpecification {
  if (level === "areas") {
    const includes: FilterSpecification = ["in", ["get", "id"], ["literal", allowed]];
    return includes;
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
  if (model.state.year !== referenceYear) return historicalFeatures(model, false);
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
  return historicalFeatures(model, true);
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
