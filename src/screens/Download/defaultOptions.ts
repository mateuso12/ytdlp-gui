import { canEmbedThumbnail } from '../../core/compat'
import type { DownloadOptions, Settings } from '../../core/types'

/**
 * The download options a link gets when the user did not choose any: the mode, quality and
 * container from the settings, and metadata embedding on (chapters, thumbnail, tags). The
 * thumbnail is left out when the output format cannot hold one (WebM).
 */
export function defaultDownloadOptions(settings: Settings): DownloadOptions {
  const { mode, video, audio } = settings.defaults
  const output =
    mode === 'video'
      ? (video?.container ?? null)
      : mode === 'audio'
        ? (audio?.format ?? null)
        : null
  return {
    mode,
    ...(video ? { video } : {}),
    ...(audio ? { audio } : {}),
    embedThumbnail: canEmbedThumbnail(output),
    embedMetadata: true,
    embedChapters: true,
  }
}
