import type { ErrorCode, FriendlyError } from './types'

type Action = FriendlyError['action']

interface Rule {
  test: RegExp
  code: ErrorCode
  action?: Action
}

/**
 * Ordered rule table: the first rule that matches wins, so specific rules go
 * before generic ones. To teach the app a new error, add an entry in the right
 * place (and a fixture + test); matching is case-insensitive.
 *
 * i18n convention: titleKey = `errors.<code>.title`, messageKey =
 * `errors.<code>.message`. The strings live in the locale files (UI tasks).
 *
 * Ordering notes:
 * - geo before private: the geo message also says "Video unavailable".
 * - disk before ffmpeg: a failed postprocessing step can be a full disk
 *   ("ERROR: Postprocessing: [Errno 28] ...") and the disk is the real cause.
 * - ffmpeg is anchored on "ERROR: Postprocessing:" / "not found", never on the
 *   bare word "ffmpeg", so a path like C:\ffmpeg\bin in a network error does
 *   not misclassify.
 * - bot before age: both ask for a sign-in, but the bot check is not about age.
 * - 403 before network: "unable to download video data: HTTP Error 403" is not a network fault.
 * - the generic `ERROR: [extractor]` rule goes last.
 */
export const RULES: readonly Rule[] = [
  {
    test: /confirm you(?:'|’)?re not a bot/i,
    code: 'bot',
    action: 'use_cookies',
  },
  {
    test: /could not copy chrome cookie database|failed to decrypt with dpapi/i,
    code: 'cookies_chrome',
    action: 'use_firefox',
  },
  {
    test: /sign in to confirm your age|confirm your age|age-restricted/i,
    code: 'age',
    action: 'use_cookies',
  },
  {
    test: /not available in your country|geo[- ]?restrict|blocked it in your country/i,
    code: 'geo',
    action: 'set_proxy',
  },
  {
    test: /private video|video unavailable|this video is unavailable|video is private/i,
    code: 'private',
    action: 'use_cookies',
  },
  { test: /http error 429|too many requests/i, code: 'rate_limit', action: 'retry_later' },
  {
    test: /no space left|\[errno (?:28|13)\]|permission denied|winerror 5\b|access is denied/i,
    code: 'disk',
    action: 'choose_folder',
  },
  {
    test: /(?:ffmpeg|ffprobe)(?:\.exe)? (?:and (?:ffmpeg|ffprobe) )?not found|^error: postprocessing:/im,
    code: 'ffmpeg',
    action: 'reinstall_ffmpeg',
  },
  // Before network: the 403 message also says "unable to download".
  { test: /http error 403/i, code: 'forbidden', action: 'update_ytdlp' },
  {
    test: /unable to download|getaddrinfo failed|timed out|connection (?:reset|refused|aborted)|name or service not known|temporary failure in name resolution|network is unreachable|urlopen error/i,
    code: 'network',
    action: 'retry',
  },
  { test: /unsupported url|is not a valid url/i, code: 'unsupported' },
  { test: /^error: \[[^\]]+\]/im, code: 'extractor', action: 'update_ytdlp' },
]

/**
 * Translate the tail of yt-dlp's stderr into a friendly, actionable error.
 * Classification looks at ERROR lines only (WARNING lines such as the
 * "No supported JavaScript runtime" one are noise); if there are none, nothing
 * is classified and the result is `unknown`.
 */
export function mapError(stderrTail: string[]): FriendlyError {
  const lines = stderrTail.map((l) => l.trim()).filter((l) => l !== '')
  const lastLine = lines[lines.length - 1] ?? ''
  const errors = lines.filter((l) => /^error:/i.test(l)).join('\n')

  const rule = RULES.find((r) => r.test.test(errors))
  const code: ErrorCode = rule?.code ?? 'unknown'
  const err: FriendlyError = {
    code,
    titleKey: `errors.${code}.title`,
    messageKey: `errors.${code}.message`,
    lastLine,
  }
  if (rule?.action) err.action = rule.action
  return err
}
