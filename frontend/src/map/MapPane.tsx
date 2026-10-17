import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type Map as MapLibre, type MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { WorkspaceModel } from "../atlas/useWorkspace";
import { addAreas, mapStyle } from "./style";
import { updateAreas } from "./update";
import { ancestryFeatures } from "./overlays";

export function MapPane({ model }: { model: WorkspaceModel }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const latest = useRef(model);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<MapGeoJSONFeature[]>([]);
  useEffect(() => {
    latest.current = model;
  });
  useEffect(
    () => mountMap(container.current!, map, setReady, setError, setChoices, latest),
    [model.release]
  );
  useEffect(() => {
    if (!ready || !map.current) return;
    updateAreas(map.current, model);
    map.current.setProjection({ type: model.state.globe ? "globe" : "mercator" });
  }, [ready, model]);
  useEffect(() => {
    if (ready && map.current) focusMap(map.current, latest.current);
  }, [ready, model.state.selected, model.state.ancestry, model.state.layer, model.state.variant]);
  return (
    <section className="map-pane" aria-label="Language geography">
      <div className="map-canvas" ref={container} />
      <MapCaption model={model} />
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
  if (model.state.ancestry && model.state.layer === "historical") {
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
  const point = model.state.selected ? model.nodes.get(model.state.selected)?.point : null;
  if (point) map.flyTo({ center: point, zoom: Math.max(4.8, map.getZoom()), duration });
}
function MapCaption({ model }: { model: WorkspaceModel }) {
  const ancestry = ancestryFeatures(model);
  return (
    <div className="map-caption">
      <span className="eyebrow">Geographic evidence</span>
      <p>
        {model.state.layer === "historical"
          ? "Source model locations and uncertainty contours; no historical territories."
          : "Areas digitized from published maps. Boundaries are approximate."}
      </p>
      {model.state.ancestry && (
        <p>
          <span role="status">{ancestry.features.length} sourced ancestry links at this date.</span>{" "}
          Dashed ancestry links join estimates at different node ages; they are not migration
          routes.
          {!ancestry.features.length &&
            " No located ancestry is available for this selection, date and source."}
        </p>
      )}
      {model.state.contacts && (
        <p>
          Contact events retain separate sources. Events without historical coordinates remain in
          the event inspector.
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
  latest: React.RefObject<WorkspaceModel>
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
    if (instance.getLayer("areas")) updateAreas(instance, latest.current);
  });
  instance.on("click", (event) => {
    const features = instance.queryRenderedFeatures(event.point, {
      layers: ["areas", "branches", "families", "locations"],
    });
    const unique = [
      ...new Map(
        features
          .filter((f) => f.properties.subject)
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
function OverlapPicker({
  model,
  choices,
  close,
}: {
  model: WorkspaceModel;
  choices: MapGeoJSONFeature[];
  close: () => void;
}) {
  return (
    <aside className="overlap-picker" aria-label="Overlapping observations">
      <h3>Evidence at this location</h3>
      <p>These source claims overlap.</p>
      <ul>
        {choices.map((feature) => (
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
              {model.nodes.get(String(feature.properties.subject))?.name ??
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
