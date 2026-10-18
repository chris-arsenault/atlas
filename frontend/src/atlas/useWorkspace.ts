import { useEffect, useMemo, useReducer, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Languoid, ObservationDetail, Release } from "../data/schema";
import { fromUrl, reducer, toUrl } from "./state";
import { QueryWorker } from "./worker";
import { loadModelFrame } from "../data/api";
import { referenceYear } from "./state";
import type { Action, AtlasState } from "./state";
import type { Dispatch } from "react";

export function useWorkspace(release: Release) {
  const [state, dispatch] = useReducer(reducer, location.search, fromUrl);
  const [focusedObservation, setFocusedObservation] = useState<string | null>(null);
  const nodes = useMemo(() => new Map(release.nodes.map((node) => [node.id, node])), [release]);
  const worker = useQuery({
    queryKey: ["index", release.manifest.release],
    queryFn: () => new QueryWorker().initialize(release),
    staleTime: Infinity,
  });
  const view = useQuery({
    queryKey: [
      "view",
      release.manifest.release,
      state.selected,
      state.family,
      state.year,
      state.evidence,
      state.variant,
    ],
    queryFn: () => worker.data!.view(state),
    enabled: !!worker.data,
    staleTime: Infinity,
    gcTime: 60_000,
  });
  const { frame, frameEntry, modeled, scenario } = useHistoricalFrame(release, state, nodes);
  const currentView = useMemo(() => {
    if (!view.data || !release.model) return view.data;
    return {
      ...view.data,
      observations:
        state.year === referenceYear
          ? view.data.observations.filter((row) => row.layer === "contemporary")
          : modeled,
      nearestYear: null,
      boundaries: [
        ...new Set([
          ...release.model.frames
            .filter((entry) => entry.scenario === scenario)
            .map((entry) => entry.start),
          referenceYear,
        ]),
      ].sort((a, b) => a - b),
    };
  }, [view.data, release.model, state.year, modeled, scenario]);
  useUrlState(state, dispatch);
  const select = (id: string | null, observation: string | null = null) => {
    setFocusedObservation(observation);
    dispatch({ type: "select", id });
  };
  return {
    release,
    state,
    dispatch,
    claimState: release.model ? { ...state, variant: scenario ?? state.variant } : state,
    nodes,
    worker: worker.data,
    view: currentView,
    modeled,
    selection: modelSelection(modeled, state.selected),
    frameEntry,
    frameError: frame.error,
    retryFrame: frame.refetch,
    indexing: view.isPending || (!!frameEntry && frame.isPending),
    queryError: worker.error ?? view.error,
    select,
    focusedObservation,
    setFocusedObservation,
  };
}
export type WorkspaceModel = ReturnType<typeof useWorkspace>;

function modelSelection(rows: ObservationDetail[], selected: string | null) {
  const exact = rows.filter((row) => row.subject === selected);
  if (exact.length || !selected) return exact;
  return rows.filter((row) => row.model?.selectionSubjects?.includes(selected));
}

function useHistoricalFrame(release: Release, state: AtlasState, nodes: Map<string, Languoid>) {
  const scenario =
    release.model && state.variant in release.model.scenarios
      ? state.variant
      : release.model?.defaultScenario;
  const frameEntry = release.model?.frames.find(
    (entry) => entry.scenario === scenario && entry.start <= state.year && entry.end >= state.year
  );
  const frame = useQuery({
    queryKey: ["model-frame", release.manifest.release, frameEntry?.artifact],
    queryFn: ({ signal }) => loadModelFrame(release, frameEntry!, signal),
    enabled: !!frameEntry,
    staleTime: Infinity,
    gcTime: 0,
  });
  const modeled = useMemo(
    () =>
      (frame.data?.observations ?? []).filter(
        (row) =>
          state.evidence.includes(row.evidence) &&
          (!state.family || nodes.get(row.subject)?.family === state.family)
      ),
    [frame.data, state.evidence, state.family, nodes]
  );
  return { scenario, frameEntry, frame, modeled };
}

function useUrlState(state: AtlasState, dispatch: Dispatch<Action>) {
  useEffect(() => {
    const url = toUrl(state);
    const timer = setTimeout(() => {
      if (location.search === url) return;
      try {
        history.replaceState(history.state, "", `${location.pathname}${url}${location.hash}`);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "SecurityError")) throw error;
      }
    }, 400);
    const cancel = () => clearTimeout(timer);
    window.addEventListener("popstate", cancel);
    return () => {
      cancel();
      window.removeEventListener("popstate", cancel);
    };
  }, [state]);
  useEffect(() => {
    const restore = () => dispatch({ type: "patch", patch: fromUrl(location.search) });
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [dispatch]);
}
