/**
 * The name of a language code (`pt`, `pt-BR`, `en-orig`) in `locale`, with a capital first letter
 * (`Português`). A code the platform does not know comes back as it is.
 */
export function languageName(code: string, locale: string): string {
  let name: string | undefined
  try {
    name = new Intl.DisplayNames([locale], { type: 'language' }).of(code)
  } catch {
    // a malformed tag, or a runtime without display names
  }
  if (!name || name === code) return code
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
}
