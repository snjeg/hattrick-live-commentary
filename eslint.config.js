import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    // Hard rule 3: core stays pure (no network, browser, extension or audio APIs).
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'fetch',
        'window',
        'document',
        'chrome',
        'navigator',
        'speechSynthesis',
        'AudioContext',
        'XMLHttpRequest',
      ],
      'no-restricted-imports': ['error', { patterns: ['node:*', 'fs', 'path', 'http', 'https'] }],
    },
  },
);
