import type { AtlasState } from "../atlas/state";
import { yearLabel } from "../atlas/state";
import type { Dating } from "../data/schema";

export function timeLabel(year: number, clock: AtlasState["clock"]) {
  return clock === "model"
    ? `${year.toLocaleString()} model years before present`
    : yearLabel(year);
}
export function datingLabel(dating: Dating): string {
  if (dating.kind === "undated") return "Undated";
  const clock = dating.clock ?? "calendar";
  if (dating.kind === "reference") return `Reference: ${timeLabel(dating.year!, clock)}`;
  const start = dating.start == null ? "unknown" : timeLabel(dating.start, clock);
  const end = dating.end == null ? "unknown" : timeLabel(dating.end, clock);
  return `${start} – ${end}`;
}
export function timelineBounds(clock: AtlasState["clock"]): [number, number] {
  return clock === "model" ? [0, 14000] : [-2999, 2026];
}
export function variantLabel(variant: string) {
  const labels: Record<string, string> = {
    all: "All sources / alternatives",
    bouckaert: "Bouckaert et al. (2012)",
    chang: "Chang et al. (2015)",
    "charyapada-main": "Charyapada: 9th–11th centuries",
    "charyapada-earlier": "Charyapada: earlier chronology",
  };
  return labels[variant] ?? variant;
}
