import { expect, it } from "vitest";
import { evidenceBoundaries, nextBoundary } from "./events";
import { defaultState } from "../atlas/state";
import type { History } from "../data/schema";

it("steps into and out of actual evidence intervals without interpolating geometry", () => {
  const history: History = {
    relationships: [],
    events: [],
    observations: [],
    attestations: [
      {
        id: "witness",
        subject: "language",
        source: "source",
        locator: "p. 1",
        variant: null,
        evidence: "attested",
        dating: { kind: "uncertain", start: 800, end: 1099 },
        note: "uncertain composition",
      },
    ],
  };
  const state = { ...defaultState, layer: "historical" as const, year: 1000 };
  const years = evidenceBoundaries(history, state);
  expect(years).toEqual([-2999, 800, 1100, 2026]);
  expect(nextBoundary(years, state)).toBe(1100);
  expect(nextBoundary(years, state, true)).toBe(800);
  expect(evidenceBoundaries(history, { ...state, evidence: [] })).toEqual([-2999, 2026]);
  expect(nextBoundary([14000, 2000, 500, 0], { ...state, clock: "model", year: 2000 })).toBe(500);
});
