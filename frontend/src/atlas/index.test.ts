import { expect, it } from "vitest";
import { CatalogueIndex, activeDate, activeObservations, query, type ViewResult } from "./index";
import { defaultState, fromUrl, toUrl, yearLabel } from "./state";
import type { Languoid, Observation, History } from "../data/schema";

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
it("shows reference snapshots only at their date and never assigns a date to undated areas", () => {
  expect(activeDate({ kind: "reference", year: 2007 }, 2007)).toBe(true);
  expect(activeDate({ kind: "reference", year: 2007 }, 2006)).toBe(false);
  expect(activeDate({ kind: "undated" }, -2999)).toBe(false);
  expect(activeDate({ kind: "uncertain", start: -1, end: 1 }, 0)).toBe(true);
  expect(activeDate({ kind: "validity", start: null, end: 0 }, 1)).toBe(false);
  expect([yearLabel(-1), yearLabel(0), yearLabel(1)]).toEqual(["2 BCE", "1 BCE", "1 CE"]);
});
it("filters published calendar dates and leaves unknown source clocks off the timeline", () => {
  const index = new CatalogueIndex([node("root", null)]);
  const row: Observation = {
    id: "reconstruction",
    subject: "root",
    layer: "historical",
    variant: "bouckaert",
    evidence: "reconstructed",
    dating: { kind: "uncertain", clock: "model", start: 500, end: 1000 },
  };
  const state = { ...defaultState, year: 1200 };
  expect(activeObservations([row], state, index)).toHaveLength(0);
  const dated: Observation = {
    ...row,
    dating: { kind: "uncertain", clock: "calendar", start: 1000, end: 1500, year: 1200 },
  };
  expect(activeObservations([dated], state, index)).toHaveLength(1);
  expect(activeObservations([dated], { ...state, variant: "chang" }, index)).toHaveLength(0);
  expect(activeObservations([dated], { ...state, evidence: [] }, index)).toHaveLength(0);
});
it("restores shared state and rejects invalid camera values", () => {
  const state = {
    ...defaultState,
    selected: "beng1280",
    year: 0,
    camera: [90, 24, 5] as [number, number, number],
    evidence: [],
  };
  expect(fromUrl(toUrl(state))).toEqual(state);
  expect(fromUrl("?zoom=NaN&lat=999").camera).toEqual([30, 85, 1.4]);
  expect(fromUrl("?clock=model&year=1144&layer=historical").year).toBe(2007);
  expect(toUrl(state)).not.toMatch(/clock|layer/);
});
it("counts narrow dated evidence in coverage and keeps playback within the same filters", () => {
  const index = new CatalogueIndex([node("root", null)]);
  const history: History = {
    observations: [],
    relationships: [],
    events: [],
    attestations: [
      {
        id: "text",
        subject: "root",
        source: "source",
        locator: "p. 1",
        variant: null,
        dating: { kind: "uncertain", start: 1, end: 1 },
        evidence: "attested",
        note: "Single-year evidence",
      },
    ],
  };
  const view = query(
    index,
    { observations: [], history },
    { type: "view", state: { ...defaultState, year: 1 } }
  ) as ViewResult;
  expect(view.attestations).toEqual(["text"]);
  expect(view.observations).toEqual([]);
  expect(view.coverage.filter((count) => count > 0)).toHaveLength(1);
  expect(view.boundaries).toEqual([-9999, 1, 2, 2007]);
  const hidden = query(
    index,
    { observations: [], history },
    { type: "view", state: { ...defaultState, evidence: [] } }
  ) as ViewResult;
  expect(hidden.attestations).toEqual([]);
  expect(hidden.coverage.every((count) => count === 0)).toBe(true);
  expect(hidden.boundaries).toEqual([-9999, 2007]);
  expect(hidden.nearestYear).toBe(null);
});
