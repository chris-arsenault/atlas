import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
import refresh from "eslint-plugin-react-refresh";
import perf from "eslint-plugin-react-perf";
import a11y from "eslint-plugin-jsx-a11y";
import sonar from "eslint-plugin-sonarjs";
import prettier from "eslint-config-prettier";
import * as ahara from "@ahara/standards/eslint-rules";
import type { Linter } from "eslint";

const sonarRules = (sonar.configs?.recommended as { rules: Linter.RulesRecord }).rules;

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "test-results/**",
      "tooling/fixtures/public/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      complexity: ["error", 10],
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 75, skipBlankLines: true, skipComments: true }],
      "max-depth": ["warn", 4],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": hooks,
      "react-refresh": refresh,
      "react-perf": perf,
      "jsx-a11y": a11y,
      ahara: {
        rules: {
          "max-jsx-props": ahara.maxJsxProps,
          "no-inline-styles": ahara.noInlineStyles,
          "no-direct-fetch": ahara.noDirectFetch,
          "no-direct-store-import": ahara.noDirectStoreImport,
          "no-escape-hatches": ahara.noEscapeHatches,
          "no-manual-async-state": ahara.noManualAsyncState,
          "no-manual-expand-state": ahara.noManualExpandState,
          "no-manual-view-header": ahara.noManualViewHeader,
          "no-non-vitest-testing": ahara.noNonVitestTesting,
          "no-raw-undefined-union": ahara.noRawUndefinedUnion,
          "no-js-file-extension": ahara.noJsFileExtension,
        },
      },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...hooks.configs.recommended.rules,
      ...a11y.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "react-perf/jsx-no-new-object-as-prop": ["warn", { nativeAllowList: "all" }],
      "react-perf/jsx-no-new-array-as-prop": ["warn", { nativeAllowList: "all" }],
      "react-perf/jsx-no-new-function-as-prop": ["warn", { nativeAllowList: "all" }],
      "ahara/max-jsx-props": "warn",
      "ahara/no-inline-styles": "error",
      "ahara/no-direct-fetch": "error",
      "ahara/no-direct-store-import": "warn",
      "ahara/no-escape-hatches": "error",
      "ahara/no-manual-async-state": "warn",
      "ahara/no-manual-expand-state": "warn",
      "ahara/no-manual-view-header": "warn",
      "ahara/no-non-vitest-testing": "error",
      "ahara/no-raw-undefined-union": "warn",
      "ahara/no-js-file-extension": "error",
    },
  },
  { plugins: { sonarjs: sonar }, rules: sonarRules },
  { files: ["**/*.test.ts", "**/*.test.tsx"], rules: { "max-lines-per-function": "off" } },
  prettier
);
