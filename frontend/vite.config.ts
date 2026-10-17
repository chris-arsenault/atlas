import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Production builds must never copy locally generated datasets into app assets.
  publicDir:
    command === "build"
      ? false
      : resolve(
          process.env.ATLAS_DATA_DIR ??
            `../.cache/browser-fixtures/${process.env.BROWSER ?? "local"}`
        ),
  build: { target: "es2022" },
}));
