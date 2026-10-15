/**
 * Replaces the user's home folder in a text with `~`, so a pasted error report does not carry the
 * account name. Handles `C:\Users\x`, the doubled-backslash form Python prints in reprs
 * (`'C:\\Users\\x'`), `C:/Users/x`, `/Users/x` and `/home/x`.
 *
 * Only a path start is masked: the beginning of the text, or after whitespace, a quote, `=` or
 * `(`. So `https://site/home/videos/1` stays as it is. A name may contain spaces (Windows, macOS)
 * and runs up to the next separator, quote, colon or the end; a `/home` name has no spaces.
 *
 * No lookbehind: WKWebView before Safari 16.4 throws a SyntaxError on it. The path-start character
 * is captured in group 1 and put back instead.
 */
const START = String.raw`(^|[\s'"=(])`
const NAME = String.raw`[^\\/'":\r\n]+`
const WINDOWS = new RegExp(`${START}[A-Za-z]:(?:\\\\{1,2}|/)Users(?:\\\\{1,2}|/)${NAME}`, 'g')
const UNIX = new RegExp(`${START}(?:/Users/${NAME}|/home/[^\\s\\\\/'":]+)`, 'g')

export function maskHome(text: string): string {
  return text
    .replace(WINDOWS, (_all, start: string) => `${start}~`)
    .replace(UNIX, (_all, start: string) => `${start}~`)
}
