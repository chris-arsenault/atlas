import { useState } from "react";
import type { WorkspaceModel } from "./useWorkspace";
import type { Detail, Evidence, Layer } from "./state";

export function Controls({ model }: { model: WorkspaceModel }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="workspace-controls">
      <LayerControl model={model} />
      <LineageControl model={model} />
      <button
        className="map-options-toggle"
        aria-expanded={expanded}
        aria-controls="map-options"
        onClick={() => setExpanded(!expanded)}
      >
        Map options
      </button>
      <div id="map-options" className={`map-options${expanded ? " expanded" : ""}`}>
        <DetailControl model={model} />
        {model.state.layer === "historical" && <OverlayControls model={model} />}
        <button
          className={model.state.globe ? "toggle active" : "toggle"}
          aria-pressed={model.state.globe}
          onClick={() => model.dispatch({ type: "patch", patch: { globe: !model.state.globe } })}
        >
          Globe
        </button>
        {model.state.family && (
          <button onClick={() => model.dispatch({ type: "patch", patch: { family: null } })}>
            Show all families
          </button>
        )}
      </div>
      <span className="workspace-count" role="status">
        {model.indexing
          ? "Indexing catalogue…"
          : `${model.view?.observations.length.toLocaleString() ?? 0} observations`}
      </span>
    </div>
  );
}
function LineageControl({ model }: { model: WorkspaceModel }) {
  const active =
    model.state.layer === "historical" && model.state.clock === "model" && model.state.ancestry;
  const locatedVariants = model.release.history.observations
    .filter((row) => row.geometry && row.dating.clock === "model")
    .map((row) => row.variant);
  const variant = locatedVariants.includes(model.state.variant)
    ? model.state.variant
    : (locatedVariants[0] ?? "all");
  const ages = model.release.history.observations
    .filter((row) => row.variant === variant && row.geometry && row.dating.clock === "model")
    .map((row) => row.dating.sourceMedianAge ?? row.dating.start)
    .filter((age): age is number => age != null)
    .sort((a, b) => Math.abs(a - 2000) - Math.abs(b - 2000));
  return (
    <button
      className={active ? "toggle active" : "toggle"}
      aria-pressed={active}
      onClick={() =>
        model.dispatch({
          type: "patch",
          patch: active
            ? { ancestry: false }
            : {
                layer: "historical",
                clock: "model",
                year:
                  model.state.clock === "model" ? model.state.year : Math.round(ages[0] ?? 2000),
                variant,
                ancestry: true,
                datedTree: true,
              },
        })
      }
    >
      Lineage & dispersion
    </button>
  );
}
function OverlayControls({ model }: { model: WorkspaceModel }) {
  return (
    <button
      aria-pressed={model.state.contacts}
      onClick={() => model.dispatch({ type: "patch", patch: { contacts: !model.state.contacts } })}
    >
      Contact evidence
    </button>
  );
}
function LayerControl({ model }: { model: WorkspaceModel }) {
  return (
    <label>
      Source layer
      <select
        aria-label="Source layer"
        value={model.state.layer}
        onChange={(event) =>
          model.dispatch({ type: "patch", patch: { layer: event.target.value as Layer } })
        }
      >
        <option value="contemporary">Contemporary Atlas</option>
        <option value="traditional">Traditional Atlas</option>
        <option value="historical">Dated history</option>
      </select>
    </label>
  );
}
function DetailControl({ model }: { model: WorkspaceModel }) {
  return (
    <label>
      Map detail
      <select
        aria-label="Map detail"
        value={model.state.detail}
        onChange={(event) =>
          model.dispatch({ type: "patch", patch: { detail: event.target.value as Detail } })
        }
      >
        <option value="auto">Automatic</option>
        <option value="families">Families · derived unions</option>
        <option value="branches">Branches · derived unions</option>
        <option value="areas">Source observations</option>
        <option value="dialects">Documented dialect areas</option>
      </select>
    </label>
  );
}
export function EvidenceControls({ model }: { model: WorkspaceModel }) {
  const toggle = (kind: Evidence) =>
    model.dispatch({
      type: "patch",
      patch: {
        evidence: model.state.evidence.includes(kind)
          ? model.state.evidence.filter((value) => value !== kind)
          : [...model.state.evidence, kind],
      },
    });
  return (
    <fieldset className="evidence-controls">
      <legend>Evidence</legend>
      {(["map-derived", "attested", "reconstructed", "hypothesized"] as Evidence[]).map((kind) => (
        <label key={kind} className={`evidence ${kind}`}>
          <input
            type="checkbox"
            checked={model.state.evidence.includes(kind)}
            onChange={() => toggle(kind)}
          />
          {kind}
        </label>
      ))}
    </fieldset>
  );
}
