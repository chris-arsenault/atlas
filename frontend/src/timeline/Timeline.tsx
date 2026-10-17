import { useState } from "react";
import type { WorkspaceModel } from "../atlas/useWorkspace";
import { timeLabel } from "./time";
import { Coverage } from "./Coverage";
import { TimeControls } from "./TimeControls";
import { Playback } from "./Playback";
import { Events } from "./Events";

export function Timeline({ model }: { model: WorkspaceModel }) {
  const historical = model.state.layer === "historical";
  const [expanded, setExpanded] = useState(false);
  return (
    <section className={`timeline${expanded ? " options-open" : ""}`} aria-label="Shared timeline">
      <div className="timeline-rail">
        <TimelineHeading model={model} />
        {historical && (
          <button
            className="timeline-options-toggle"
            aria-label="Dates, sources & events"
            aria-expanded={expanded}
            aria-controls="timeline-options"
            onClick={() => setExpanded(!expanded)}
          >
            Options
          </button>
        )}
      </div>
      {historical && (
        <>
          <TimelineSlider model={model} />
          <Playback model={model} />
          <div id="timeline-options" className="timeline-options">
            <TimeControls model={model} />
            <Coverage model={model} />
            <TimeNotice model={model} />
            <Events model={model} />
          </div>
        </>
      )}
    </section>
  );
}
function TimelineHeading({ model }: { model: WorkspaceModel }) {
  const historical = model.state.layer === "historical";
  const sourceLabel =
    model.state.layer === "traditional"
      ? "Traditional reference periods"
      : "Contemporary source layer";
  const label = historical ? timeLabel(model.state.year, model.state.clock) : sourceLabel;
  const compactLabel =
    historical && model.state.clock === "model"
      ? `${model.state.year.toLocaleString()} model yr`
      : label;
  return (
    <div className="timeline-heading">
      <div>
        <span className="eyebrow">Timeline</span>
        <h2>
          <span className="timeline-date-long">{label}</span>
          <span className="timeline-date-short">{compactLabel}</span>
        </h2>
      </div>
      {historical ? (
        <p>{model.view?.observations.length ?? 0} supported observations at this date</p>
      ) : (
        <button onClick={() => model.dispatch({ type: "patch", patch: { layer: "historical" } })}>
          Explore timeline
        </button>
      )}
    </div>
  );
}
function TimelineSlider({ model }: { model: WorkspaceModel }) {
  const direction = model.state.clock === "model" ? -1 : 1;
  const minimum = direction === -1 ? -14000 : -2999;
  const maximum = direction === -1 ? 0 : 2026;
  const labels =
    direction === -1
      ? ["14,000 model yr", "10,500", "7,000", "3,500", "Model present (0)"]
      : ["3000 BCE", "1500 BCE", "1 CE", "1500 CE", "Present"];
  return (
    <>
      <input
        type="range"
        aria-label="Historical year"
        min={minimum}
        max={maximum}
        step="1"
        disabled={model.state.layer !== "historical"}
        value={direction * model.state.year}
        onChange={(event) =>
          model.dispatch({ type: "patch", patch: { year: direction * Number(event.target.value) } })
        }
      />
      <div className="timeline-labels">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </>
  );
}
function TimeNotice({ model }: { model: WorkspaceModel }) {
  return (
    <>
      {model.state.clock === "model" && (
        <p className="clock-note">
          Source model years have no asserted calendar epoch. Age intervals mark possible node
          dates, not continuous occupation.
        </p>
      )}
      {!model.indexing && !model.view?.observations.length && (
        <p className="coverage-gap" role="status">
          No supported geographic observations for this date and these filters. Unknown regions
          remain unfilled.
        </p>
      )}
    </>
  );
}
