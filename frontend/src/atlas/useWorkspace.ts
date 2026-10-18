import { useEffect, useMemo, useReducer, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Release } from "../data/schema";
import { fromUrl, reducer, toUrl } from "./state";
import { QueryWorker } from "./worker";

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
    queryKey: ["view", state.selected, state.family, state.year, state.evidence, state.variant],
    queryFn: () => worker.data!.view(state),
    enabled: !!worker.data,
    staleTime: Infinity,
    gcTime: 60_000,
  });
  useEffect(() => {
    const url = toUrl(state);
    const timer = setTimeout(() => {
      if (location.search === url) return;
      try {
        history.replaceState(history.state, "", `${location.pathname}${url}${location.hash}`);
      } catch (error) {
        // URL persistence must never take down exploration, including Safari quotas.
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
  }, []);
  const select = (id: string | null, observation: string | null = null) => {
    setFocusedObservation(observation);
    dispatch({ type: "select", id });
  };
  return {
    release,
    state,
    dispatch,
    nodes,
    worker: worker.data,
    view: view.data,
    indexing: view.isPending,
    queryError: worker.error ?? view.error,
    select,
    focusedObservation,
    setFocusedObservation,
  };
}
export type WorkspaceModel = ReturnType<typeof useWorkspace>;
