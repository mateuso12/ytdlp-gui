# Translating

The UI strings live in `src/i18n/locales/`. Brazilian Portuguese (`pt-BR.json`) is the reference locale and English (`en.json`) is the fallback.

## Add a language

1. Copy `src/i18n/locales/en.json` to `src/i18n/locales/<code>.json` (for example `es.json`) and translate the values. Keep the keys and the `{{placeholders}}` unchanged.
2. Register the file in `src/i18n/index.ts`: import it, add it to `resources`, add the code to the `Locale` type and teach `detectLocale` to pick it.
3. Add the language to the selector in `src/screens/Settings/AppearanceSection.tsx` (use the language's own name as the label).
4. Update the key test in `src/i18n/locales.test.ts` so the new file is compared with `en.json`.
5. Run `pnpm test`.

The key test fails if any locale is missing a key or has an extra one, so a translation can never ship incomplete.

## Fix a string

Edit the value in the locale file and open a pull request. Do not rename keys without updating the code that uses them.
