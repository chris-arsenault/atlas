import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import type { QueryWorker } from "./atlas/worker";
import "./style.css";

let root: Root;
let client: QueryClient;
function mount(search = "") {
  history.replaceState(null, "", location.pathname + search);
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
}
afterEach(async () => {
  root?.unmount();
  for (const query of client?.getQueryCache().findAll({ queryKey: ["index"] }) ?? [])
    (query.state.data as QueryWorker)?.close();
  client?.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  await page.viewport(1440, 900);
});
it("searches aliases, reveals ancestry, and selects branches without changing the source period", async () => {
  mount();
  const search = page.getByRole("searchbox", { name: "Search languages, names, or codes" });
  await expect.element(search).toBeVisible();
  await search.fill("Bangla");
  await page.getByRole("button", { name: /^Bengali\s*language/ }).click();
  await expect.element(page.getByRole("heading", { name: "Bengali", exact: true })).toBeVisible();
  await expect
    .element(
      page
        .getByRole("navigation", { name: "Selected ancestry" })
        .getByRole("button", { name: "Indo-European", exact: true })
    )
    .toBeVisible();
  await expect
    .poll(() => document.querySelector(".tree-label.selected")?.textContent)
    .toBe("Bengali");
  await expect.element(page.getByRole("heading", { name: "2007 CE" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Selected ancestry" })
    .getByRole("button", { name: "Indo-European", exact: true })
    .click();
  await expect.poll(() => new URLSearchParams(location.search).get("language")).toBe("indo1319");
  await page.getByRole("button", { name: "Isolate family" }).click();
  await expect.element(page.getByRole("button", { name: "Show all families" })).toBeVisible();
});
it("keeps languages without polygons and unsupported dates inspectable", async () => {
  mount("?language=sume1241&layer=historical&year=0");
  await expect
    .element(
      page
        .getByRole("complementary", { name: "Selected language details" })
        .getByRole("heading", { name: "Sumerian", exact: true })
    )
    .toBeVisible();
  await expect.element(page.getByText(/No mapped evidence for this selection/)).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "1 BCE", exact: true })).toBeVisible();
  await expect.element(page.getByText(/No mapped evidence for this date/)).toBeVisible();
  await page.getByRole("button", { name: "Sources & coverage ↗" }).click();
  await expect.element(page.getByRole("dialog", { name: "Sources and coverage" })).toBeVisible();
  await page.getByRole("button", { name: "Close sources" }).click();
});
it("decodes real tiles and offers overlapping source claims from a map click", async () => {
  mount("?language=beng1280&detail=areas&lng=90&lat=24&zoom=5");
  await expect.element(page.getByRole("heading", { name: "Bengali", exact: true })).toBeVisible();
  await expect
    .poll(
      () =>
        document.querySelector(".maplibregl-canvas") !== null ||
        document.querySelector(".map-fallback") !== null
    )
    .toBe(true);
  if (document.querySelector(".map-fallback") && !navigator.userAgent.includes("Chrome")) return;
  await expect.poll(() => document.querySelector(".map-fallback")?.textContent ?? "").toBe("");
  const canvas = document.querySelector<HTMLCanvasElement>(".maplibregl-canvas")!;
  await expect
    .poll(() =>
      performance
        .getEntriesByType("resource")
        .some((entry) => entry.name.includes("contemporary.pmtiles"))
    )
    .toBe(true);
  // A tile request can complete before the render loop consumes its decoded features.
  await expect
    .poll(
      async () => {
        const rect = canvas.getBoundingClientRect();
        await page
          .getByRole("region", { name: "Map", exact: true })
          .click({ position: { x: rect.width / 2, y: rect.height / 2 } });
        return document.querySelector(".overlap-picker") !== null;
      },
      { timeout: 15_000 }
    )
    .toBe(true);
  await page.getByRole("button", { name: /^Synthetic overlap/ }).click();
  await expect
    .element(
      page
        .getByRole("complementary", { name: "Selected language details" })
        .getByRole("heading", { name: "Synthetic overlap", exact: true })
    )
    .toBeVisible();
});
it("retains keyboard exploration when WebGL is unavailable", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
  mount("?language=basq1248");
  await expect.element(page.getByRole("heading", { name: "Map unavailable" })).toBeVisible();
  await expect
    .element(
      page
        .getByRole("complementary", { name: "Selected language details" })
        .getByRole("heading", { name: "Basque" })
    )
    .toBeVisible();
  const search = page.getByRole("searchbox");
  await search.fill("beng1280");
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByRole("heading", { name: "Bengali", exact: true })).toBeVisible();
});
it("retains shared selection between mobile panes", async () => {
  await page.viewport(390, 844);
  mount("?language=beng1280");
  await expect.element(page.getByRole("heading", { name: "Bengali", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Genealogy", exact: true }).click();
  await expect.element(page.getByRole("region", { name: "Language genealogy" })).toBeVisible();
  await expect
    .poll(() => document.querySelector(".tree-label.selected")?.textContent)
    .toBe("Bengali");
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect.poll(() => new URLSearchParams(location.search).get("language")).toBe("beng1280");
});
it("exposes the timeline and source-backed geographic lineage on mobile", async () => {
  await page.viewport(390, 844);
  mount("?language=beng1280");
  await expect.element(page.getByRole("slider", { name: "Historical year" })).toBeVisible();
  const timeline = () => document.querySelector(".timeline")!.getBoundingClientRect();
  expect(timeline().bottom).toBeLessThan(innerHeight);
  expect(timeline().bottom).toBeLessThanOrEqual(
    document.querySelector(".workspace")!.getBoundingClientRect().top
  );
  await expect.element(page.getByRole("slider", { name: "Historical year" })).toBeEnabled();
  const toggle = page.getByRole("button", { name: "Timeline options" });
  await toggle.click();
  await page.getByRole("spinbutton", { name: "Calendar year" }).fill("856");
  await page.getByRole("checkbox", { name: "Dated genealogy" }).click();
  await page.getByRole("checkbox", { name: "Ancestry links" }).click();
  await expect.element(page.getByText("1 sourced ancestry links at this date.")).toBeVisible();
  const params = () => new URLSearchParams(location.search);
  await expect.poll(() => params().get("year")).toBe("856");
  expect(params().has("clock")).toBe(false);
  await page.getByRole("spinbutton", { name: "Calendar year" }).fill("2007");
  await expect.element(page.getByText(/No located ancestry is available/)).toBeVisible();
  await page.getByRole("spinbutton", { name: "Calendar year" }).fill("856");
  await expect.element(page.getByText("1 sourced ancestry links at this date.")).toBeVisible();
  await page.getByRole("combobox", { name: "Reconstruction variant" }).selectOptions("chang");
  await expect.element(page.getByText(/No located ancestry is available/)).toBeVisible();
  await page.getByRole("combobox", { name: "Reconstruction variant" }).selectOptions("bouckaert");
  await toggle.click();
  await page.getByRole("button", { name: "Genealogy", exact: true }).click();
  await expect.element(page.getByRole("region", { name: "Language genealogy" })).toBeVisible();
  await expect
    .poll(() => document.querySelector(".tree-label.selected")?.textContent)
    .toBe("Bengali (bouckaert)");
  await page.getByRole("button", { name: "Map", exact: true }).click();
  const search = page.getByRole("searchbox");
  await search.fill("Sumerian");
  await page.getByRole("button", { name: /^Sumerian\s*language/ }).click();
  await expect.element(page.getByText(/No located ancestry is available/)).toBeVisible();
  await expect.poll(() => params().get("language")).toBe("sume1241");
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth);
});
it("keeps timeline entry points within a small phone viewport", async () => {
  await page.viewport(320, 568);
  mount();
  await expect.element(page.getByRole("slider", { name: "Historical year" })).toBeVisible();
  expect(document.querySelector(".timeline")!.getBoundingClientRect().bottom).toBeLessThan(
    innerHeight
  );
  await expect.element(page.getByRole("slider", { name: "Historical year" })).toBeEnabled();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth);
  document.querySelector(".map-pane")!.scrollIntoView();
  expect(document.querySelector(".timeline")!.getBoundingClientRect().top).toBe(0);
});
it("provides actionable loading failures", async () => {
  const original = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) =>
    String(input).includes("channel.json")
      ? Promise.resolve(new Response("missing", { status: 404 }))
      : original(input, init)
  );
  mount();
  await expect.element(page.getByRole("heading", { name: "Dataset unavailable" })).toBeVisible();
  vi.restoreAllMocks();
  await page.getByRole("button", { name: "Retry loading dataset" }).click();
  await expect.element(page.getByRole("searchbox")).toBeVisible();
});
it("distinguishes calendar attestations from source model geography and dated ancestry", async () => {
  mount("?language=beng1280&layer=historical&year=1000");
  await expect.element(page.getByRole("region", { name: "Textual attestations" })).toBeVisible();
  await page.getByRole("button", { name: "Timeline options" }).click();
  await page.getByRole("spinbutton", { name: "Calendar year" }).fill("856");
  await page.getByRole("combobox", { name: "Reconstruction variant" }).selectOptions("bouckaert");
  await page.getByRole("checkbox", { name: "Dated genealogy" }).click();
  await expect
    .element(
      page.getByText("Reconstructed divergence dates · BCE / CE · source uncertainty retained")
    )
    .toBeVisible();
  await expect.poll(() => document.querySelectorAll(".node-date").length).toBeGreaterThan(0);
  await expect
    .element(page.getByRole("combobox", { name: "Mapped evidence at this date" }))
    .toBeVisible();
  await page.getByRole("combobox", { name: "Reconstruction variant" }).selectOptions("chang");
  await expect.element(page.getByText(/No mapped evidence for this date/)).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Bengali", exact: true })).toBeVisible();
});
it("connects sourced events to participants and steps through evidence gaps", async () => {
  mount("?language=beng1280&layer=historical&year=1000");
  await page.getByText("Browse dated events (1)").click();
  await expect.element(page.getByRole("combobox", { name: "Historical event" })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Historical event" })
    .selectOptions("bengal-persian-arabic-contact");
  await expect.element(page.getByRole("article", { name: "Selected event" })).toBeVisible();
  await expect
    .element(page.getByText("Historical geography unavailable; no route is drawn."))
    .toBeVisible();
  await expect
    .element(
      page
        .getByRole("navigation", { name: "Event participants" })
        .getByRole("button", { name: "Bengali", exact: true })
    )
    .toBeVisible();
  await page.getByRole("button", { name: "Previous date", exact: true }).click();
  await expect.poll(() => new URLSearchParams(location.search).get("year")).toBe("1100");
  await page.getByRole("button", { name: "Play timeline", exact: true }).click();
  await page.getByRole("button", { name: "Pause playback", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "Play timeline", exact: true }))
    .toBeVisible();
});
it("coalesces sustained scrubbing into a settled URL and keeps the final evidence", async () => {
  mount("?year=1000");
  await expect.element(page.getByRole("slider", { name: "Historical year" })).toBeVisible();
  const writes = vi.spyOn(history, "replaceState");
  const slider = document.querySelector<HTMLInputElement>('input[aria-label="Historical year"]')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  // More input events than WebKit permits history writes in ten seconds.
  for (let index = 0; index < 180; index++) {
    setValue.call(slider, String(600 + index));
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
  await expect.element(page.getByRole("heading", { name: "779 CE", exact: true })).toBeVisible();
  await expect.poll(() => new URLSearchParams(location.search).get("year")).toBe("779");
  expect(writes.mock.calls.length).toBeLessThan(10);
  await expect
    .element(page.getByRole("combobox", { name: "Mapped evidence at this date" }))
    .toBeVisible();
  expect(document.querySelector('[role="alert"]')).toBe(null);
});
it("keeps exploration alive if the browser refuses a history write", async () => {
  mount("?year=1000");
  await expect.element(page.getByRole("slider", { name: "Historical year" })).toBeVisible();
  vi.spyOn(history, "replaceState").mockImplementation(() => {
    throw new DOMException("History write limit", "SecurityError");
  });
  await page.getByRole("button", { name: "Timeline options" }).click();
  await page.getByRole("spinbutton", { name: "Calendar year" }).fill("856");
  await new Promise((resolve) => setTimeout(resolve, 600));
  await expect.element(page.getByRole("heading", { name: "856 CE", exact: true })).toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Mapped evidence at this date" }))
    .toBeVisible();
});
it("cancels a pending URL save when browser navigation restores another date", async () => {
  mount("?year=1000");
  await expect.element(page.getByRole("slider", { name: "Historical year" })).toBeVisible();
  await page.getByRole("button", { name: "Timeline options" }).click();
  await page.getByRole("spinbutton", { name: "Calendar year" }).fill("856");
  history.pushState(null, "", `${location.pathname}?year=1200&language=beng1280`);
  window.dispatchEvent(new PopStateEvent("popstate"));
  await expect.element(page.getByRole("heading", { name: "1200 CE", exact: true })).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(new URLSearchParams(location.search).get("year")).toBe("1200");
  await expect.element(page.getByRole("heading", { name: "Bengali", exact: true })).toBeVisible();
});
