module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-hooks', 'react-refresh'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react-refresh/only-export-components': 'warn',
    // The Plotly trace/layout objects are intentionally typed loosely (see
    // src/types/plotly.d.ts), so allow explicit `any` at those boundaries.
    '@typescript-eslint/no-explicit-any': 'off',
    // `document.getElementById('root')!` is the standard React 18 mount idiom.
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
};
