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
