export type ThemePref = 'system' | 'light' | 'dark'

/** Resolves the preference to a concrete theme and writes it to `<html data-theme>`. */
export function applyTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark' {
  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
  document.documentElement.dataset.theme = resolved
  return resolved
}
