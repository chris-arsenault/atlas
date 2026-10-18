import { expect, it } from "vitest";
import { nextBoundary } from "./events";
import { dateBoundaries } from "./time";
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
  const state = { ...defaultState, year: 1000 };
  const years = dateBoundaries(history.attestations);
  expect(years).toEqual([-9999, 800, 1100, 2007]);
  expect(nextBoundary(years, state)).toBe(1100);
  expect(nextBoundary(years, state, true)).toBe(800);
  expect(dateBoundaries([])).toEqual([-9999, 2007]);
  expect(nextBoundary([-5000, 0, 500, 2000], { ...state, year: 500 })).toBe(2000);
});
