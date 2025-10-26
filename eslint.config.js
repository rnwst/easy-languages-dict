import js from "@eslint/js";
import pluginImport from "eslint-plugin-import";
import pluginJest from "eslint-plugin-jest";
import pluginJsdoc from "eslint-plugin-jsdoc";
import globals from "globals";

export default [
  // ---- Ignored paths (applies to everything) ----
  {
    // Globs are relative to this config file. You usually don't need **/*.js here.
    ignores: [
      "dist/**",
      "browser-profiles/**",
      "docs/**",
      "coverage/**",
    ],
  },

  // ---- Base recommended rules ----
  js.configs.recommended,

  // ---- Your project rules ----
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
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
    },
    rules: {
      "import/no-unresolved": ["error", { ignore: ['^svgo$'] }],
      "import/no-commonjs": 2,
      "import/extensions": [2, "ignorePackages"],
      "no-restricted-globals": [2, "event"],
    },
  },
];
