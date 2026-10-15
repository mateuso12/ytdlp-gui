export type Validation<T> = { ok: true; value: T } | { ok: false }

const RATE = /^(\d+(?:\.\d+)?)([KMG])?$/i
const PROXY = /^(?:https?|socks4a?|socks5h?):\/\/[^\s/?#]+(?:[/?#]\S*)?$/i

/** `500K`, `2M`, `1.5M`, a plain number of bytes, or empty (no limit). Zero is not a limit. */
export function validateRateLimit(text: string): Validation<string | null> {
  const value = text.trim()
  if (value === '') return { ok: true, value: null }
  const match = RATE.exec(value)
  if (!match || Number(match[1]) <= 0) return { ok: false }
  return { ok: true, value }
}

/** An http, https or socks proxy address with a host, or empty (no proxy). */
export function validateProxy(text: string): Validation<string | null> {
  const value = text.trim()
  if (value === '') return { ok: true, value: null }
  return PROXY.test(value) ? { ok: true, value } : { ok: false }
}

export const MAX_RETRIES = 100

/** A whole number of retries from 0 to 100. */
export function validateRetries(text: string): Validation<number> {
  const value = text.trim()
  if (!/^\d{1,3}$/.test(value)) return { ok: false }
  const n = Number(value)
  return n <= MAX_RETRIES ? { ok: true, value: n } : { ok: false }
}

/** A name template cannot be empty; anything else is up to yt-dlp. */
export function validateTemplate(text: string): Validation<string> {
  return text.trim() === '' ? { ok: false } : { ok: true, value: text }
}
