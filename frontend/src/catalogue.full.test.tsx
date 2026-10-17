import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import type { QueryWorker } from "./atlas/worker";
import type { Release } from "./data/schema";
import "./style.css";

let root: Root;
let client: QueryClient;
afterEach(() => {
  root?.unmount();
  for (const query of client?.getQueryCache().findAll({ queryKey: ["index"] }) ?? [])
    (query.state.data as QueryWorker)?.close();
  client?.clear();
  document.body.replaceChildren();
});
it("loads the full pinned corpus and preserves geography, isolates, subgroup assignments, and source gaps", async () => {
  history.replaceState(
    null,
    "",
    location.pathname + "?language=beng1280&lng=90&lat=24&zoom=5&detail=areas"
  );
  const host = document.createElement("div");
  document.body.append(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  root = createRoot(host);
  root.render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
  await expect.element(page.getByRole("heading", { name: "Bengali", exact: true })).toBeVisible();
  await expect
    .poll(() => client.getQueryData<Release>(["release"])?.manifest.counts.catalogue ?? 0)
    .toBeGreaterThanOrEqual(27_177);
  await expect
    .poll(() => document.querySelector(".observation-details a")?.textContent)
    .toContain("Glottography");
  const release = client.getQueryData<Release>(["release"])!;
  expect(release.manifest.counts.observations).toBeGreaterThanOrEqual(11_594);
  expect(release.nodes.find((node) => node.id === "basq1248")?.parent).toBe(null);
  expect(release.observations.some((row) => row.subject === "cent2266")).toBe(true);
  expect(release.nodes.find((node) => node.id === "cent2266")?.kind).toBe("family");
  const search = page.getByRole("searchbox");
  await search.fill("Basque");
  await page.getByRole("button", { name: /^Basque\s*language/ }).click();
  await expect
    .element(
      page
        .getByRole("complementary", { name: "Selected language details" })
        .getByRole("heading", { name: "Basque", exact: true })
    )
    .toBeVisible();
  await search.fill("Sumerian");
  await page.getByRole("button", { name: /^Sumerian\s*language/ }).click();
  await page.getByRole("combobox", { name: "Source layer" }).selectOptions("historical");
  await expect.element(page.getByText(/No available area for this selection/)).toBeVisible();
  await expect.element(page.getByText(/No supported geographic observations/)).toBeVisible();
});
