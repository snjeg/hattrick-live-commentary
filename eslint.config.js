import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    // Hard rule 9: Web Speech only inside its VoiceProvider adapter.
    files: ['packages/**/*.ts'],
    ignores: ['packages/audio/src/voice/web-speech.ts'],
    rules: {
      'no-restricted-globals': ['error', 'speechSynthesis', 'SpeechSynthesisUtterance'],
    },
  },
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
        'SpeechSynthesisUtterance',
        'AudioContext',
        'XMLHttpRequest',
      ],
      'no-restricted-imports': ['error', { patterns: ['node:*', 'fs', 'path', 'http', 'https'] }],
    },
  },
);
