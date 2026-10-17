import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

export default defineConfig(({ command }) => {
  if (command === "build" && existsSync(resolve("public/data")))
    throw new Error(
      "Generated datasets must stay outside public/. Use ATLAS_DATA_DIR for local data."
    );
  return {
    plugins: [react()],
    // Only checked-in brand assets ship with the app; generated datasets stay separate.
    publicDir:
      command === "build"
        ? resolve("public")
        : resolve(
            process.env.ATLAS_DATA_DIR ??
              `../.cache/browser-fixtures/${process.env.BROWSER ?? "local"}`
          ),
    build: { target: "es2022" },
  };
});
