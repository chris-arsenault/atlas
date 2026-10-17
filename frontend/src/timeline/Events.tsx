import type { WorkspaceModel } from "../atlas/useWorkspace";
import type { HistoricalEvent } from "../data/schema";
import { acceptsClaim, eventYear } from "./events";
import { datingLabel, timeLabel } from "./time";

export function Events({ model }: { model: WorkspaceModel }) {
  const rows = model.release.history.events.filter(
    (event) =>
      acceptsClaim(event, model.state) && (!model.state.contacts || event.kind === "contact")
  );
  const chosen = rows.find((event) => event.id === model.state.event);
  const choose = (id: string) => {
    const event = rows.find((row) => row.id === id);
    if (!event) return;
    model.select(event.participants[0]);
    model.dispatch({ type: "patch", patch: { event: id, year: eventYear(event) } });
  };
  return (
    <section className="events" aria-label="Linguistic events">
      <label>
        Events ({rows.length}){" "}
        <select
          aria-label="Historical event"
          value={chosen?.id ?? ""}
          onChange={(event) => choose(event.target.value)}
        >
          <option value="">Choose a source event…</option>
          {rows.map((event) => (
            <option key={event.id} value={event.id}>
              {timeLabel(eventYear(event), model.state.clock)} · {event.name}
            </option>
          ))}
        </select>
      </label>
      <div className="event-markers" aria-label="Event markers">
        {rows.map((event) => (
          <button
            key={event.id}
            onClick={() => choose(event.id)}
            aria-label={event.name}
            aria-pressed={event.id === chosen?.id}
            title={`${event.name}: ${datingLabel(event.dating)}`}
          >
            ◆
          </button>
        ))}
      </div>
      {chosen && <EventDetails event={chosen} model={model} />}
      {!rows.length && (
        <small>No reviewed events for this time scale and these evidence filters.</small>
      )}
    </section>
  );
}
function EventDetails({ event, model }: { event: HistoricalEvent; model: WorkspaceModel }) {
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
