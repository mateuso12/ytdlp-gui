import type { Format } from './types'

const isVideo = (f: Format) => f.vcodec !== null
const isAudioOnly = (f: Format) => f.vcodec === null && f.acodec !== null

/** Dynamic-range-compressed copies of an audio track (YouTube's `-drc` formats). */
const isDrc = (f: Format) => /\bDRC\b/i.test(f.note)

const byDescending = (value: (f: Format) => number | null) => (a: Format, b: Format) =>
  (value(b) ?? -1) - (value(a) ?? -1)

/** Video formats (with or without sound), tallest first, then smoother, then bigger. */
export function videoTracks(formats: Format[]): Format[] {
  return formats
    .filter(isVideo)
    .sort(
      (a, b) =>
        byDescending((f) => f.height)(a, b) ||
        byDescending((f) => f.fps)(a, b) ||
        byDescending((f) => f.filesize)(a, b),
    )
}

/** Audio-only formats, higher bitrate first; the plain copy before its DRC twin. */
export function audioTracks(formats: Format[]): Format[] {
  return formats
    .filter(isAudioOnly)
    .sort(
      (a, b) =>
        byDescending((f) => f.abr)(a, b) ||
        Number(isDrc(a)) - Number(isDrc(b)) ||
        byDescending((f) => f.filesize)(a, b),
    )
}

/** The audio-only format that `bestaudio` would pick. */
export function bestAudio(formats: Format[]): Format | null {
  return audioTracks(formats)[0] ?? null
}

export function maxVideoHeight(formats: Format[]): number | null {
  const heights = formats.filter(isVideo).map((f) => f.height ?? 0)
  const max = Math.max(0, ...heights)
  return max > 0 ? max : null
}

/** `2160p60`, `1080p`: the fps is written only above 30, like the player does. */
export function topVideoLabel(formats: Format[]): string | null {
  const top = videoTracks(formats).find((f) => f.height !== null)
  if (!top?.height) return null
  const fps = top.fps !== null && top.fps > 30 ? Math.round(top.fps) : ''
  return `${top.height}p${fps}`
}

/** The common name of a codec string from yt-dlp (`mp4a.40.2` is AAC). Empty for no codec. */
export function codecLabel(codec: string | null): string {
  if (codec === null) return ''
  const name = codec.toLowerCase()
  const known: [RegExp, string][] = [
    [/^opus/, 'Opus'],
    [/^mp4a/, 'AAC'],
    [/^vorbis/, 'Vorbis'],
    [/^flac/, 'FLAC'],
    [/^mp3/, 'MP3'],
    [/^vp0?9/, 'VP9'],
    [/^vp0?8/, 'VP8'],
    [/^avc/, 'H.264'],
    [/^hev|^hvc/, 'H.265'],
    [/^av0?1/, 'AV1'],
  ]
  for (const [pattern, label] of known) if (pattern.test(name)) return label
  return name.split('.')[0].toUpperCase()
}

/** Replaces the extension of the file name (the last path segment) with `ext`. */
export function swapExtension(path: string, ext: string): string {
  return path.replace(/(?<=[^\\/])\.[A-Za-z0-9]{1,5}$/, `.${ext}`)
}
