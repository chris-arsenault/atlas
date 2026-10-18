import { useEffect, useState } from "react";
import type { WorkspaceModel } from "../atlas/useWorkspace";
import { nextBoundary } from "./events";
import { timelineBounds } from "./time";

export function Playback({ model }: { model: WorkspaceModel }) {
  const { state, dispatch } = model;
  const [token, setToken] = useState<string | null>(null);
  const context = JSON.stringify([state.variant, state.evidence, state.family]);
  const playing = token === context;
  const years = model.view?.boundaries ?? timelineBounds();
  const next = nextBoundary(years, state);
  useEffect(() => {
    if (!playing) return;
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 3000 : 1500;
    const timer = setTimeout(() => {
      if (next === null) setToken(null);
      else dispatch({ type: "patch", patch: { year: next } });
    }, delay);
    return () => clearTimeout(timer);
  }, [playing, next, dispatch]);
  const step = (backwards: boolean) => {
    setToken(null);
    const year = nextBoundary(years, state, backwards);
    if (year !== null) dispatch({ type: "patch", patch: { year } });
  };
  return (
    <div className="playback" aria-label="Evidence playback">
      <button onClick={() => step(true)} disabled={nextBoundary(years, state, true) === null}>
        Previous date
      </button>
      <button
        onClick={() => setToken(playing ? null : context)}
        disabled={next === null}
        aria-pressed={playing}
      >
        {playing ? "Pause playback" : "Play timeline"}
      </button>
      <button onClick={() => step(false)} disabled={next === null}>
        Next date
      </button>
      <small>Moves between dated evidence and gaps.</small>
    </div>
  );
}
