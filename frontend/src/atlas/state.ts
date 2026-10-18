export type Evidence = "map-derived" | "attested" | "reconstructed" | "hypothesized";
export const firstYear = -9999;
export const referenceYear = 2007;
export interface AtlasState {
  selected: string | null;
  family: string | null;
  year: number;
  evidence: Evidence[];
  variant: string;
  camera: [number, number, number];
  ancestry: boolean;
  datedTree: boolean;
  event: string | null;
}
export type Action =
  { type: "select"; id: string | null } | { type: "patch"; patch: Partial<AtlasState> };
export const defaultState: AtlasState = {
  selected: null,
  family: null,
  year: referenceYear,
  evidence: ["map-derived", "attested", "reconstructed", "hypothesized"],
  variant: "all",
  camera: [30, 22, 1.4],
  ancestry: false,
  datedTree: false,
  event: null,
};
export function reducer(state: AtlasState, action: Action): AtlasState {
  return action.type === "select"
    ? { ...state, selected: action.id }
    : { ...state, ...action.patch };
}
function bounded(value: string | null, fallback: number, min: number, max: number) {
  const number = value === null ? fallback : Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
export function fromUrl(search: string): AtlasState {
  const params = new URLSearchParams(search);
  const year = params.get("clock") === "model" ? null : params.get("year");
  const evidence = params
    .getAll("evidence")
    .filter((v): v is Evidence => defaultState.evidence.includes(v as Evidence));
  return {
    ...defaultState,
    selected: params.get("language"),
    family: params.get("family"),
    year: Math.round(bounded(year, referenceYear, firstYear, referenceYear)),
    evidence: params.has("evidence") ? evidence : defaultState.evidence,
    variant: params.get("variant") ?? "all",
    camera: [
      bounded(params.get("lng"), 30, -180, 180),
      bounded(params.get("lat"), 22, -85, 85),
      bounded(params.get("zoom"), 1.4, 0, 18),
    ],
    ancestry: params.get("ancestry") === "1",
    datedTree: params.get("datedTree") === "1",
    event: params.get("event"),
  };
}
export function toUrl(state: AtlasState): string {
  const params = new URLSearchParams();
  if (state.selected) params.set("language", state.selected);
  if (state.family) params.set("family", state.family);
  if (state.event) params.set("event", state.event);
  params.set("year", String(state.year));
  for (const kind of state.evidence) params.append("evidence", kind);
  if (!state.evidence.length) params.set("evidence", "");
  if (state.variant !== "all") params.set("variant", state.variant);
  ["lng", "lat", "zoom"].forEach((key, index) =>
    params.set(key, String(Math.round(state.camera[index] * 100) / 100))
  );
  for (const key of ["ancestry", "datedTree"] as const) if (state[key]) params.set(key, "1");
  return `?${params}`;
}
export function yearLabel(year: number) {
  return year <= 0 ? `${(1 - year).toLocaleString()} BCE` : `${year} CE`;
}
