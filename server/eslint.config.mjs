// ESLint flat config for the server (ESM, Node 22). Run: npm run lint
import js from "@eslint/js";

const nodeGlobals = {
  process: "readonly",
  Buffer: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setImmediate: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  fetch: "readonly",
  AbortController: "readonly",
  AbortSignal: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly",
  crypto: "readonly",
  structuredClone: "readonly",
  performance: "readonly",
  Blob: "readonly",
  FormData: "readonly",
  Headers: "readonly",
  Request: "readonly",
  Response: "readonly",
};

export default [
  { ignores: ["node_modules/**", "data/**", "cache/**"] },
  js.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: nodeGlobals },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
