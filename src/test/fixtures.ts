import type { DepsStatus } from '../bridge/types'

/** Everything the engine needs is installed: the app shows its normal screens. */
export const ALL_INSTALLED: DepsStatus = {
  ytdlp: { path: '/bin/yt-dlp', version: '2026.10.01' },
  ffmpeg: { path: '/bin/ffmpeg', version: '7.1', source: 'app' },
  deno: { path: '/bin/deno', version: '2.0.0', source: 'app' },
}
