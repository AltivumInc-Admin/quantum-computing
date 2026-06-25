import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["__tests__/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored / generated JupyterLite distribution and staged notebooks —
    // not first-party source, must not be linted.
    "public/lab/**",
    // Self-hosted Pyodide lesson runtime (minified upstream distribution staged
    // by jupyterlite-build/build.sh) — vendored, must not be linted.
    "public/pyodide/**",
    "jupyterlite-build/**",
    // Generated build artifacts (e.g. tutor-core.generated.ts, a @ts-nocheck copy
    // of lambda/tutor/tutor-core.mjs produced by the gen:tutor-core prebuild hook).
    "src/**/*.generated.ts",
  ]),
]);

export default eslintConfig;
