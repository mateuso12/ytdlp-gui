import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'src-tauri/target', 'src-tauri/gen'] },
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
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
)
