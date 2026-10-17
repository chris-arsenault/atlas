import { expect, it } from "vitest";
import { CatalogueIndex, activeDate, activeObservations } from "./index";
import { defaultState, fromUrl, toUrl, yearLabel } from "./state";
import type { Languoid, Observation } from "../data/schema";

const node = (id: string, parent: string | null): Languoid => ({
  id,
  parent,
  name: id,
  aliases: ["Bangla"],
  kind: parent ? "language" : "family",
  family: "root",
  glottocode: id,
  iso: null,
  point: null,
  status: "unknown",
  bookkeeping: false,
  sources: [],
});
it("selects descendants without assigning a subgroup's area to every language", () => {
  const index = new CatalogueIndex([
    node("root", null),
    node("bengali", "root"),
    node("other", "root"),
  ]);
  expect(index.descendants("root").sort()).toEqual(["bengali", "other", "root"]);
  expect(index.ancestors("bengali")).toEqual(["bengali", "root"]);
  expect(index.search("bangla")).toHaveLength(3);
  const rows: Observation[] = [
    {
      id: "area",
      subject: "root",
      layer: "contemporary",
      dating: { kind: "reference", year: 2007 },
      evidence: "map-derived",
      variant: null,
    },
  ];
  expect(activeObservations(rows, defaultState, index)[0].subject).toBe("root");
});
it("keeps undated and reference-only areas out of historical time", () => {
  expect(activeDate({ kind: "reference", year: 2007 }, 2007)).toBe(false);
  expect(activeDate({ kind: "undated" }, -2999)).toBe(false);
  expect(activeDate({ kind: "uncertain", start: -1, end: 1 }, 0)).toBe(true);
  expect(activeDate({ kind: "validity", start: null, end: 0 }, 1)).toBe(false);
  expect([yearLabel(-1), yearLabel(0), yearLabel(1)]).toEqual(["2 BCE", "1 BCE", "1 CE"]);
});
it("keeps model clocks, alternatives, and evidence independent", () => {
  const index = new CatalogueIndex([node("root", null)]);
  const row: Observation = {
    id: "reconstruction",
    subject: "root",
    layer: "historical",
    variant: "model-a",
    evidence: "reconstructed",
    dating: { kind: "uncertain", clock: "model", start: 500, end: 1000 },
  };
  const state = { ...defaultState, layer: "historical" as const, year: 800 };
  expect(activeObservations([row], state, index)).toHaveLength(0);
  expect(activeObservations([row], { ...state, clock: "model" }, index)).toHaveLength(1);
  expect(
    activeObservations([row], { ...state, clock: "model", variant: "model-b" }, index)
  ).toHaveLength(0);
  expect(activeObservations([row], { ...state, clock: "model", evidence: [] }, index)).toHaveLength(
    0
  );
});
it("restores shared state and rejects invalid camera values", () => {
  const state = {
    ...defaultState,
    selected: "beng1280",
    year: 0,
    layer: "historical" as const,
    camera: [90, 24, 5] as [number, number, number],
    evidence: [],
  };
  expect(fromUrl(toUrl(state))).toEqual(state);
  expect(fromUrl("?zoom=NaN&lat=999").camera).toEqual([30, 85, 1.4]);
});
