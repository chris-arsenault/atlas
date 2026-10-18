import { useState } from "react";
import type { WorkspaceModel } from "../atlas/useWorkspace";
import { timeLabel } from "./time";
import { Coverage } from "./Coverage";
import { TimeControls } from "./TimeControls";
import { Playback } from "./Playback";
import { Events } from "./Events";
import { firstYear, referenceYear } from "../atlas/state";
import { EvidenceControls } from "../atlas/Controls";

export function Timeline({ model }: { model: WorkspaceModel }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className={`timeline${expanded ? " options-open" : ""}`} aria-label="Shared timeline">
      <div className="timeline-rail">
        <TimelineHeading model={model} />
        {model.state.family && (
          <button onClick={() => model.dispatch({ type: "patch", patch: { family: null } })}>
            Show all families
          </button>
        )}
        <button
          className="timeline-options-toggle"
          aria-label="Timeline options"
          aria-expanded={expanded}
          aria-controls="timeline-options"
          onClick={() => setExpanded(!expanded)}
        >
          Date & evidence
        </button>
      </div>
      <TimelineSlider model={model} />
      <Coverage model={model} />
      <Playback model={model} />
      <TimeNotice model={model} />
      <div className="timeline-evidence">
        <Events model={model} />
      </div>
      <div id="timeline-options" className="timeline-options">
        <TimeControls model={model} />
        <EvidenceControls model={model} />
      </div>
    </section>
  );
}
function TimelineHeading({ model }: { model: WorkspaceModel }) {
  const label = timeLabel(model.state.year);
  const geography = model.frameEntry ? "estimated regions" : "mapped";
  return (
    <div className="timeline-heading">
      <div>
        <span className="eyebrow">Timeline</span>
        <h2>
          <span className="timeline-date-long">{label}</span>
          <span className="timeline-date-short">{label}</span>
        </h2>
      </div>
      <p>
        {model.indexing
          ? "Updating evidence…"
          : `${model.view?.observations.length ?? 0} ${geography} · ${model.view?.attestations.length ?? 0} written · ${model.view?.events.length ?? 0} events`}
      </p>
    </div>
  );
}
function TimelineSlider({ model }: { model: WorkspaceModel }) {
  const labels = ["10,000 BCE", "7,000 BCE", "4,000 BCE", "1,000 BCE", "2007 CE"];
  return (
    <>
      <input
        type="range"
        aria-label="Historical year"
        min={firstYear}
        max={referenceYear}
        step="1"
        value={model.state.year}
        aria-valuetext={timeLabel(model.state.year)}
        onChange={(event) =>
          model.dispatch({
            type: "patch",
            patch: { year: Number(event.target.value), event: null },
          })
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
  const view = model.view;
  const hasOtherEvidence = !!view && view.attestations.length + view.events.length > 0;
  return (
    <>
      {model.state.year === referenceYear && (
        <p className="clock-note">
          Published Atlas snapshot (2007). Earlier dates show{" "}
          {model.release.model ? "modeled historical presence" : "historical evidence"}.
        </p>
      )}
      <FrameNotice model={model} />
      {!model.indexing && !model.frameError && !model.view?.observations.length && (
        <p className="coverage-gap" role="status">
          No mapped evidence for this date
          {hasOtherEvidence
            ? "; written evidence or events are available below"
            : " and these filters"}
          .
          <NearestEvidence model={model} />
        </p>
      )}
    </>
  );
}
function FrameNotice({ model }: { model: WorkspaceModel }) {
  return (
    <>
      {model.frameEntry && (
        <p className="clock-note">
          Estimated frame: {timeLabel(model.frameEntry.start)}–{timeLabel(model.frameEntry.end)}.
          Evaluated at {timeLabel(model.frameEntry.year)}; approximate regions may overlap.
        </p>
      )}
      {model.frameError && (
        <p role="alert">
          Historical frame unavailable.{" "}
          <button onClick={() => model.retryFrame()}>Retry frame</button>
        </p>
      )}
    </>
  );
}
function NearestEvidence({ model }: { model: WorkspaceModel }) {
  const year = model.view?.nearestYear;
  if (year == null || year === model.state.year) return null;
  return (
    <button onClick={() => model.dispatch({ type: "patch", patch: { year, event: null } })}>
      Go to nearest evidence · {timeLabel(year)}
    </button>
  );
}
