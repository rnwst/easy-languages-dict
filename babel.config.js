export default {
  presets: [
    ['@babel/preset-env', {targets: {node: 'current'}}],
    // Preserve implicit type-import removal after Babel 8 changed the default.
    ['@babel/preset-typescript', {onlyRemoveTypeImports: false}],
  ],
  env: {
    test: {
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    },
  },
};
