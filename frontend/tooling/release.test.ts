import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, firefox, webkit, type Browser } from "playwright";
import { preview, type PreviewServer } from "vite";
import { cpSync, mkdtempSync, symlinkSync, rmSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { prepareFixture } from "./fixtures";

let server: PreviewServer;
let browser: Browser;
let directory: string;
let url: string;
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
    await page.getByRole("combobox", { name: "Source layer" }).selectOption("historical");
    await page
      .getByRole("combobox", { name: "Historical event" })
      .selectOption("bengal-persian-arabic-contact");
    await page.getByRole("article", { name: "Selected event" }).waitFor();
    await page.getByRole("combobox", { name: "Historical time scale" }).selectOption("model");
    await page.getByRole("combobox", { name: "Reconstruction variant" }).selectOption("bouckaert");
    await page.getByRole("spinbutton", { name: "Source model age" }).fill("1144");
    await page.getByRole("checkbox", { name: "Dated genealogy" }).check();
    await page.getByRole("button", { name: "Globe", exact: true }).click();
    await page.getByRole("button", { name: "Globe", exact: true }).click();
    await page.getByRole("searchbox").fill("Sumerian");
    await page.getByRole("button", { name: /^Sumerian\s*language/ }).click();
    await page.getByText(/No source-dated estimate for this selection/).waitFor();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
