import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import pluginImport from "eslint-plugin-import";
import pluginJest from "eslint-plugin-jest";
import pluginJsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";
import globals from "globals";

export default defineConfig(
  // ---- Ignored paths (applies to everything) ----
  {
    // Globs are relative to this config file. You usually don't need **/*.js
    // here.
    ignores: [
      "dist/**",
      "browser-profiles/**",
      "docs/**",
      "coverage/**",
    ],
  },

  // ---- Base recommended rules ----
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ---- Your project rules ----
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tseslint.parser,
      globals: {
        ...globals.browser,        // window, document, etc.
        ...globals.node,           // process, __dirname, etc.
        ...globals.jest,           // describe, it, expect, etc.
        ...globals.webextensions,  // browser.* APIs
      },
    },
    plugins: {
      import: pluginImport,
      jest: pluginJest,
      jsdoc: pluginJsdoc,
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "import/no-unresolved": ["error", { ignore: ['^svgo$'] }],
      "import/no-commonjs": 2,
      "import/extensions": [
        2,
        "never",
        {
          "ignorePackages": true,
          "pattern": { "js": "always", "jsx": "always" }
        }
      ],
      "no-restricted-globals": [2, "event"],
      "max-len": ["error", { "code": 80, "ignoreUrls": true }],
    },
    settings: {
      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
  },
);
