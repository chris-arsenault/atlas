import type { WorkspaceModel } from "../atlas/useWorkspace";
import { activeDate } from "../atlas/index";
import { datingLabel } from "../timeline/time";

export function Attestations({ model }: { model: WorkspaceModel }) {
  const claims = model.release.history.attestations.filter(
    (row) =>
      row.subject === model.state.selected &&
      model.state.evidence.includes(row.evidence) &&
      (!row.variant || model.state.variant === "all" || row.variant === model.state.variant)
  );
  if (!claims.length) return null;
  return (
    <section className="attestations" aria-label="Textual attestations">
      <h3>Textual attestations</h3>
      {claims.map((claim) => {
        const source = model.release.manifest.sources.find((row) => row.id === claim.source);
        return (
          <article key={claim.id}>
            <h4>{claim.dating.label}</h4>
            <p>{datingLabel(claim.dating)}</p>
            <p>{claim.note}</p>
            <p className="claim-state">
              {activeDate(claim.dating, model.state.year, model.state.clock)
                ? "Within this proposed date interval"
                : "Outside this proposed date interval"}
            </p>
            {source && (
              <a href={source.reference} target="_blank" rel="noreferrer">
                {source.citation} ↗
              </a>
            )}
          </article>
        );
      })}
    </section>
  );
}
