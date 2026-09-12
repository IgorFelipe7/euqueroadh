import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright's own output. `test-results/` holds trace artifacts — minified third-party
    // JavaScript captured from the pages under test — which are not this project's source and
    // which make `npm run lint` report thousands of findings while a run is in progress.
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
