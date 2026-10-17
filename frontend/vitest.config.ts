import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

function engine(): "chromium" | "firefox" | "webkit" {
  const browser = process.env.BROWSER;
  if (browser === "firefox" || browser === "webkit") return browser;
  return "chromium";
}
export default defineConfig({
  plugins: [react()],
  publicDir: resolve(
    process.env.ATLAS_DATA_DIR ?? `../.cache/browser-fixtures/${process.env.BROWSER ?? "local"}`
  ),
  test: {
    globalSetup: ["tooling/fixtures.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/atlas/**/*.ts", "src/data/**/*.ts"],
    },
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
        },
      },
      ...(!process.env.CI || process.env.BROWSER
        ? [
            {
              extends: true as const,
              test: {
                name: "browser",
                include: ["src/**/*.browser.test.tsx"],
                fileParallelism: false,
                browser: {
                  enabled: true,
                  headless: true,
                  viewport: { width: 1440, height: 900 },
                  provider: playwright(),
                  instances: [{ browser: engine() }],
                },
              },
            },
          ]
        : []),
      ...(process.env.ATLAS_FULL_DATA
        ? [
            {
              extends: true as const,
              test: {
                name: "full",
                include: ["src/**/*.full.test.tsx"],
                testTimeout: 30_000,
                browser: {
                  enabled: true,
                  headless: true,
                  viewport: { width: 1440, height: 900 },
                  provider: playwright(),
                  instances: [{ browser: engine() }],
                },
              },
            },
          ]
        : []),
    ],
  },
});
