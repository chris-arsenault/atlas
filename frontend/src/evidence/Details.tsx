import { useQuery } from "@tanstack/react-query";
import type { WorkspaceModel } from "../atlas/useWorkspace";
import { loadDetail } from "../data/api";
import { detailSchema, type Languoid, type ObservationDetail } from "../data/schema";
import { ancestorIds } from "../tree/layout";
import { Attestations } from "./Attestations";
import { datingLabel, timeLabel } from "../timeline/time";
import { referenceYear } from "../atlas/state";
import { EventDetails } from "../timeline/Events";
import { acceptsClaim } from "../timeline/events";

export function Details({ model }: { model: WorkspaceModel }) {
  const node = model.state.selected ? model.nodes.get(model.state.selected) : null;
  const rows = selectedRows(model);
  const event = model.release.history.events.find(
    (row) => row.id === model.state.event && acceptsClaim(row, model.claimState)
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
      <HistoricalUse model={model} />
      {event && <EventDetails event={event} model={model} />}
      <div className="detail-actions">
        <button onClick={() => model.dispatch({ type: "patch", patch: { family: node.family } })}>
          Isolate family
        </button>
      </div>
      <h3>{model.frameEntry ? "Modeled presence" : "Geographic evidence"}</h3>
      {rows.length === 0 ? (
        <MissingArea model={model} node={node} />
      ) : (
        <ObservationList model={model} rows={rows} />
      )}
      <details>
        <summary>Classification ancestry</summary>
        <Ancestry model={model} />
      </details>
      <CatalogueDetails node={node} />
      <Attestations model={model} />
      <SourceRecords model={model} node={node} />
    </aside>
  );
}
function selectedRows(model: WorkspaceModel) {
  return model.frameEntry
    ? model.selection
    : (model.view?.observations.filter((row) => row.subject === model.state.selected) ?? []);
}
function HistoricalUse({ model }: { model: WorkspaceModel }) {
  const row =
    model.selection.find((item) => item.id === model.focusedObservation) ?? model.selection[0];
  if (!row?.model) return null;
  return (
    <p className="classification-status">
      {row.model.label !== model.nodes.get(model.state.selected ?? "")?.name
        ? `${row.model.label} · `
        : ""}
      {row.model.use}
    </p>
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
      <p className="classification-status">
        {node.iso ? `ISO ${node.iso} · ` : ""}Catalogue status: {node.status}
      </p>
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
    queryKey: ["detail", model.release.manifest.release, selected, model.frameEntry?.artifact],
    queryFn: async ({ signal }) =>
      detailSchema.parse(
        model.modeled.find((row) => row.id === selected) ??
          (await loadDetail(model.release, selected, signal))
      ),
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
              {model.modeled.find((item) => item.id === row.id)?.model?.label ?? row.id}
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
          <EvidenceText detail={detail.data} model={model} />
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
function EvidenceText({ detail, model }: { detail: ObservationDetail; model: WorkspaceModel }) {
  const date = datingLabel(detail.dating);
  return (
    <>
      <p>
        <span className={`evidence-label ${detail.evidence}`}>{detail.evidence}</span> · {date}
      </p>
      {detail.model && (
        <>
          <p>
            {detail.model.label} · {detail.model.use}
          </p>
          <p>
            Method: {detail.model.method.replaceAll("-", " ")}. The dotted envelope expresses model
            sensitivity, not a confidence percentage.
          </p>
          <ModelBasis detail={detail} model={model} />
        </>
      )}
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

function ModelBasis({ detail, model }: { detail: ObservationDetail; model: WorkspaceModel }) {
  const reference = model.release.model?.references[modelBasisSource(detail)];
  const links = Object.values(detail.model?.continuationBasis ?? {});
  return (
    <details>
      <summary>Historical basis and assumptions</summary>
      <ModelCalibration detail={detail} model={model} />
      {links.map((link) => (
        <p key={link.basis}>{link.basis}</p>
      ))}
      {reference && (
        <a href={reference.reference} target="_blank" rel="noreferrer">
          {reference.citation} ↗
        </a>
      )}
    </details>
  );
}

function modelBasisSource(detail: ObservationDetail) {
  return detail.model?.stageSource ?? detail.model?.calibration?.prior?.source ?? "";
}

function ModelCalibration({ detail, model }: { detail: ObservationDetail; model: WorkspaceModel }) {
  const calibration = detail.model?.calibration;
  if (!calibration) return null;
  const prior = calibration.prior;
  if (prior)
    return (
      <p>
        Inherited lineage anchor: {model.nodes.get(calibration.subject)?.name}, approximately{" "}
        {timeLabel(prior.year)}, with {prior.uncertaintyYears} years of temporal sensitivity.{" "}
        {prior.basis}
      </p>
    );
  return calibration.study ? (
    <p>Study chronology: {datingLabel(calibration.study.dating)}.</p>
  ) : null;
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
