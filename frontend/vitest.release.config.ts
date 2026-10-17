import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tooling/release.test.ts"], testTimeout: 30_000 },
});
