/** Seconds, with an optional fraction: `12`, `12.5`. */
const SECONDS = /^\d+(?:\.\d+)?$/
/** The last field of `m:ss` / `h:mm:ss`: exactly two digits, below 60. */
const CLOCK_SECONDS = /^\d{2}(?:\.\d+)?$/
const DIGITS = /^\d+$/

/**
 * Parses what a person types for a point in a video: `m:ss`, `h:mm:ss` or plain seconds.
 * Returns the seconds, or `null` when the text is not a time.
 */
export function parseTimecode(text: string): number | null {
  const input = text.trim()
  if (input === '') return null
  if (SECONDS.test(input)) return Number(input)

  const parts = input.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  const seconds = parts[parts.length - 1]
  const rest = parts.slice(0, -1)
  if (!CLOCK_SECONDS.test(seconds) || !rest.every((p) => DIGITS.test(p))) return null
  const s = Number(seconds)
  if (s >= 60) return null

  if (parts.length === 2) return Number(rest[0]) * 60 + s
  // h:mm:ss: the minutes are a clock field too.
  if (rest[1].length !== 2 || Number(rest[1]) >= 60) return null
  return Number(rest[0]) * 3600 + Number(rest[1]) * 60 + s
}

const pad = (n: number) => String(n).padStart(2, '0')

/** `m:ss` below an hour, `h:mm:ss` from an hour; a fraction of a second is kept. */
export function formatTimecode(totalSeconds: number): string {
  const whole = Math.floor(totalSeconds)
  const fraction = totalSeconds - whole
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = pad(whole % 60) + (fraction > 0 ? String(Number(fraction.toFixed(3))).slice(1) : '')
  return h > 0 ? `${h}:${pad(m)}:${s}` : `${m}:${s}`
}

export type SectionResult =
  | { ok: true; section: { start: string; end: string } | null }
  | { ok: false; error: 'format' | 'order' | 'beyond'; field: 'start' | 'end' }

/**
 * Checks the two boxes of "download only a section". Both empty means no section; an empty start
 * is the beginning and an empty end is the end of the video (`inf`, what yt-dlp understands).
 * The times come back normalised (`195` becomes `3:15`).
 */
export function parseSection(
  startText: string,
  endText: string,
  duration?: number | null,
): SectionResult {
  const startBlank = startText.trim() === ''
  const endBlank = endText.trim() === ''
  if (startBlank && endBlank) return { ok: true, section: null }

  const start = startBlank ? 0 : parseTimecode(startText)
  if (start === null) return { ok: false, error: 'format', field: 'start' }
  const end = endBlank ? Infinity : parseTimecode(endText)
  if (end === null) return { ok: false, error: 'format', field: 'end' }

  if (end <= start) return { ok: false, error: 'order', field: 'end' }
  if (duration != null && start >= duration) return { ok: false, error: 'beyond', field: 'start' }

  return {
    ok: true,
    section: { start: formatTimecode(start), end: endBlank ? 'inf' : formatTimecode(end) },
  }
}
