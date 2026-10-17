import type { WorkspaceModel } from "../atlas/useWorkspace";
import { activeDate } from "../atlas/index";
import { acceptsClaim } from "../timeline/events";

export function ancestryFeatures(model: WorkspaceModel): GeoJSON.FeatureCollection {
  if (!model.state.ancestry || model.state.layer !== "historical") return empty();
  return {
    type: "FeatureCollection",
    features: model.release.history.relationships
      .filter(
        (claim) =>
          acceptsClaim(claim, model.state) &&
          activeDate(claim.dating, model.state.year, model.state.clock)
      )
      .flatMap((claim) => {
        const parent = model.nodes.get(claim.parent),
          child = model.nodes.get(claim.child);
        if (!parent?.point || !child?.point) return [];
        if (model.state.family && parent.family !== model.state.family) return [];
        return [
          {
            type: "Feature" as const,
            properties: { id: claim.id, relation: "proposed ancestry", source: claim.source },
            geometry: { type: "LineString" as const, coordinates: [parent.point, child.point] },
          },
        ];
      }),
  };
}
export function eventFeatures(model: WorkspaceModel): GeoJSON.FeatureCollection {
  if (model.state.layer !== "historical") return empty();
  return {
    type: "FeatureCollection",
    features: model.release.history.events
      .filter(
        (event) =>
          acceptsClaim(event, model.state) &&
          activeDate(event.dating, model.state.year, model.state.clock)
      )
      .filter(
        (event) =>
          event.id === model.state.event || (model.state.contacts && event.kind === "contact")
      )
      .flatMap((event) =>
        event.geometry
          ? [
              {
                type: "Feature" as const,
                properties: { id: event.id, subject: event.participants[0], relation: event.kind },
                geometry: event.geometry,
              },
            ]
          : []
      ),
  };
}
function empty(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
