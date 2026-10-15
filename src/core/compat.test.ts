import { describe, expect, it } from 'vitest'
import { advancedOutputExt, canEmbedThumbnail } from './compat'

describe('canEmbedThumbnail', () => {
  it.each([
    ['mp4', true],
    ['mkv', true],
    ['webm', false],
    ['mp3', true],
    ['m4a', true],
    ['opus', true],
    ['flac', true],
    ['MP4', true],
    ['gif', false],
    [null, false],
  ] as const)('%s: %s', (output, expected) => {
    expect(canEmbedThumbnail(output)).toBe(expected)
  })
})

describe('advancedOutputExt', () => {
  it('is the audio or video extension when there is only one track', () => {
    expect(advancedOutputExt('webm', null)).toBe('webm')
    expect(advancedOutputExt(null, 'm4a')).toBe('m4a')
    expect(advancedOutputExt(null, null)).toBeNull()
  })

  it('keeps a shared extension and picks mp4 for mp4 video with m4a audio', () => {
    expect(advancedOutputExt('webm', 'webm')).toBe('webm')
    expect(advancedOutputExt('mp4', 'm4a')).toBe('mp4')
  })

  it('falls to mkv when the tracks do not fit one container', () => {
    expect(advancedOutputExt('webm', 'm4a')).toBe('mkv')
    expect(advancedOutputExt('mp4', 'webm')).toBe('mkv')
  })
})
