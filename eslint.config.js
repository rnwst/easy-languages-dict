import {defineConfig} from 'eslint/config';
import js from '@eslint/js';
import pluginImport from 'eslint-plugin-import-x';
import pluginJest from 'eslint-plugin-jest';
import pluginJsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default defineConfig(
  {
    // Globs are relative to this config file.
    ignores: [
      'dist/**',
      'browser-profiles/**',
      'docs/**',
      'coverage/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      globals: {
        ...globals.browser,        // window, document, etc.
        ...globals.node,           // process, __dirname, etc.
        ...globals.jest,           // describe, it, expect, etc.
        ...globals.webextensions,  // browser.* APIs
      },
    },
    plugins: {
      'import-x': pluginImport,
      jest: pluginJest,
      jsdoc: pluginJsdoc,
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      'import-x/no-unresolved': ['error', {ignore: ['^svgo$']}],
      'import-x/no-commonjs': 2,
      'import-x/extensions': [
        2,
        'never',
        {
          ignorePackages: true,
          pattern: {js: 'always', jsx: 'always'}
        }
      ],
      'no-restricted-globals': [2, 'event'],
      'max-len': ['error', {code: 80, ignoreUrls: true}],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
        }
      ],
      // Quote preferences
      quotes: ['error', 'single', {avoidEscape: true}],
      'quote-props': ['error', 'as-needed'],
      // Spacing preferences
      'array-bracket-spacing': ['error', 'never'],
      'object-curly-spacing': ['error', 'never'],
      'computed-property-spacing': ['error', 'never'],
      'space-in-parens': ['error', 'never'],
      'space-before-blocks': ['error', 'always'],
      'space-before-function-paren': ['error', {
        anonymous: 'always',
        named: 'never',
        asyncArrow: 'always'
      }],
      'space-infix-ops': ['error'],
      'space-unary-ops': ['error'],
      'keyword-spacing': ['error'],
      // Indentation
      indent: ['error', 2, {SwitchCase: 1}],
      'no-tabs': ['error'],
      '@typescript-eslint/indent': ['off'],
    },
    settings: {
      'import-x/resolver': {
        typescript: true,
        node: true,
      },
    },
  },
);
