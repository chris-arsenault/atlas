import type { WorkspaceModel } from "./useWorkspace";
import type { Evidence } from "./state";

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
