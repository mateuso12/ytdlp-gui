import type { DownloadOptions, Settings } from '../../core/types'

/**
 * The download options a link gets when the user did not choose any: the mode, quality and
 * container from the settings, and metadata embedding on (chapters, thumbnail, tags).
 */
export function defaultDownloadOptions(settings: Settings): DownloadOptions {
  const { mode, video, audio } = settings.defaults
  return {
    mode,
    ...(video ? { video } : {}),
    ...(audio ? { audio } : {}),
    embedThumbnail: true,
    embedMetadata: true,
    embedChapters: true,
  }
}
