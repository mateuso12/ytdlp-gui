import { FILE_MARK, PROGRESS_MARK } from './buildArgs'
import type { ProgressEvent } from './types'

export type LineEvent =
  | { type: 'progress'; data: ProgressEvent }
  | { type: 'file'; path: string }
  | { type: 'phase'; phase: 'merging' | 'postprocessing' }
  | null

const POSTPROCESSING_TAGS = [
  '[ExtractAudio]',
  '[SponsorBlock]',
  '[EmbedSubtitle]',
  '[EmbedThumbnail]',
  '[Metadata]',
  '[ModifyChapters]',
  '[SplitChapters]',
  '[ThumbnailsConvertor]',
  '[SubtitlesConvertor]',
  '[VideoRemuxer]',
  '[VideoConvertor]',
  // Fixup* tags are open-ended (FixupM4a, FixupM3u8, FixupStretched, FixupTimestamp, ...)
  '[Fixup',
]

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseProgress(json: string): LineEvent {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const p = raw as Record<string, unknown>

  const downloadedBytes = num(p.downloaded_bytes)
  const totalBytes = num(p.total_bytes) ?? num(p.total_bytes_estimate)
  const percent =
    downloadedBytes !== null && totalBytes !== null && totalBytes > 0
      ? Math.min(100, Math.max(0, (downloadedBytes / totalBytes) * 100))
      : null

  return {
    type: 'progress',
    data: {
      phase: 'downloading',
      percent,
      speed: num(p.speed),
      eta: num(p.eta),
      totalBytes,
      downloadedBytes,
    },
  }
}

/** Turns one line of yt-dlp stdout into an event. Pure: no state between calls. */
export function parseLine(line: string): LineEvent {
  const text = line.replace(/[\r\n]+$/, '')

  if (text.startsWith(PROGRESS_MARK)) return parseProgress(text.slice(PROGRESS_MARK.length))

  if (text.startsWith(FILE_MARK)) {
    const path = text.slice(FILE_MARK.length)
    return path === '' ? null : { type: 'file', path }
  }

  if (text.startsWith('[Merger]')) return { type: 'phase', phase: 'merging' }
  if (POSTPROCESSING_TAGS.some((tag) => text.startsWith(tag))) {
    return { type: 'phase', phase: 'postprocessing' }
  }

  return null
}
