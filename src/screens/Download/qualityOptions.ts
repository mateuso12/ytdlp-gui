import { bestAudio, maxVideoHeight } from '../../core/formats'
import type { Format } from '../../core/types'

/** The heights the quality chips can offer (2160 is "4K"). */
export const QUALITY_HEIGHTS = [2160, 1440, 1080, 720, 480] as const

export type QualityHeight = number | 'best'

export interface QualityOption {
  height: QualityHeight
  /**
   * `4K`, `1440p`… A language-neutral label; `best` is a key the UI translates ("Melhor").
   */
  label: string
  /** Biggest video up to this height plus the best audio; `null` when no size is known. */
  sizeBytes: number | null
}

function sizeUpTo(formats: Format[], maxHeight: number, audioBytes: number): number | null {
  let video: number | null = null
  for (const f of formats) {
    if (f.vcodec === null || f.height === null || f.height > maxHeight || f.filesize === null) {
      continue
    }
    video = Math.max(video ?? 0, f.filesize)
  }
  return video === null ? null : video + audioBytes
}

const labelOf = (height: number) => (height === 2160 ? '4K' : `${height}p`)

/**
 * The quality chips of a video: `best` plus the heights among 2160, 1440, 1080, 720 and 480 that
 * the video has, tallest first. A height's size is the biggest video format up to that height
 * plus the best audio-only format (what `bv*[height<=H]+ba` would fetch).
 */
export function qualityOptions(formats: Format[]): QualityOption[] {
  const audioBytes = bestAudio(formats)?.filesize ?? 0
  const heights = QUALITY_HEIGHTS.filter((h) =>
    formats.some((f) => f.vcodec !== null && f.height === h),
  )
  return [
    { height: 'best', label: 'best', sizeBytes: sizeUpTo(formats, Infinity, audioBytes) },
    ...heights.map((h) => ({
      height: h,
      label: labelOf(h),
      sizeBytes: sizeUpTo(formats, h, audioBytes),
    })),
  ]
}

/**
 * What the chips show. "Best" is the same download as the tallest listed height unless the video
 * goes above it (8K), so it is only listed then, or when no listed height exists.
 */
export function visibleQualityOptions(formats: Format[]): QualityOption[] {
  const options = qualityOptions(formats)
  const top = options.find((o) => o.height !== 'best')
  const redundant = top !== undefined && top.height === maxVideoHeight(formats)
  return redundant ? options.filter((o) => o.height !== 'best') : options
}

/**
 * The chip that stands for `preferred` (from the settings or the user's last click): the same
 * height if listed, "best" as the tallest listed height when "best" is hidden, otherwise the
 * tallest height below it, or the lowest one when everything is above it.
 */
export function resolveQuality(preferred: QualityHeight, options: QualityOption[]): QualityHeight {
  const heights = options.map((o) => o.height)
  if (heights.includes(preferred)) return preferred
  const numeric = options.flatMap((o) => (o.height === 'best' ? [] : [o.height]))
  if (preferred === 'best') return numeric[0] ?? 'best'
  return numeric.find((h) => h <= preferred) ?? numeric[numeric.length - 1] ?? 'best'
}

/** The chips offered when there is no video to measure (the playlist's shared options). */
export const FALLBACK_QUALITY_OPTIONS: QualityOption[] = [
  { height: 'best', label: 'best', sizeBytes: null },
  ...QUALITY_HEIGHTS.map((h) => ({ height: h, label: labelOf(h), sizeBytes: null })),
]
