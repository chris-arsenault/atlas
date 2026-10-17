export type Layer = "contemporary" | "traditional" | "historical";
export type Evidence = "map-derived" | "attested" | "reconstructed" | "hypothesized";
export type Detail = "auto" | "families" | "branches" | "areas" | "dialects";
export interface AtlasState {
  selected: string | null;
  family: string | null;
  layer: Layer;
  year: number;
  clock: "calendar" | "model";
  evidence: Evidence[];
  variant: string;
  camera: [number, number, number];
  detail: Detail;
  globe: boolean;
  ancestry: boolean;
  contacts: boolean;
  datedTree: boolean;
  event: string | null;
}
export type Action =
  { type: "select"; id: string | null } | { type: "patch"; patch: Partial<AtlasState> };
export const defaultState: AtlasState = {
  selected: null,
  family: null,
  layer: "contemporary",
  year: 2007,
  clock: "calendar",
  evidence: ["map-derived", "attested", "reconstructed", "hypothesized"],
  variant: "all",
  camera: [30, 22, 1.4],
  detail: "auto",
  globe: false,
  ancestry: false,
  contacts: false,
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
  const layer = params.get("layer");
  const detail = params.get("detail");
  const { clock, year } = queryTime(params);
  const evidence = params
    .getAll("evidence")
    .filter((v): v is Evidence => defaultState.evidence.includes(v as Evidence));
  return {
    ...defaultState,
    selected: params.get("language"),
    family: params.get("family"),
    layer: layer === "traditional" || layer === "historical" ? layer : "contemporary",
    detail:
      detail === "families" || detail === "branches" || detail === "areas" || detail === "dialects"
        ? detail
        : "auto",
    year,
    clock,
    evidence: params.has("evidence") ? evidence : defaultState.evidence,
    variant: params.get("variant") ?? "all",
    camera: [
      bounded(params.get("lng"), 30, -180, 180),
      bounded(params.get("lat"), 22, -85, 85),
      bounded(params.get("zoom"), 1.4, 0, 18),
    ],
    globe: params.get("globe") === "1",
    ancestry: params.get("ancestry") === "1",
    contacts: params.get("contacts") === "1",
    datedTree: params.get("datedTree") === "1",
    event: params.get("event"),
  };
}
function queryTime(params: URLSearchParams) {
  const clock: AtlasState["clock"] = params.get("clock") === "model" ? "model" : "calendar";
  const min = clock === "model" ? 0 : -2999;
  const max = clock === "model" ? 14000 : 2026;
  return { clock, year: Math.round(bounded(params.get("year"), 2007, min, max)) };
}
export function toUrl(state: AtlasState): string {
  const params = new URLSearchParams();
  if (state.selected) params.set("language", state.selected);
  if (state.family) params.set("family", state.family);
  if (state.event) params.set("event", state.event);
  params.set("layer", state.layer);
  params.set("year", String(state.year));
  params.set("clock", state.clock);
  params.set("detail", state.detail);
  for (const kind of state.evidence) params.append("evidence", kind);
  if (!state.evidence.length) params.set("evidence", "");
  params.set("variant", state.variant);
  ["lng", "lat", "zoom"].forEach((key, index) =>
    params.set(key, String(Math.round(state.camera[index] * 100) / 100))
  );
  for (const key of ["globe", "ancestry", "contacts", "datedTree"] as const)
    if (state[key]) params.set(key, "1");
  return `?${params}`;
}
export function yearLabel(year: number) {
  return year <= 0 ? `${1 - year} BCE` : `${year} CE`;
}
