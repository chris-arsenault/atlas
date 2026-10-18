import type { Languoid, Observation, Release, Dating } from "../data/schema";
import type { AtlasState } from "./state";
import { firstYear, referenceYear } from "./state";
import { dateBoundaries } from "../timeline/time";

export function activeDate(dating: Dating, year: number): boolean {
  if (dating.clock === "model" || dating.kind === "undated") return false;
  if (dating.kind === "reference") return dating.year === year;
  return (
    (dating.start == null || year >= dating.start) && (dating.end == null || year <= dating.end)
  );
}
export class CatalogueIndex {
  readonly nodes: Map<string, Languoid>;
  readonly children = new Map<string, string[]>();
  private readonly text = new Map<string, string>();
  constructor(nodes: Languoid[]) {
    this.nodes = new Map(nodes.map((node) => [node.id, node]));
    for (const node of nodes) {
      if (node.parent)
        this.children.set(node.parent, [...(this.children.get(node.parent) ?? []), node.id]);
      this.text.set(
        node.id,
        [node.name, node.id, node.glottocode, node.iso, ...node.aliases]
          .join(" ")
          .normalize("NFKD")
          .toLowerCase()
      );
    }
  }
  ancestors(id: string): string[] {
    const result: string[] = [];
    let next: string | null = id;
    while (next && !result.includes(next)) {
      result.push(next);
      next = this.nodes.get(next)?.parent ?? null;
    }
    return result;
  }
  descendants(id: string | null): string[] {
    if (id === null) return [];
    const queue = [id],
      seen = new Set<string>();
    while (queue.length) {
      const current = queue.pop();
      if (!current || seen.has(current)) continue;
      seen.add(current);
      queue.push(...(this.children.get(current) ?? []));
    }
    return [...seen];
  }
  search(query: string): Languoid[] {
    const term = query.trim().normalize("NFKD").toLowerCase();
    if (!term) return [];
    return [...this.nodes.values()]
      .filter((node) => this.text.get(node.id)?.includes(term))
      .sort((a, b) => score(a, term) - score(b, term) || a.name.localeCompare(b.name))
      .slice(0, 30);
  }
}
function score(node: Languoid, term: string) {
  if (node.id === term || node.iso === term || node.name.toLowerCase() === term) return 0;
  return node.name.toLowerCase().startsWith(term) ? 1 : 2;
}
export function activeObservations(
  observations: Observation[],
  state: AtlasState,
  index: CatalogueIndex
) {
  const isolated = state.family ? isolatedSubjects(index, state.family) : null;
  return observations.filter((row) => {
    if (isolated && !isolated.has(row.subject)) return false;
    if (!state.evidence.includes(row.evidence)) return false;
    if (row.variant && state.variant !== "all" && row.variant !== state.variant) return false;
    return row.layer === "contemporary"
      ? state.year === referenceYear
      : row.layer !== "traditional" && activeDate(row.dating, state.year);
  });
}
function isolatedSubjects(index: CatalogueIndex, family: string) {
  return new Set([
    ...index.descendants(family),
    ...[...index.nodes.values()].filter((node) => node.family === family).map((node) => node.id),
  ]);
}
export interface Query {
  type: "search";
  text: string;
}
export interface ViewQuery {
  type: "view";
  state: AtlasState;
}
export interface ViewResult {
  subjects: string[];
  observations: Observation[];
  coverage: number[];
  attestations: string[];
  events: string[];
  nearestYear: number | null;
  boundaries: number[];
}
export function query(
  index: CatalogueIndex,
  release: Pick<Release, "observations" | "history">,
  request: Query | ViewQuery
): Languoid[] | ViewResult {
  if (request.type === "search") return index.search(request.text);
  const rows = datedEvidence(release, request.state, index);
  const active = (row: { dating: Dating }) => activeDate(row.dating, request.state.year);
  const dates = rows.flatMap((row) =>
    row.dating.kind === "reference"
      ? [row.dating.year!]
      : [row.dating.start, row.dating.end].filter((year): year is number => year != null)
  );
  const nearestYear =
    dates
      .filter((year) => year >= firstYear && year <= referenceYear)
      .sort((a, b) => Math.abs(a - request.state.year) - Math.abs(b - request.state.year))[0] ??
    null;
  return {
    subjects: index.descendants(request.state.selected),
    observations: activeObservations(release.observations, request.state, index),
    coverage: coverage(rows),
    attestations: release.history.attestations
      .filter((row) => rows.includes(row) && active(row))
      .map((row) => row.id),
    events: release.history.events
      .filter((row) => rows.includes(row) && active(row))
      .map((row) => row.id),
    nearestYear,
    boundaries: dateBoundaries(rows),
  };
}
function datedEvidence(
  release: Pick<Release, "observations" | "history">,
  state: AtlasState,
  index: CatalogueIndex
) {
  const subjects = state.family ? isolatedSubjects(index, state.family) : null;
  return [
    ...release.observations.filter((row) => row.layer !== "traditional"),
    ...release.history.attestations,
    ...release.history.events,
  ].filter(
    (row) =>
      state.evidence.includes(row.evidence) &&
      (!row.variant || state.variant === "all" || row.variant === state.variant) &&
      (!subjects ||
        ("subject" in row
          ? subjects.has(row.subject)
          : row.participants.some((id) => subjects.has(id)))) &&
      row.dating.clock !== "model" &&
      row.dating.kind !== "undated"
  );
}
function coverage(rows: { dating: Dating }[]) {
  const span = (referenceYear - firstYear + 1) / 64;
  return Array.from({ length: 64 }, (_, position) => {
    const start = firstYear + span * position;
    const end = start + span;
    return rows.filter(({ dating }) => {
      const low = dating.kind === "reference" ? dating.year! : (dating.start ?? firstYear);
      const high = dating.kind === "reference" ? dating.year! : (dating.end ?? referenceYear);
      return low < end && high >= start;
    }).length;
  });
}
