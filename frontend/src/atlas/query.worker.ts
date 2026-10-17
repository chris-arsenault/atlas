/// <reference lib="webworker" />
import { CatalogueIndex, query, type Query, type ViewQuery } from "./index";
import type { Release } from "../data/schema";

let catalogue: CatalogueIndex;
let release: Pick<Release, "observations" | "history">;
self.onmessage = (
  event: MessageEvent<{
    id: number;
    request: Query | ViewQuery | { type: "init"; release: Release };
  }>
) => {
  const { id, request } = event.data;
  if (request.type === "init") {
    release = request.release;
    catalogue = new CatalogueIndex(request.release.nodes);
    self.postMessage({ id, result: true });
  } else self.postMessage({ id, result: query(catalogue, release, request) });
};
