import type { Dating, HistoricalEvent } from "../data/schema";
import type { AtlasState } from "../atlas/state";
import { estimatedYear } from "./time";

export function acceptsClaim(
  row: { evidence: string; variant: string | null; dating: Dating },
  state: AtlasState
) {
  return (
    state.evidence.some((kind) => kind === row.evidence) &&
    (!row.variant || state.variant === "all" || row.variant === state.variant) &&
    row.dating.clock !== "model"
  );
}
export function eventYear(event: HistoricalEvent) {
  return estimatedYear(event.dating);
}
export function nextBoundary(years: number[], state: AtlasState, backwards = false) {
  const direction = backwards ? -1 : 1;
  const candidates = years.filter((year) => (year - state.year) * direction > 0);
  return candidates.sort((a, b) => (a - b) * direction)[0] ?? null;
}
