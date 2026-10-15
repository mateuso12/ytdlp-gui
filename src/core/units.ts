/**
 * A file size as the app shows it: KB, MB or GB in binary steps (what yt-dlp reports), one
 * decimal below 10 and none above, with the decimal separator of `locale`.
 */
export function formatBytes(bytes: number, locale: string): string {
  const KB = 1024
  const MB = KB * 1024
  const GB = MB * 1024
  const [value, unit] =
    bytes >= GB
      ? [bytes / GB, 'GB']
      : bytes >= MB
        ? [bytes / MB, 'MB']
        : [Math.max(1, Math.round(bytes / KB)), 'KB']
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 })
  return `${number.format(value)} ${unit}`
}

/** A transfer rate, e.g. `2,4 MB/s`: `formatBytes` per second. */
export function formatSpeed(bytesPerSecond: number, locale: string): string {
  return `${formatBytes(bytesPerSecond, locale)}/s`
}

/**
 * A time left, e.g. `1 min 20 s`, `45 s`, `1 h 2 min`. Seconds are rounded; from an hour on they
 * are dropped (nobody cares about them with that much to go). The unit symbols are the same in
 * every language the app speaks.
 */
export function formatEta(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts: string[] = []
  if (h > 0) {
    parts.push(`${h} h`)
    if (m > 0) parts.push(`${m} min`)
  } else {
    if (m > 0) parts.push(`${m} min`)
    if (s > 0 || m === 0) parts.push(`${s} s`)
  }
  return parts.join(' ')
}
