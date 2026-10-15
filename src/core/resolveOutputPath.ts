/** Replaces path separators inside a substituted value (U+29F8 BIG SOLIDUS). */
const SLASH_SUBSTITUTE = '⧸'

/**
 * Matches either an escaped `%%` or one `%(field)<flags/width><s|d>` placeholder.
 * Groups: 1 = field name, 2 = optional `0` flag + width digits, 3 = conversion.
 */
const PLACEHOLDER = /%%|%\((\w+)\)(0?\d*)([sd])/g

/**
 * yt-dlp swaps `/` for `⧸` inside field values so a title cannot create
 * directories. `\` is replaced too: the app also runs on Windows, where it is
 * a path separator as well (yt-dlp's own handling there is not mirrored).
 */
function sanitizeValue(value: string): string {
  return value.replace(/[/\\]/g, SLASH_SUBSTITUTE)
}

function formatNumber(value: string | number, spec: string): string {
  const numeric =
    typeof value === 'number' ? value : /^-?\d+$/.test(value) ? Number(value) : Number.NaN
  // Not a number: show the raw text instead of "NaN".
  if (!Number.isFinite(numeric)) return String(value)
  const text = String(Math.trunc(numeric))
  const width = Number(spec) || 0
  return text.padStart(width, spec.startsWith('0') ? '0' : ' ')
}

/**
 * Live preview of a yt-dlp output template, used only in Settings; the real
 * download path is always computed by yt-dlp itself.
 *
 * Supports just `%(field)s`, `%(field)d`, `%(field)0Nd` and `%%`. Fields
 * missing from `sample` render as `NA`. Anything else is left untouched.
 */
export function previewTemplate(template: string, sample: Record<string, string | number>): string {
  return template.replace(
    PLACEHOLDER,
    (match, field?: string, spec?: string, conversion?: string) => {
      if (match === '%%') return '%'
      const value = sample[field as string]
      if (value === undefined) return 'NA'
      const text = conversion === 'd' ? formatNumber(value, spec as string) : String(value)
      return sanitizeValue(text)
    },
  )
}
