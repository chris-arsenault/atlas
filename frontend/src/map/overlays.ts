import type { WorkspaceModel } from "../atlas/useWorkspace";
import { activeDate } from "../atlas/index";
import { acceptsClaim } from "../timeline/events";
import type { Languoid } from "../data/schema";

export function ancestryFeatures(model: WorkspaceModel): GeoJSON.FeatureCollection {
  if (!model.state.ancestry || model.state.layer !== "historical") return empty();
  const selected = selectedAncestry(model);
  return {
    type: "FeatureCollection",
    features: model.release.history.relationships
      .filter(
        (claim) =>
          acceptsClaim(claim, model.state) &&
          (!selected || selected.has(`${claim.parent}>${claim.child}`)) &&
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
function selectedAncestry(model: WorkspaceModel) {
  if (!model.state.selected) return null;
  const subjects = new Set(model.view?.subjects ?? [model.state.selected]);
  const edges = new Set<string>();
  for (const node of model.nodes.values()) {
    if (!subjects.has(node.id) && !(node.glottocode && subjects.has(node.glottocode))) continue;
    addAncestors(node, model.nodes, edges);
  }
  return edges;
}
function addAncestors(node: Languoid, nodes: Map<string, Languoid>, edges: Set<string>) {
  let child = node;
  const seen = new Set<string>();
  while (child.parent && !seen.has(child.id)) {
    seen.add(child.id);
    edges.add(`${child.parent}>${child.id}`);
    const parent = nodes.get(child.parent);
    if (!parent) break;
    child = parent;
  }
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
