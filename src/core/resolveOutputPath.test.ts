import { describe, expect, it } from 'vitest'
import { previewTemplate } from './resolveOutputPath'

const sample = { title: 'Big Buck Bunny', id: 'aqz-KE-bpKQ', ext: 'mp4' }

describe('previewTemplate', () => {
  it('fills %(field)s placeholders from the sample', () => {
    expect(previewTemplate('%(title)s [%(id)s].%(ext)s', sample)).toBe(
      'Big Buck Bunny [aqz-KE-bpKQ].mp4',
    )
  })

  it('zero-pads numeric fields with %(field)0Nd', () => {
    expect(
      previewTemplate('%(playlist_index)03d - %(title)s', {
        ...sample,
        playlist_index: 7,
      }),
    ).toBe('007 - Big Buck Bunny')
  })

  it('renders %(field)d without padding', () => {
    expect(previewTemplate('%(n)d', { n: 7 })).toBe('7')
  })

  it('renders a missing field as NA, like yt-dlp', () => {
    expect(previewTemplate('%(uploader)s - %(title)s', sample)).toBe('NA - Big Buck Bunny')
  })

  it('renders a missing field as NA even for numeric conversions', () => {
    expect(previewTemplate('%(playlist_index)03d', sample)).toBe('NA')
  })

  it('replaces / inside a value with U+29F8, like yt-dlp', () => {
    expect(previewTemplate('%(title)s.%(ext)s', { title: 'AC/DC', ext: 'mp4' })).toBe('AC⧸DC.mp4')
  })

  it('replaces a backslash inside a value too (Windows paths)', () => {
    expect(previewTemplate('%(title)s', { title: 'a\\b' })).toBe('a⧸b')
  })

  it('pads with spaces when the width has no 0 flag', () => {
    expect(previewTemplate('[%(n)3d]', { n: 7 })).toBe('[  7]')
  })

  it('leaves slash and backslash in the literal template text untouched', () => {
    expect(
      previewTemplate('%(uploader)s/%(title)s\\dir.%(ext)s', {
        ...sample,
        uploader: 'Blender',
      }),
    ).toBe('Blender/Big Buck Bunny\\dir.mp4')
  })

  it('turns %% into a literal %', () => {
    expect(previewTemplate('100%% %(title)s', sample)).toBe('100% Big Buck Bunny')
  })

  it('does not treat the output of %% as a placeholder start', () => {
    expect(previewTemplate('%%(title)s', sample)).toBe('%(title)s')
  })

  it('renders a non-numeric value under %(n)d as-is instead of NaN', () => {
    expect(previewTemplate('%(n)d', { n: 'abc' })).toBe('abc')
    expect(previewTemplate('%(n)03d', { n: 'abc' })).toBe('abc')
  })

  it('accepts numeric strings under %(n)d', () => {
    expect(previewTemplate('%(n)03d', { n: '7' })).toBe('007')
  })

  it('stringifies numbers under %(field)s', () => {
    expect(previewTemplate('%(n)s', { n: 42 })).toBe('42')
  })

  it('returns text without placeholders unchanged', () => {
    expect(previewTemplate('plain.txt', sample)).toBe('plain.txt')
  })

  it('leaves unsupported or incomplete placeholders as-is', () => {
    expect(previewTemplate('%(title', sample)).toBe('%(title')
    expect(previewTemplate('%(title)x', sample)).toBe('%(title)x')
  })
})
