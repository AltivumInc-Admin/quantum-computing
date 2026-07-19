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
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/public/lab/", "/out/", "/e2e/"],
  modulePathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/public/lab/", "<rootDir>/out/"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
};

export default config;
