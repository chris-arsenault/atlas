import type { Languoid, Observation, Release, Dating } from "../data/schema";
import type { AtlasState } from "./state";

export function activeDate(
  dating: Dating,
  year: number,
  clock: "calendar" | "model" = "calendar"
): boolean {
  if ((dating.clock ?? "calendar") !== clock) return false;
  if (dating.kind === "undated" || dating.kind === "reference") return false;
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
    return state.layer === "historical"
      ? row.layer === "historical" && activeDate(row.dating, state.year, state.clock)
      : row.layer === state.layer;
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
}
export function query(
  index: CatalogueIndex,
  release: Pick<Release, "observations" | "history">,
  request: Query | ViewQuery
): Languoid[] | ViewResult {
  if (request.type === "search") return index.search(request.text);
  return {
    subjects: index.descendants(request.state.selected),
    observations: activeObservations(release.observations, request.state, index),
    coverage: coverage(release, request.state, index),
  };
}
function coverage(
  release: Pick<Release, "observations" | "history">,
  state: AtlasState,
  index: CatalogueIndex
) {
  const minimum = state.clock === "model" ? 0 : -2999;
  const maximum = state.clock === "model" ? 14000 : 2026;
  const subjects = state.family ? isolatedSubjects(index, state.family) : null;
  const rows = [...release.observations, ...release.history.attestations].filter(
    (row) =>
      state.evidence.includes(row.evidence) &&
      (!row.variant || state.variant === "all" || row.variant === state.variant) &&
      (!subjects || subjects.has(row.subject))
  );
  return Array.from({ length: 64 }, (_, position) => {
    const year = minimum + ((maximum - minimum) * (position + 0.5)) / 64;
    return rows.filter((row) => activeDate(row.dating, year, state.clock)).length;
  });
}
