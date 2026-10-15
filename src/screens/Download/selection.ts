import type { PlaylistEntry } from '../../core/types'

/**
 * Whether an entry can be queued. An entry whose link is empty (yt-dlp gave neither a `url` nor a
 * `webpage_url`) cannot be downloaded, so it is treated like an unavailable one.
 */
export const isSelectable = (entry: PlaylistEntry): boolean => entry.available && entry.url !== ''

/**
 * The items ticked when a playlist opens: every available one that is not already in the history.
 * Positions count from 1, like the numbers shown in the list and what `parseRange` returns.
 */
export function initialSelection(
  entries: PlaylistEntry[],
  has: (entry: PlaylistEntry) => boolean,
): Set<number> {
  const selected = new Set<number>()
  entries.forEach((entry, i) => {
    if (isSelectable(entry) && !has(entry)) selected.add(i + 1)
  })
  return selected
}

const PART = /^(\d*)(-?)(\d*)$/

/**
 * Reads a range such as `1-3, 7, 10-` into the positions it names (counting from 1). `10-` runs to
 * the last item and `-3` starts at the first; the end of a range past the list is clamped, but a
 * start past the end is an error. The `Error` message is a key under `playlist.range.errors`:
 * `empty`, `invalid` or `outOfRange`.
 */
export function parseRange(input: string, max: number): Set<number> | Error {
  const parts = input
    .split(',')
    .map((p) => p.replace(/\s+/g, ''))
    .filter((p) => p !== '')
  if (parts.length === 0) return new Error('empty')

  const result = new Set<number>()
  for (const part of parts) {
    const m = PART.exec(part)
    if (!m) return new Error('invalid')
    const [, from, dash, to] = m
    if (from === '' && to === '') return new Error('invalid')
    // A lone number has no dash; "5" and "5-5" are the same item.
    const start = from === '' ? 1 : Number(from)
    const end = dash === '' ? start : to === '' ? max : Number(to)
    if (start < 1 || end < 1) return new Error('invalid')
    if (start > max) return new Error('outOfRange')
    if (end < start) return new Error('invalid')
    for (let i = start; i <= Math.min(end, max); i++) result.add(i)
  }
  return result
}

/**
 * The extractor name a single video of this playlist reports: `youtube:tab` lists `youtube` videos.
 * The history matches on it, so the entries have to carry the video's name, not the list's.
 */
export const entryExtractor = (playlistExtractor: string): string => playlistExtractor.split(':')[0]

/** `6 h 12 min`, `45 min`: a total length for the playlist header (at least 1 min). */
export function formatTotalDuration(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
