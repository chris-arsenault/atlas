import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type Map as MapLibre, type MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { WorkspaceModel } from "../atlas/useWorkspace";
import { addAreas, mapStyle } from "./style";
import { updateAreas } from "./update";

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
    const point = model.state.selected ? model.nodes.get(model.state.selected)?.point : null;
    if (ready && point)
      map.current?.flyTo({
        center: point,
        zoom: Math.max(4.8, map.current.getZoom()),
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700,
      });
  }, [ready, model.state.selected, model.nodes]);
  return (
    <section className="map-pane" aria-label="Language geography">
      <div className="map-canvas" ref={container} />
      <div className="map-caption">
        <span className="eyebrow">Geographic evidence</span>
        <p>
          {model.state.layer === "historical"
            ? "Model points and dashed uncertainty contours are not language territories. Only supported evidence appears."
            : "Areas digitized from published maps. Boundaries are approximate."}
        </p>
        {model.state.ancestry && (
          <p>
            Dashed links: proposed model ancestry between node estimates. These are not migration
            routes.
          </p>
        )}
        {model.state.contacts && (
          <p>
            Contact events retain separate sources. Events without historical coordinates remain in
            the event inspector.
          </p>
        )}
      </div>
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
