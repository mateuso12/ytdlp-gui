import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'test-results',
      'playwright-report',
      '.cache',
      'src-tauri/target',
      'src-tauri/gen',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strict,
  reactHooks.configs.flat.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      // Tauri APIs are only reachable through the typed wrappers in src/bridge/**.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps/*'],
              message: 'Import Tauri APIs only from src/bridge/**.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/bridge/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Playwright fixtures take a `use` callback that the hooks rule mistakes for React's.
    files: ['e2e/**'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
)
