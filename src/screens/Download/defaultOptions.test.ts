import { describe, expect, it } from 'vitest'
import type { Settings } from '../../core/types'
import { useSettings } from '../../stores/settings'
import { defaultDownloadOptions } from './defaultOptions'

const settings = (defaults: Settings['defaults']): Settings => ({
  ...useSettings.getState().settings,
  defaults,
})

describe('defaultDownloadOptions', () => {
  it('embeds thumbnail, metadata and chapters for MP4', () => {
    const opts = defaultDownloadOptions(
      settings({ mode: 'video', video: { maxHeight: 1080, container: 'mp4' } }),
    )
    expect(opts).toMatchObject({ embedThumbnail: true, embedMetadata: true, embedChapters: true })
  })

  it('does not embed the thumbnail in WebM, which cannot hold one', () => {
    const opts = defaultDownloadOptions(
      settings({ mode: 'video', video: { maxHeight: 1080, container: 'webm' } }),
    )
    expect(opts).toMatchObject({ embedThumbnail: false, embedMetadata: true, embedChapters: true })
  })

  it('embeds the thumbnail in every audio format', () => {
    for (const format of ['mp3', 'm4a', 'opus', 'flac'] as const) {
      const opts = defaultDownloadOptions(
        settings({ mode: 'audio', audio: { format, quality: 0 } }),
      )
      expect(opts.embedThumbnail, format).toBe(true)
    }
  })
})
