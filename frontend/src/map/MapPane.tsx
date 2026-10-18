import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type Map as MapLibre, type MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { WorkspaceModel } from "../atlas/useWorkspace";
import { addAreas, mapStyle } from "./style";
import { geometryChanged, updateAreas } from "./update";
import { ancestryFeatures } from "./overlays";
import { referenceYear } from "../atlas/state";
import { activeDate } from "../atlas/index";

export function MapPane({ model }: { model: WorkspaceModel }) {
  const selectedModelPoint = model.selection[0]?.model?.point;
  const [selectedLongitude, selectedLatitude] = selectedModelPoint ?? [null, null];
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const latest = useRef(model);
  const applied = useRef<WorkspaceModel | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawn, setDrawn] = useState<WorkspaceModel | null>(null);
  const drawing = !error && (model.indexing || geometryChanged(model, drawn));
  const [choices, setChoices] = useState<MapGeoJSONFeature[]>([]);
  useEffect(() => {
    latest.current = model;
  });
  useEffect(
    () =>
      mountMap(container.current!, map, setReady, setError, setChoices, latest, applied, setDrawn),
    [model.release]
  );
  useEffect(() => {
    if (!ready || !map.current) return;
    updateAreas(map.current, model, applied.current);
    applied.current = model;
  }, [ready, model]);
  useEffect(() => {
    if (ready && map.current) focusMap(map.current, latest.current);
  }, [
    ready,
    model.state.selected,
    model.state.ancestry,
    model.state.variant,
    selectedLongitude,
    selectedLatitude,
  ]);
  return (
    <section className="map-pane" aria-label="Language geography" aria-busy={drawing}>
      <div className="map-canvas" ref={container} />
      <MapCaption model={model} drawing={drawing} />
      {error && (
        <div className="map-fallback" role="status">
          <h2>Map unavailable</h2>
          <p>{error}</p>
          <p>Search, genealogy, and source details remain available.</p>
        </div>
      )}
      {!!choices.length && (
        <OverlapPicker model={model} choices={choices} close={() => setChoices([])} />
      )}
    </section>
  );
}
function focusMap(map: MapLibre, model: WorkspaceModel) {
  const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700;
  if (model.state.ancestry) {
    const coordinates = ancestryFeatures(model).features.flatMap((feature) =>
      feature.geometry.type === "LineString" ? feature.geometry.coordinates : []
    );
    const bounds = new maplibregl.LngLatBounds();
    for (const [lng, lat] of coordinates) bounds.extend([lng, lat]);
    if (!bounds.isEmpty())
      map.fitBounds(bounds, {
        padding: 60,
        maxZoom: 4,
        duration,
      });
    return;
  }
  if (focusModeledRegion(map, model, duration)) return;
  const point = selectedPoint(model);
  if (point) map.flyTo({ center: point, zoom: Math.max(4.8, map.getZoom()), duration });
}
function focusModeledRegion(map: MapLibre, model: WorkspaceModel, duration: number) {
  const bounds = new maplibregl.LngLatBounds();
  for (const row of model.selection) {
    if (!row.geometry) continue;
    for (const coordinate of regionCoordinates(row.geometry))
      bounds.extend([coordinate[0], coordinate[1]]);
  }
  if (bounds.isEmpty()) return false;
  const padding =
    map.getContainer().clientWidth > 760 ? { top: 60, bottom: 60, left: 390, right: 40 } : 60;
  map.fitBounds(bounds, { padding, maxZoom: Math.max(4.8, map.getZoom()), duration });
  return true;
}
function regionCoordinates(geometry: GeoJSON.Geometry) {
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "Polygon") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}
function selectedPoint(model: WorkspaceModel) {
  const selected = model.state.selected ? model.nodes.get(model.state.selected) : null;
  if (!selected) return null;
  const estimated = model.selection[0]?.model?.point;
  if (estimated) return estimated;
  const located = selected.dating
    ? activeDate(selected.dating, model.state.year)
    : model.state.year === referenceYear;
  return located ? selected.point : null;
}
function MapCaption({ model, drawing }: { model: WorkspaceModel; drawing: boolean }) {
  const ancestry = ancestryFeatures(model);
  let caption =
    "Reconstructed locations · Indo-European coverage. Dotted contours show location uncertainty, not territories.";
  if (model.release.model)
    caption =
      "Colors identify language families; lighter regions rely on weaker priors. Select a region for its assumptions and uncertainty envelope.";
  if (model.state.year === referenceYear)
    caption = "2007 Atlas reference map · approximate source boundaries.";
  return (
    <div className="map-caption">
      <span className="eyebrow">
        {model.release.model && model.frameEntry
          ? "Estimated language presence"
          : "Geographic evidence"}
      </span>
      <p>{caption}</p>
      {drawing && <p role="status">Drawing language regions…</p>}
      {!model.state.selected && <p>Select a point or area to inspect its sources.</p>}
      {model.state.ancestry && (
        <p>
          <span role="status">{ancestry.features.length} sourced ancestry links at this date.</span>{" "}
          Dashed ancestry links join estimates at different node ages; they are not migration
          routes.
          {!ancestry.features.length &&
            " No located ancestry is available for this selection, date and source."}
        </p>
      )}
    </div>
  );
}
function mountMap(
  container: HTMLDivElement,
  map: React.RefObject<MapLibre | null>,
  ready: (value: boolean) => void,
  error: (message: string) => void,
  choices: (features: MapGeoJSONFeature[]) => void,
  latest: React.RefObject<WorkspaceModel>,
  applied: React.RefObject<WorkspaceModel | null>,
  drawn: (model: WorkspaceModel) => void
) {
  const model = latest.current;
  let instance: MapLibre;
  try {
    instance = new maplibregl.Map({
      container,
      style: mapStyle(model.release),
      center: [model.state.camera[0], model.state.camera[1]],
      zoom: model.state.camera[2],
      maxTileCacheSize: 128,
      attributionControl: { compact: true },
    });
  } catch {
    queueMicrotask(() => error("This browser could not create a WebGL map."));
    return () => {};
  }
  map.current = instance;
  instance.on("idle", () => drawn(latest.current));
  instance.addControl(new maplibregl.NavigationControl(), "top-left");
  instance.on("load", () => {
    addAreas(instance, model.release);
    ready(true);
  });
  instance.on("error", (event) => error(event.error.message));
  instance.on("moveend", () => {
    const center = instance.getCenter();
    latest.current.dispatch({
      type: "patch",
      patch: { camera: [center.lng, center.lat, instance.getZoom()] },
    });
    if (instance.getLayer("areas")) {
      updateAreas(instance, latest.current, applied.current);
      applied.current = latest.current;
    }
  });
  instance.on("click", (event) => {
    const features = instance.queryRenderedFeatures(event.point, {
      layers: ["areas", "branches", "families", "locations", "modeled"],
    });
    const unique = [
      ...new Map(
        features
          .filter((feature) => isActiveFeature(feature, latest.current))
          .map((f) => [f.properties.id ?? f.properties.subject, f])
      ).values(),
    ];
    if (unique.length === 1)
      latest.current.select(
        String(unique[0].properties.subject),
        (unique[0].properties.id as string) ?? null
      );
    else choices(unique);
  });
  return () => {
    instance.remove();
    map.current = null;
  };
}
function isActiveFeature(feature: MapGeoJSONFeature, model: WorkspaceModel) {
  if (!feature.properties.subject) return false;
  if (feature.properties.id) {
    return !!model.view?.observations.some((row) => row.id === String(feature.properties.id));
  }
  return (
    model.state.year === referenceYear &&
    model.state.evidence.includes("map-derived") &&
    (!model.state.family ||
      model.nodes.get(String(feature.properties.subject))?.family === model.state.family)
  );
}
function OverlapPicker({
  model,
  choices,
  close,
}: {
  model: WorkspaceModel;
  choices: MapGeoJSONFeature[];
  close: () => void;
}) {
  const activeChoices = choices.filter((feature) => isActiveFeature(feature, model));
  if (!activeChoices.length) return null;
  return (
    <aside className="overlap-picker" aria-label="Overlapping observations">
      <h3>Languages at this location</h3>
      <p>These estimated regions or source observations overlap.</p>
      <ul>
        {activeChoices.map((feature) => (
          <li key={String(feature.properties.id ?? feature.properties.subject)}>
            <button
              onClick={() => {
                model.select(
                  String(feature.properties.subject),
                  (feature.properties.id as string) ?? null
                );
                close();
              }}
            >
              {model.modeled.find((row) => row.id === feature.properties.id)?.model?.label ??
                model.nodes.get(String(feature.properties.subject))?.name ??
                String(feature.properties.subject)}
              <small>
                {String(feature.properties.id ?? "Derived union of available observations")}
              </small>
            </button>
          </li>
        ))}
      </ul>
      <button onClick={close}>Close</button>
    </aside>
  );
}
