import type { Format, PlaylistEntry, PlaylistInfo, Probe, VideoInfo } from './types'

/** The JSON from yt-dlp does not look like a video or a playlist. */
export class ProbeParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProbeParseError'
  }
}

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A positive number, or null. yt-dlp reports 0 for "does not apply" (e.g. abr of a video stream). */
function positive(value: unknown): number | null {
  const n = num(value)
  return n !== null && n > 0 ? n : null
}

/** yt-dlp writes the literal string "none" when a stream has no video/audio codec. */
function codec(value: unknown): string | null {
  const s = str(value)
  return s === null || s === 'none' ? null : s
}

/** URL of the last (largest) entry of a yt-dlp `thumbnails` list. */
function lastThumbnail(thumbnails: unknown): string | null {
  if (!Array.isArray(thumbnails)) return null
  for (let i = thumbnails.length - 1; i >= 0; i--) {
    const item: unknown = thumbnails[i]
    const url = isRecord(item) ? str(item.url) : null
    if (url) return url
  }
  return null
}

/** Language keys of a `subtitles` / `automatic_captions` object. */
function languages(value: unknown): string[] {
  if (!isRecord(value)) return []
  // Premieres and live replays list their chat as a pseudo subtitle track.
  return Object.keys(value).filter((lang) => lang !== 'live_chat')
}

function parseFormat(raw: unknown): Format | null {
  if (!isRecord(raw)) return null
  const id = str(raw.format_id)
  if (id === null) return null

  const vcodec = codec(raw.vcodec)
  const acodec = codec(raw.acodec)
  // Storyboards (thumbnail sprite sheets) report "none" for both codecs and cannot be downloaded
  // as media.
  if (raw.vcodec === 'none' && raw.acodec === 'none') return null

  return {
    id,
    ext: str(raw.ext) ?? '',
    height: positive(raw.height),
    fps: positive(raw.fps),
    vcodec,
    acodec,
    abr: positive(raw.abr),
    filesize: num(raw.filesize) ?? num(raw.filesize_approx),
    note: str(raw.format_note) ?? '',
  }
}

function parseVideo(raw: Raw, inputUrl: string): VideoInfo {
  const id = str(raw.id)
  if (id === null) throw new ProbeParseError('yt-dlp output has no video id')

  return {
    id,
    extractor: str(raw.extractor) ?? 'generic',
    url: str(raw.webpage_url) ?? inputUrl,
    title: str(raw.title) ?? id,
    channel: str(raw.channel) ?? str(raw.uploader),
    uploadDate: str(raw.upload_date),
    duration: num(raw.duration),
    thumbnail: str(raw.thumbnail) ?? lastThumbnail(raw.thumbnails),
    formats: Array.isArray(raw.formats)
      ? raw.formats.map(parseFormat).filter((f): f is Format => f !== null)
      : [],
    subtitles: languages(raw.subtitles),
    autoSubtitles: languages(raw.automatic_captions),
    chapters: Array.isArray(raw.chapters) ? raw.chapters.length : 0,
    filename: str(raw.filename) ?? str(raw._filename),
  }
}

/** Entries yt-dlp could not resolve show up with no title or with a "[Private video]" style one. */
const PLACEHOLDER_TITLE = /^\[(?:private|deleted) video\]$/i

function parseEntry(raw: Raw): PlaylistEntry | null {
  const url = str(raw.url) ?? str(raw.webpage_url)
  const id = str(raw.id) ?? url
  if (id === null) return null

  const title = str(raw.title)
  const sizeBytes = num(raw.filesize) ?? num(raw.filesize_approx)
  return {
    id,
    url: url ?? '',
    title,
    duration: num(raw.duration),
    thumbnail: str(raw.thumbnail) ?? lastThumbnail(raw.thumbnails),
    available: title !== null && !PLACEHOLDER_TITLE.test(title),
    ...(sizeBytes !== null && { sizeBytes }),
  }
}

/**
 * Flattens nested playlists (a channel root lists its tabs as playlists of videos) into
 * video entries, keeping the first occurrence of every id.
 */
function collectEntries(raw: unknown, seen: Set<string>, out: PlaylistEntry[]): void {
  if (!Array.isArray(raw)) return
  for (const item of raw) {
    if (!isRecord(item)) continue
    if (isPlaylistType(item._type)) {
      collectEntries(item.entries, seen, out)
      continue
    }
    const entry = parseEntry(item)
    if (entry === null || seen.has(entry.id)) continue
    seen.add(entry.id)
    out.push(entry)
  }
}

function isPlaylistType(type: unknown): boolean {
  return type === 'playlist' || type === 'multi_video'
}

function parsePlaylist(raw: Raw, inputUrl: string): PlaylistInfo {
  const id = str(raw.id) ?? inputUrl
  const entries: PlaylistEntry[] = []
  collectEntries(raw.entries, new Set(), entries)

  return {
    id,
    extractor: str(raw.extractor) ?? 'generic',
    title: str(raw.title) ?? id,
    channel: str(raw.channel) ?? str(raw.uploader),
    entries,
  }
}

/**
 * Turns the output of `yt-dlp -J` (or `-J --flat-playlist`) into a {@link Probe}.
 * Never returns `ambiguous`: that case is assembled by the probe flow from `urlKind`.
 */
export function parseProbe(json: unknown, inputUrl: string): Probe {
  if (!isRecord(json)) throw new ProbeParseError('yt-dlp output is not a JSON object')
  if (json._type === undefined && json.id === undefined) {
    throw new ProbeParseError('yt-dlp output has neither _type nor id')
  }

  if (isPlaylistType(json._type)) {
    return { kind: 'playlist', playlist: parsePlaylist(json, inputUrl) }
  }
  return { kind: 'video', video: parseVideo(json, inputUrl) }
}
