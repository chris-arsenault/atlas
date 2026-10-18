import { yearLabel, firstYear, referenceYear } from "../atlas/state";
import type { Dating } from "../data/schema";

export function timeLabel(year: number) {
  return yearLabel(year);
}
export function datingLabel(dating: Dating): string {
  if (dating.kind === "undated") return "Undated";
  if (dating.clock === "model") return "Calendar date unavailable";
  if (dating.kind === "reference") return `Reference: ${timeLabel(dating.year!)}`;
  const start = dating.start == null ? "unknown" : timeLabel(dating.start);
  const end = dating.end == null ? "unknown" : timeLabel(dating.end);
  return `${start} – ${end}`;
}
export function estimatedYear(dating: Dating) {
  return dating.year ?? dating.start ?? dating.end ?? 0;
}
export function timelineBounds(): [number, number] {
  return [firstYear, referenceYear];
}
export function dateBoundaries(rows: { dating: Dating }[]) {
  const years = rows.flatMap(({ dating }) =>
    dating.kind === "reference"
      ? [dating.year]
      : [dating.start, dating.end == null ? null : dating.end + 1]
  );
  return [...new Set([firstYear, referenceYear, ...years])]
    .filter((year): year is number => year != null && year >= firstYear && year <= referenceYear)
    .sort((a, b) => a - b);
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
