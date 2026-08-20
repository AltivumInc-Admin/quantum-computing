import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    // Components import route-scoped stylesheets (e.g. katex.min.css in
    // markdown-renderer); jest maps any .css import to an empty stub.
    "\\.css$": "<rootDir>/__mocks__/style-stub.js",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // "/__tests__/_support/": jest's default testMatch treats EVERY file under
  // __tests__ as a suite, so shared test scaffolding there would fail as a suite
  // with no tests. Nothing in _support asserts; it is imported, never collected.
  testPathIgnorePatterns: [
    "/node_modules/",
    "/.next/",
    "/public/lab/",
    "/out/",
    "/e2e/",
    "/__tests__/_support/",
  ],
  modulePathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/public/lab/", "<rootDir>/out/"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
};

export default config;
