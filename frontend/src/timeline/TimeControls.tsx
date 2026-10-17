import type { WorkspaceModel } from "../atlas/useWorkspace";
import { variantLabel } from "./time";

export function TimeControls({ model }: { model: WorkspaceModel }) {
  return (
    <div className="time-controls">
      <label>
        Time scale
        <select
          aria-label="Historical time scale"
          value={model.state.clock}
          onChange={(event) =>
            model.dispatch({
              type: "patch",
              patch: {
                clock: event.target.value as "calendar" | "model",
                year: event.target.value === "model" ? 2000 : 1000,
              },
            })
          }
        >
          <option value="calendar">Calendar years</option>
          <option value="model">Source model years</option>
        </select>
      </label>
      <label>
        Source / alternative
        <select
          aria-label="Reconstruction variant"
          value={model.state.variant}
          onChange={(event) =>
            model.dispatch({ type: "patch", patch: { variant: event.target.value } })
          }
        >
          <option value="all">All sources / alternatives</option>
          {model.release.manifest.coverage.variants.map((variant) => (
            <option key={variant} value={variant}>
              {variantLabel(variant)}
            </option>
          ))}
        </select>
      </label>
      <DateEntry model={model} />
      <label>
        <input
          type="checkbox"
          checked={model.state.datedTree}
          onChange={(event) =>
            model.dispatch({ type: "patch", patch: { datedTree: event.target.checked } })
          }
        />
        Dated genealogy
      </label>
    </div>
  );
}
function DateEntry({ model }: { model: WorkspaceModel }) {
  if (model.state.clock === "model")
    return (
      <label>
        Model age
        <input
          aria-label="Source model age"
          type="number"
          min="0"
          max="14000"
          value={model.state.year}
          onChange={(event) => updateYear(model, event.target.value, 0, 14000)}
        />
      </label>
    );
  const bce = model.state.year <= 0;
  const civil = bce ? 1 - model.state.year : model.state.year;
  return (
    <label>
      Year
      <input
        aria-label="Calendar year"
        type="number"
        min="1"
        max={bce ? 3000 : 2026}
        value={civil}
        onChange={(event) => updateYear(model, event.target.value, 1, bce ? 3000 : 2026, bce)}
      />
      <select
        aria-label="Calendar era"
        value={bce ? "BCE" : "CE"}
        onChange={(event) =>
          model.dispatch({
            type: "patch",
            patch: { year: event.target.value === "BCE" ? 1 - civil : civil },
          })
        }
      >
        <option value="BCE">BCE</option>
        <option value="CE">CE</option>
      </select>
    </label>
  );
}
function updateYear(
  model: WorkspaceModel,
  text: string,
  minimum: number,
  maximum: number,
  bce = false
) {
  const value = Number(text);
  if (!text || !Number.isInteger(value) || value < minimum || value > maximum) return;
  model.dispatch({ type: "patch", patch: { year: bce ? 1 - value : value } });
}
