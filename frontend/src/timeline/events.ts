import type { Dating, HistoricalEvent, History } from "../data/schema";
import type { AtlasState } from "../atlas/state";
import { timelineBounds } from "./time";

export function acceptsClaim(
  row: { evidence: string; variant: string | null; dating: Dating },
  state: AtlasState
) {
  return (
    state.evidence.some((kind) => kind === row.evidence) &&
    (!row.variant || state.variant === "all" || row.variant === state.variant) &&
    (row.dating.clock ?? "calendar") === state.clock
  );
}
export function eventYear(event: HistoricalEvent) {
  return Math.round(event.dating.sourceMedianAge ?? event.dating.start ?? event.dating.end ?? 0);
}
export function evidenceBoundaries(history: History, state: AtlasState) {
  const [minimum, maximum] = timelineBounds(state.clock);
  const claims = [...history.observations, ...history.attestations, ...history.events];
  const years = claims
    .filter((row) => acceptsClaim(row, state))
    .flatMap((row) => {
      const { start, end } = row.dating;
      return [start, end == null ? null : end + 1].filter((year): year is number => year != null);
    });
  return [...new Set([minimum, maximum, ...years])]
    .filter((year) => year >= minimum && year <= maximum)
    .sort((a, b) => (state.clock === "model" ? b - a : a - b));
}
export function nextBoundary(years: number[], state: AtlasState, backwards = false) {
  const direction = (state.clock === "model" ? -1 : 1) * (backwards ? -1 : 1);
  const candidates = years.filter((year) => (year - state.year) * direction > 0);
  return candidates.sort((a, b) => (a - b) * direction)[0] ?? null;
}
