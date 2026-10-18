import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map } from "maplibre-gl";
import type { WorkspaceModel } from "../atlas/useWorkspace";
import { emptyFeatures } from "./style";
import { referenceYear } from "../atlas/state";
import { ancestryFeatures, eventFeatures } from "./overlays";

export function displayLevel(_model: WorkspaceModel, map: Map) {
  if (map.getZoom() < 2.7) return "families";
  return map.getZoom() < 4.7 ? "branches" : "areas";
}
export function updateAreas(
  map: Map,
  model: WorkspaceModel,
  previous: WorkspaceModel | null = null
) {
  const changed = geometryChanged(model, previous);
  updateStyles(map, model);
  if (changed) {
    (map.getSource("locations") as GeoJSONSource).setData(locationFeatures(model));
    (map.getSource("modeled") as GeoJSONSource).setData(
      model.release.model ? historicalFeatures(model, false) : emptyFeatures
    );
    (map.getSource("uncertainty") as GeoJSONSource).setData(historicalUncertainty(model));
  }
  (map.getSource("ancestry") as GeoJSONSource).setData(ancestryFeatures(model));
  (map.getSource("events") as GeoJSONSource).setData(eventFeatures(model));
}
export function geometryChanged(model: WorkspaceModel, previous: WorkspaceModel | null) {
  if (!previous || previous.release !== model.release) return true;
  if (previous.state.selected !== model.state.selected) return true;
  if ((previous.state.year === referenceYear) !== (model.state.year === referenceYear)) return true;
  return model.release.model
    ? previous.modeled !== model.modeled
    : previous.view?.observations !== model.view?.observations;
}
function updateStyles(map: Map, model: WorkspaceModel) {
  const { state, view } = model;
  const level = displayLevel(model, map);
  const subjects = [...(view?.subjects ?? []), ...model.selection.map((row) => row.subject)];
  const highlight: ExpressionSpecification = ["in", ["get", "subject"], ["literal", subjects]];
  const allowed =
    state.year === referenceYear ? (view?.observations.map((row) => row.id) ?? []) : [];
  const hasAreas = state.year === referenceYear;
  for (const name of ["families", "branches", "areas"]) {
    const visible = hasAreas && level === name;
    map.setLayoutProperty(name, "visibility", visible ? "visible" : "none");
    map.setLayoutProperty(`${name}-selected`, "visibility", visible ? "visible" : "none");
    map.setFilter(`${name}-selected`, highlight);
    map.setFilter(name, areaFilter(model, name, allowed));
    map.setPaintProperty(name, "fill-opacity", selectionOpacity(!!state.selected, highlight));
  }
  map.setFilter("modeled-selected", highlight);
  map.setPaintProperty("modeled", "fill-opacity", modeledOpacity(!!state.selected, highlight));
  updatePointStyles(map, !!state.selected, highlight);
}
function updatePointStyles(map: Map, selected: boolean, highlight: ExpressionSpecification) {
  map.setPaintProperty("locations", "circle-opacity", selectionOpacity(selected, highlight));
  map.setPaintProperty("locations", "circle-stroke-opacity", selectionOpacity(selected, highlight));
  map.setPaintProperty("locations", "circle-radius", selected ? ["case", highlight, 6, 3] : 3);
}
function selectionOpacity(
  selected: boolean,
  highlight: ExpressionSpecification
): ExpressionSpecification | number {
  return selected ? ["case", highlight, 0.7, 0.15] : 0.48;
}
function modeledOpacity(
  selected: boolean,
  highlight: ExpressionSpecification
): ExpressionSpecification {
  const strength: ExpressionSpecification = [
    "case",
    ["==", ["get", "evidence"], "hypothesized"],
    0.24,
    0.52,
  ];
  return selected ? ["case", highlight, 0.7, 0.15] : strength;
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
  if (model.state.year !== referenceYear) return historicalFeatures(model, false, true);
  const selected = model.state.selected ? model.nodes.get(model.state.selected) : null;
  if (!selected?.point) return emptyFeatures;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { subject: selected.id, family: selected.family },
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
  uncertainty: boolean,
  pointsOnly = false
): GeoJSON.FeatureCollection {
  const active = new Set(
    (model.release.model ? model.modeled : model.view?.observations)?.map((row) => row.id)
  );
  return {
    type: "FeatureCollection",
    features: (model.release.model ? model.modeled : model.release.history.observations)
      .filter((row) => active.has(row.id))
      .filter((row) => !pointsOnly || row.geometry?.type === "Point")
      .filter(
        (row) =>
          !uncertainty ||
          !model.release.model ||
          model.selection.some((selected) => selected.id === row.id)
      )
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
                  family: model.nodes.get(row.subject)?.family ?? row.subject,
                },
                geometry,
              },
            ]
          : [];
      }),
  };
}
