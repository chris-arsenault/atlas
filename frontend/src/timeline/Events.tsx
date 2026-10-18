import type { WorkspaceModel } from "../atlas/useWorkspace";
import type { HistoricalEvent } from "../data/schema";
import { acceptsClaim, eventYear } from "./events";
import { datingLabel, timeLabel } from "./time";

export function Events({ model }: { model: WorkspaceModel }) {
  const rows = model.release.history.events
    .filter(
      (event) =>
        acceptsClaim(event, model.state) &&
        (!model.state.family ||
          event.participants.some((id) => model.nodes.get(id)?.family === model.state.family))
    )
    .sort((a, b) => eventYear(a) - eventYear(b));
  const chosen = rows.find((event) => event.id === model.state.event);
  const choose = (id: string) => {
    const event = rows.find((row) => row.id === id);
    if (!event) return;
    model.select(event.participants[0]);
    model.dispatch({ type: "patch", patch: { event: id, year: eventYear(event) } });
  };
  return (
    <section className="events" aria-label="Linguistic events">
      <CurrentEvidence model={model} />
      <details className="event-browser">
        <summary>Browse dated events ({rows.length})</summary>
        <label>
          Event{" "}
          <select
            aria-label="Historical event"
            value={chosen?.id ?? ""}
            onChange={(event) => choose(event.target.value)}
          >
            <option value="">Choose a source event…</option>
            {rows.map((event) => (
              <option key={event.id} value={event.id}>
                {timeLabel(eventYear(event))} · {event.name}
              </option>
            ))}
          </select>
        </label>
      </details>
      {!rows.length && <small>No reviewed events match these evidence filters.</small>}
    </section>
  );
}
function CurrentEvidence({ model }: { model: WorkspaceModel }) {
  const observations = model.view?.observations.filter((row) => row.layer === "historical") ?? [];
  const attestations = model.release.history.attestations.filter((row) =>
    model.view?.attestations.includes(row.id)
  );
  const events = model.release.history.events.filter((row) => model.view?.events.includes(row.id));
  return (
    <div className="current-evidence" aria-label="Evidence at this date">
      {observations.length > 0 && (
        <label>
          Mapped evidence{" "}
          <select
            aria-label="Mapped evidence at this date"
            value={model.focusedObservation ?? ""}
            onChange={(event) => {
              const row = observations.find((row) => row.id === event.target.value);
              if (row) model.select(row.subject, row.id);
            }}
          >
            <option value="">Inspect {observations.length} reconstructed locations…</option>
            {observations.map((row) => (
              <option key={row.id} value={row.id}>
                {model.nodes.get(row.subject)?.name ?? row.subject}
              </option>
            ))}
          </select>
        </label>
      )}
      {attestations.map((row) => (
        <button className="evidence-entry" key={row.id} onClick={() => model.select(row.subject)}>
          Written evidence · {model.nodes.get(row.subject)?.name ?? row.subject} ·{" "}
          {row.dating.label}
        </button>
      ))}
      {events.length > 0 && (
        <span className="active-event-count">
          {events.length} events overlap this date&apos;s uncertainty intervals.
        </span>
      )}
    </div>
  );
}
export function EventDetails({ event, model }: { event: HistoricalEvent; model: WorkspaceModel }) {
  const source = model.release.manifest.sources.find((row) => row.id === event.source);
  return (
    <article className="event-details" aria-label="Selected event">
      <h3>{event.name}</h3>
      <p>
        {event.kind} · {event.evidence} · {datingLabel(event.dating)}
      </p>
      <p>{event.note}</p>
      <nav aria-label="Event participants">
        {event.participants.map((id) => (
          <button key={id} onClick={() => model.select(id)}>
            {model.nodes.get(id)?.name ?? id}
          </button>
        ))}
      </nav>
      {!event.geometry && <p>Historical geography unavailable; no route is drawn.</p>}
      <p>Source locator: {event.locator}</p>
      {source && (
        <a href={source.reference} target="_blank" rel="noreferrer">
          {source.citation} ↗
        </a>
      )}
    </article>
  );
}
