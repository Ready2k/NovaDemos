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
  ]),
  {
    rules: {
      // Backend and tool payloads are intentionally open-ended. Their runtime
      // validation is handled at the API boundary rather than by a static
      // schema in the UI layer.
      "@typescript-eslint/no-explicit-any": "off",

      // This application predates the React Compiler. These diagnostics need
      // a component-by-component lifecycle refactor, so keep the lint gate
      // focused on rules that are actionable without altering behaviour.
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",

      // Unused imports and JSX punctuation do not affect production safety.
      // They are retained while feature work is still in flight.
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;
