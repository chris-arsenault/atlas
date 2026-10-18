import type { WorkspaceModel } from "../atlas/useWorkspace";
import { variantLabel } from "./time";
import { firstYear, referenceYear } from "../atlas/state";

export function TimeControls({ model }: { model: WorkspaceModel }) {
  return (
    <div className="time-controls">
      <DateEntry model={model} />
      <label>
        Reconstruction
        <select
          aria-label="Reconstruction variant"
          value={model.state.variant}
          onChange={(event) =>
            model.dispatch({ type: "patch", patch: { variant: event.target.value } })
          }
        >
          <option value="all">
            {model.release.model ? "Preferred reconstruction" : "All sources / alternatives"}
          </option>
          {(model.release.model
            ? Object.keys(model.release.model.scenarios)
            : model.release.manifest.coverage.variants
          ).map((variant) => (
            <option key={variant} value={variant}>
              {variantLabel(variant)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={model.state.ancestry}
          onChange={(event) =>
            model.dispatch({ type: "patch", patch: { ancestry: event.target.checked } })
          }
        />{" "}
        Ancestry links
      </label>
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
  const bce = model.state.year <= 0;
  const civil = bce ? 1 - model.state.year : model.state.year;
  return (
    <label>
      Year
      <input
        aria-label="Calendar year"
        type="number"
        min="1"
        max={bce ? 1 - firstYear : referenceYear}
        value={civil}
        onChange={(event) =>
          updateYear(model, event.target.value, 1, bce ? 1 - firstYear : referenceYear, bce)
        }
      />
      <select
        aria-label="Calendar era"
        value={bce ? "BCE" : "CE"}
        onChange={(event) =>
          model.dispatch({
            type: "patch",
            patch: {
              year: Math.max(
                firstYear,
                Math.min(referenceYear, event.target.value === "BCE" ? 1 - civil : civil)
              ),
            },
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
