import type { DownloadOptions, Settings } from './types'

export const PROGRESS_MARK = '[ytdlp-gui]'
export const FILE_MARK = '[ytdlp-gui-file]'

export interface BinPaths {
  ffmpeg: string
  deno: string | null
}

const BEST = 'bv*+ba/b'

/** Flags shared by every download, independent of the user's choices. */
export function baseArgs(s: Settings, bin: BinPaths): string[] {
  return [
    '--newline',
    '--no-colors',
    // --print implies quiet, which would hide progress and [Merger] lines.
    '--no-quiet',
    '--progress-template',
    `download:${PROGRESS_MARK}%(progress)j`,
    '--print',
    `after_move:${FILE_MARK}%(filepath)s`,
    '--ffmpeg-location',
    bin.ffmpeg,
    ...jsRuntimeArgs(bin),
    '--windows-filenames',
    '--trim-filenames',
    '180',
    '--no-playlist',
    ...outputArgs(s),
    '--retries',
    String(s.retries),
  ]
}

function jsRuntimeArgs(bin: BinPaths): string[] {
  return bin.deno === null ? [] : ['--js-runtimes', `deno:${bin.deno}`]
}

function outputArgs(s: Settings): string[] {
  return ['-P', s.outputDir, '-o', s.outputTemplate]
}

/** Format selection, depending on the download mode. */
export function formatArgs(opts: DownloadOptions): string[] {
  if (opts.mode === 'audio') {
    const audio = opts.audio ?? { format: 'mp3' as const, quality: 0 as const }
    return [
      '-f',
      'bestaudio/best',
      '-x',
      '--audio-format',
      audio.format,
      '--audio-quality',
      String(audio.quality),
    ]
  }

  if (opts.mode === 'advanced') {
    const ids = [opts.advanced?.videoFormatId, opts.advanced?.audioFormatId].filter(
      (id): id is string => typeof id === 'string' && id !== '',
    )
    return ['-f', ids.length > 0 ? ids.join('+') : BEST]
  }

  const video = opts.video ?? { maxHeight: 'best' as const, container: 'mp4' as const }
  const selector =
    video.maxHeight === 'best'
      ? BEST
      : `bv*[height<=${video.maxHeight}]+ba/b[height<=${video.maxHeight}]`
  const args = ['-f', selector, '--merge-output-format', video.container]
  // Prefer codecs MP4 players accept natively, so no re-encode is needed.
  if (video.container === 'mp4') args.push('-S', 'vcodec:h264,acodec:m4a')
  return args
}

export function subtitleArgs(subs: DownloadOptions['subtitles']): string[] {
  if (!subs || subs.langs.length === 0) return []
  return [
    '--write-subs',
    ...(subs.includeAuto ? ['--write-auto-subs'] : []),
    '--sub-langs',
    subs.langs.join(','),
    ...(subs.embed ? ['--embed-subs'] : []),
  ]
}

export function sponsorArgs(sb: DownloadOptions['sponsorBlock']): string[] {
  if (!sb || sb.categories.length === 0) return []
  const flag = sb.action === 'remove' ? '--sponsorblock-remove' : '--sponsorblock-mark'
  return [flag, sb.categories.join(',')]
}

export function embedArgs(opts: DownloadOptions): string[] {
  return [
    ...(opts.embedThumbnail ? ['--embed-thumbnail'] : []),
    ...(opts.embedMetadata ? ['--embed-metadata'] : []),
    ...(opts.embedChapters ? ['--embed-chapters'] : []),
  ]
}

export function sectionArgs(section: DownloadOptions['section']): string[] {
  if (!section) return []
  return ['--download-sections', `*${section.start}-${section.end}`]
}

/** Cookies and proxy; shared by downloads and the probe. */
export function connectionArgs(s: Settings): string[] {
  return [
    ...(s.cookiesBrowser !== 'none' ? ['--cookies-from-browser', s.cookiesBrowser] : []),
    ...(s.proxy ? ['--proxy', s.proxy] : []),
  ]
}

/** Connection flags plus the download rate limit. */
export function networkArgs(s: Settings): string[] {
  return [...connectionArgs(s), ...(s.rateLimit ? ['-r', s.rateLimit] : [])]
}

/** Builds the yt-dlp argv for a download. Every element is one argv entry; the URL is last. */
export function buildArgs(
  url: string,
  opts: DownloadOptions,
  s: Settings,
  bin: BinPaths,
): string[] {
  return [
    ...baseArgs(s, bin),
    ...formatArgs(opts),
    ...subtitleArgs(opts.subtitles),
    ...sponsorArgs(opts.sponsorBlock),
    ...embedArgs(opts),
    ...sectionArgs(opts.section),
    ...networkArgs(s),
    url,
  ]
}

/** Builds the yt-dlp argv for metadata probing. `flat` lists playlist entries only. */
export function buildProbeArgs(
  url: string,
  mode: 'flat' | 'full',
  s: Settings,
  bin: BinPaths,
): string[] {
  const modeArgs = mode === 'flat' ? ['--flat-playlist'] : ['--no-playlist', ...outputArgs(s)]
  return ['-J', ...modeArgs, ...jsRuntimeArgs(bin), ...connectionArgs(s), url]
}
