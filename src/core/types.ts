export type ThemePref = 'system' | 'light' | 'dark'

export interface Format {
  id: string
  ext: string
  height: number | null
  fps: number | null
  vcodec: string | null
  acodec: string | null
  abr: number | null
  filesize: number | null
  note: string
}

export interface VideoInfo {
  id: string
  extractor: string
  url: string
  title: string
  channel: string | null
  uploadDate: string | null
  duration: number | null
  thumbnail: string | null
  formats: Format[]
  subtitles: string[]
  autoSubtitles: string[]
  chapters: number
  filename: string | null
}

export interface PlaylistEntry {
  id: string
  url: string
  title: string | null
  duration: number | null
  thumbnail: string | null
  available: boolean
}

export interface PlaylistInfo {
  id: string
  extractor: string
  title: string
  channel: string | null
  entries: PlaylistEntry[]
}

export type Probe =
  | { kind: 'video'; video: VideoInfo }
  | { kind: 'playlist'; playlist: PlaylistInfo }
  | { kind: 'ambiguous'; videoUrl: string; playlistUrl: string; playlistCount: number }

export interface DownloadOptions {
  mode: 'video' | 'audio' | 'advanced'
  video?: { maxHeight: number | 'best'; container: 'mp4' | 'mkv' | 'webm' }
  audio?: { format: 'mp3' | 'm4a' | 'opus' | 'flac'; quality: 0 | 2 | 5 }
  advanced?: { videoFormatId: string | null; audioFormatId: string | null }
  subtitles?: { langs: string[]; embed: boolean; includeAuto: boolean }
  sponsorBlock?: { action: 'remove' | 'mark'; categories: string[] }
  embedThumbnail: boolean
  embedMetadata: boolean
  embedChapters: boolean
  section?: { start: string; end: string }
}

export interface Settings {
  outputDir: string
  outputTemplate: string
  concurrency: number
  rateLimit: string | null
  proxy: string | null
  retries: number
  cookiesBrowser: 'none' | 'firefox' | 'chrome' | 'edge' | 'brave' | 'safari' | 'chromium'
  theme: ThemePref
  language: 'pt-BR' | 'en'
  channel: 'stable' | 'nightly'
  defaults: Pick<DownloadOptions, 'mode' | 'video' | 'audio'>
}

export type ProgressEvent = {
  phase: 'downloading' | 'merging' | 'postprocessing'
  percent: number | null
  speed: number | null
  eta: number | null
  totalBytes: number | null
  downloadedBytes: number | null
}

export type ErrorCode =
  | 'unsupported'
  | 'private'
  | 'age'
  | 'geo'
  | 'extractor'
  | 'rate_limit'
  | 'ffmpeg'
  | 'cookies_chrome'
  | 'disk'
  | 'network'
  | 'unknown'

export interface FriendlyError {
  code: ErrorCode
  titleKey: string
  messageKey: string
  action?:
    | 'use_cookies'
    | 'set_proxy'
    | 'update_ytdlp'
    | 'retry_later'
    | 'reinstall_ffmpeg'
    | 'use_firefox'
    | 'choose_folder'
    | 'retry'
  lastLine: string
}
