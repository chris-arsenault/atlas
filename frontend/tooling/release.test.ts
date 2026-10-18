import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, firefox, webkit, type Browser } from "playwright";
import { preview, type PreviewServer } from "vite";
import { cpSync, mkdtempSync, symlinkSync, rmSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { prepareFixture } from "./fixtures";
import { modelFrameSchema } from "../src/data/schema";

let server: PreviewServer;
let browser: Browser;
let directory: string;
let url: string;
let reportedFallback = false;
beforeAll(async () => {
  const data = resolve(process.env.ATLAS_DATA_DIR ?? prepareFixture(), "data");
  mkdirSync("../.cache", { recursive: true });
  directory = mkdtempSync(resolve("../.cache/production-preview-"));
  cpSync("dist", directory, { recursive: true });
  symlinkSync(data, resolve(directory, "data"), "dir");
  server = await preview({
    configFile: false,
    build: { outDir: directory },
    preview: { host: "127.0.0.1", port: 0 },
  });
  url = server.resolvedUrls!.local[0];
  let engine = chromium;
  if (process.env.BROWSER === "firefox") engine = firefox;
  if (process.env.BROWSER === "webkit") engine = webkit;
  browser = await engine.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});
it("loads the built application and tile ranges using only static files", async () => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${url}?language=beng1280&lng=90&lat=24&zoom=5&detail=areas`);
    await page.getByRole("heading", { name: "Bengali", exact: true }).waitFor();
    await page.locator(".observation-details a").waitFor();
    const pointer = await (await context.request.get(`${url}data/v1/channel.json`)).json();
    const archive = pointer.manifest.replace("manifest.json", "contemporary.pmtiles");
    const range = await context.request.get(new URL(archive, url).href, {
      headers: { Range: "bytes=0-126" },
    });
    expect(range.status()).toBe(206);
    expect((await range.body()).subarray(0, 7).toString()).toBe("PMTiles");
    await page.getByText(/^Browse dated events/).click();
    await page
      .getByRole("combobox", { name: "Historical event" })
      .selectOption("bengal-persian-arabic-contact");
    await page.getByRole("article", { name: "Selected event" }).waitFor();
    await page.getByRole("button", { name: "Timeline options" }).click();
    await page.getByRole("combobox", { name: "Reconstruction variant" }).selectOption("bouckaert");
    await page.getByRole("spinbutton", { name: "Calendar year" }).fill("856");
    await page.getByRole("checkbox", { name: "Dated genealogy" }).check();
    await page.getByRole("searchbox").fill("Sumerian");
    await page.getByRole("button", { name: /^Sumerian\s*language/ }).click();
    await page.getByText(/No source-dated estimate for this selection/).waitFor();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
it("scrubs the complete release, restores its URL and keeps one calendar map usable on phones", async () => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${url}?year=1000`);
    await page.getByRole("slider", { name: "Historical year" }).waitFor();
    await page.locator(".current-evidence").waitFor();
    expect(await page.getByRole("combobox", { name: "Historical time scale" }).count()).toBe(0);
    expect(await page.getByRole("combobox", { name: "Source layer" }).count()).toBe(0);
    const trace = await page.evaluateHandle(async () => {
      const begin = performance.now();
      const replace = history.replaceState.bind(history);
      const measurement = { count: 0, elapsed: 0 };
      history.replaceState = (...args) => {
        measurement.count++;
        replace(...args);
      };
      const slider = document.querySelector<HTMLInputElement>(
        'input[aria-label="Historical year"]'
      )!;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      for (let index = 0; index < 180; index++) {
        setValue.call(slider, String(600 + index));
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
      measurement.elapsed = performance.now() - begin;
      return measurement;
    });
    await page.waitForURL((address) => address.searchParams.get("year") === "779");
    const writes = await trace.jsonValue();
    await trace.dispose();
    console.info("Full-release scrubbing", writes);
    expect(writes.count).toBeLessThan(10);
    await page.getByRole("heading", { name: "779 CE", exact: true }).waitFor();
    await page.locator(".current-evidence").waitFor();
    await page.screenshot({
      path: `../.cache/atlas-calendar-${process.env.BROWSER ?? "chromium"}-desktop.png`,
    });
    await page.reload();
    await page.getByRole("heading", { name: "779 CE", exact: true }).waitFor();
    await page.locator(".current-evidence").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `../.cache/atlas-calendar-${process.env.BROWSER ?? "chromium"}-phone.png`,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    expect(await page.getByRole("slider", { name: "Historical year" }).isVisible()).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it.runIf(!!process.env.ATLAS_DATA_DIR).each([
  ["Latin", "lati1261", 1, "vernacular and written"],
  ["Medieval Latin", "medi1250", 1200, "learned and written"],
  ["Latin's medieval continuation", "lati1261", 1200, "learned and written"],
  ["Old English", "olde1238", 800, "vernacular and written"],
  ["English's Old English stage", "stan1293", 800, "vernacular and written"],
  ["Sumerian vernacular", "sume1241", -1999, "vernacular and written"],
  ["Sumerian learned continuation", "sume1241", 1, "learned and scribal"],
  ["Egyptian", "egyp1246", -999, "successive Egyptian vernacular and written stages"],
  ["Egyptian's Coptic continuation", "egyp1246", 1800, "liturgical"],
  ["Bengali", "beng1280", 1000, "vernacular and written"],
  ["Medieval French", "stan1290", 1000, "vernacular and written"],
  ["French dispersal", "stan1290", 1700, "vernacular and written"],
  ["Portuguese dispersal", "port1283", 1700, "vernacular and written"],
  ["Dutch dispersal", "dutc1256", 1700, "vernacular and written"],
  ["English before Australian settlement", "stan1293", 1700, "vernacular and written"],
  ["English after Australian settlement", "stan1293", 1850, "vernacular and written"],
  ["Nouchi", "nouc1234", 2000, "estimated contact-era presence"],
  ["Yoruba geographic continuity", "yoru1245", 1700, "estimated language presence"],
  ["Picard geographic continuity", "pica1241", 1700, "estimated language presence"],
  ["Palenquero contact destination", "pale1260", 1700, "estimated language presence"],
  ["Austronesian ancestry", "aust1307", -3999, "estimated language presence"],
] as const)("renders %s from the complete modeled release", async (name, subject, year, use) => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const geographicBounds: Record<string, [number, number, number, number]> = {
    yoru1245: [-5, 4, 10, 12],
    pica1241: [-1, 47, 7, 52],
    pale1260: [-80, 5, -70, 15],
  };
  const bounds = geographicBounds[subject];
  const geographicFrame = bounds
    ? page.waitForResponse((response) => /\/model\/chang\/-?\d+\.json$/.test(response.url()))
    : null;
  try {
    await page.goto(`${url}?language=${subject}&year=${year}`);
    await page.getByRole("heading", { name: "Modeled presence", exact: true }).waitFor();
    await page
      .locator(".observation-details")
      .getByText(new RegExp(`· ${use}$`))
      .waitFor();
    await page.getByRole("img", { name: "Modeled language coverage across time" }).waitFor();
    if (geographicFrame) {
      const artifact = await context.request.get((await geographicFrame).url());
      const frame = modelFrameSchema.parse(await artifact.json());
      const [longitude, latitude] = frame.observations.find((row) => row.subject === subject)!
        .model!.point;
      expect(longitude, name).toBeGreaterThan(bounds[0]);
      expect(latitude, name).toBeGreaterThan(bounds[1]);
      expect(longitude, name).toBeLessThan(bounds[2]);
      expect(latitude, name).toBeLessThan(bounds[3]);
    }
    await page.waitForFunction(
      () =>
        !document.querySelector(".timeline-heading p")?.textContent?.includes("Updating") &&
        document.querySelector(".map-pane")?.getAttribute("aria-busy") === "false"
    );
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `../.cache/atlas-model-${process.env.BROWSER ?? "chromium"}-${subject}-${year}.png`,
    });
    expect(errors, name).toEqual([]);
    const unavailable = await page.locator(".map-fallback").count();
    if (process.env.BROWSER === "firefox" && unavailable) {
      await page.getByRole("heading", { name: "Map unavailable", exact: true }).waitFor();
      await page.getByRole("region", { name: "Language genealogy", exact: true }).waitFor();
      if (!reportedFallback)
        console.info(
          "Firefox runtime could not create WebGL; data, genealogy and the announced fallback remain available."
        );
      reportedFallback = true;
    } else expect(unavailable, name).toBe(0);
  } finally {
    await context.close();
  }
});
