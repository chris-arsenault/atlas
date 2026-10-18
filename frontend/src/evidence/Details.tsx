import { useQuery } from "@tanstack/react-query";
import type { WorkspaceModel } from "../atlas/useWorkspace";
import { loadDetail } from "../data/api";
import { detailSchema, type Languoid, type ObservationDetail } from "../data/schema";
import { ancestorIds } from "../tree/layout";
import { Attestations } from "./Attestations";
import { datingLabel } from "../timeline/time";
import { referenceYear } from "../atlas/state";
import { EventDetails } from "../timeline/Events";
import { acceptsClaim } from "../timeline/events";

export function Details({ model }: { model: WorkspaceModel }) {
  const node = model.state.selected ? model.nodes.get(model.state.selected) : null;
  const rows = model.view?.observations.filter((row) => row.subject === node?.id) ?? [];
  const event = model.release.history.events.find(
    (row) => row.id === model.state.event && acceptsClaim(row, model.state)
  );
  if (!node) return null;
  return (
    <aside className="details" aria-label="Selected language details">
      <div className="pane-heading">
        <span className="eyebrow">
          {node.kind} · {node.glottocode ?? "Reconstruction"}
        </span>
        <button aria-label="Clear selection" onClick={() => model.select(null)}>
          ×
        </button>
      </div>
      <h2>{node.name}</h2>
      <p className="classification-status">
        {node.iso ? `ISO ${node.iso} · ` : ""}
        {node.status}
      </p>
      <Ancestry model={model} />
      {event && <EventDetails event={event} model={model} />}
      <div className="detail-actions">
        <button onClick={() => model.dispatch({ type: "patch", patch: { family: node.family } })}>
          Isolate family
        </button>
      </div>
      <h3>Geographic evidence</h3>
      {rows.length === 0 ? (
        <MissingArea model={model} node={node} />
      ) : (
        <ObservationList model={model} rows={rows} />
      )}
      <CatalogueDetails node={node} />
      <Attestations model={model} />
      <SourceRecords model={model} node={node} />
    </aside>
  );
}
function MissingArea({ model, node }: { model: WorkspaceModel; node: Languoid }) {
  return (
    <p role="status">
      No mapped evidence for this selection at this date.
      {node.point && model.state.year === referenceYear
        ? " The map shows a catalogue coordinate, not an inferred territory."
        : ""}
    </p>
  );
}
function CatalogueDetails({ node }: { node: Languoid }) {
  return (
    <>
      <h3>Catalogue</h3>
      {node.glottocode && !node.id.startsWith("atlas:") && (
        <a
          href={`https://glottolog.org/resource/languoid/id/${node.glottocode}`}
          target="_blank"
          rel="noreferrer"
        >
          Inspect Glottolog record ↗
        </a>
      )}
      <details>
        <summary>Alternative names ({node.aliases.length})</summary>
        <p>{node.aliases.join(" · ") || "No alternative names supplied."}</p>
      </details>
    </>
  );
}
function Ancestry({ model }: { model: WorkspaceModel }) {
  return (
    <nav aria-label="Selected ancestry" className="ancestry">
      <ol>
        {ancestorIds(model.nodes, model.state.selected)
          .reverse()
          .map((id) => (
            <li key={id}>
              <button onClick={() => model.select(id)}>{model.nodes.get(id)?.name}</button>
            </li>
          ))}
      </ol>
    </nav>
  );
}
function ObservationList({
  model,
  rows,
}: {
  model: WorkspaceModel;
  rows: NonNullable<WorkspaceModel["view"]>["observations"];
}) {
  const selected = rows.find((row) => row.id === model.focusedObservation)?.id ?? rows[0].id;
  const detail = useQuery({
    queryKey: ["detail", model.release.manifest.release, selected],
    queryFn: async ({ signal }) =>
      detailSchema.parse(await loadDetail(model.release, selected, signal)),
    staleTime: Infinity,
  });
  const source = model.release.manifest.sources.find((row) => row.id === detail.data?.source);
  return (
    <div className="observation-details">
      <label>
        Observation
        <select
          aria-label="Geographic observation"
          value={selected}
          onChange={(event) => model.setFocusedObservation(event.target.value)}
        >
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.id}
            </option>
          ))}
        </select>
      </label>
      {detail.isPending && <p role="status">Loading source details…</p>}
      {detail.error && (
        <p role="alert">
          Source details unavailable. <button onClick={() => detail.refetch()}>Retry</button>
        </p>
      )}
      {detail.data && (
        <>
          <EvidenceText detail={detail.data} />
          <details>
            <summary>Source locator and transformations</summary>
            <pre>{JSON.stringify(detail.data.locator, null, 2)}</pre>
            <p>{detail.data.transformations.join("; ") || "No geometry repair."}</p>
          </details>
          {source && (
            <a href={source.reference} target="_blank" rel="noreferrer">
              {source.citation} ↗
            </a>
          )}
        </>
      )}
    </div>
  );
}
function EvidenceText({ detail }: { detail: ObservationDetail }) {
  const date = datingLabel(detail.dating);
  return (
    <>
      <p>
        <span className={`evidence-label ${detail.evidence}`}>{detail.evidence}</span> · {date}
      </p>
      <p>{detail.geographicUncertainty}</p>
      <p>{detail.note}</p>
      {detail.dating.sourceCalendarEpoch != null && (
        <p>
          Calendar dates use the source&apos;s {detail.dating.sourceCalendarEpoch} CE epoch.
          Original model age: {detail.dating.sourceMedianAge?.toLocaleString() ?? "not supplied"}{" "}
          years; source interval: {detail.dating.sourceAgeInterval?.join("–") ?? "not supplied"}.
          Date uncertainty does not establish continuous occupation.
        </p>
      )}
      {detail.posterior != null && (
        <p>
          Source clade posterior support: {detail.posterior.toFixed(3)}. Date and geography have
          separate uncertainty.
        </p>
      )}
    </>
  );
}
function SourceRecords({ model, node }: { model: WorkspaceModel; node: Languoid }) {
  const rows = model.release.observations.filter((row) => row.subject === node.id);
  const related = model.release.nodes.filter(
    (sample) => sample.glottocode === node.id && sample.id !== node.id
  );
  return (
    <details className="source-records">
      <summary>All source records ({rows.length}) & related reconstructions</summary>
      <p>
        Undated and traditional source records remain available here; they are not assigned calendar
        territories.
      </p>
      {rows.map((row) => (
        <p key={row.id}>
          <button onClick={() => model.setFocusedObservation(row.id)}>
            {row.layer === "traditional" ? "Traditional source" : row.id} ·{" "}
            {datingLabel(row.dating)}
          </button>
        </p>
      ))}
      {model.focusedObservation &&
        rows.some((row) => row.id === model.focusedObservation) &&
        !model.view?.observations.some((row) => row.id === model.focusedObservation) && (
          <ObservationList
            model={model}
            rows={rows.filter((row) => row.id === model.focusedObservation)}
          />
        )}
      {related.map((sample) => (
        <p key={sample.id}>
          <button onClick={() => model.select(sample.id)}>{sample.name}</button>
        </p>
      ))}
    </details>
  );
}
