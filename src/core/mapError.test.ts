import { describe, expect, it } from 'vitest'
import { mapError } from './mapError'
import type { ErrorCode, FriendlyError } from './types'

const raws = import.meta.glob<string>('./__fixtures__/stderr-*.txt', {
  eager: true,
  query: '?raw',
  import: 'default',
})

// Hand-written fixtures start with `#` comment lines; real captures do not.
const load = (name: string): string[] => {
  const raw = raws[`./__fixtures__/stderr-${name}.txt`]
  if (raw === undefined) throw new Error(`missing fixture: ${name}`)
  return raw.split(/\r?\n/).filter((l) => !l.startsWith('#'))
}

type Action = FriendlyError['action']

const cases: [string, ErrorCode, Action][] = [
  ['unsupported', 'unsupported', undefined],
  ['private', 'private', 'use_cookies'],
  ['unavailable', 'private', 'use_cookies'],
  ['age', 'age', 'use_cookies'],
  ['bot', 'bot', 'use_cookies'],
  ['403', 'forbidden', 'update_ytdlp'],
  ['geo', 'geo', 'set_proxy'],
  ['extractor', 'extractor', 'update_ytdlp'],
  ['rate_limit', 'rate_limit', 'retry_later'],
  ['ffmpeg', 'ffmpeg', 'reinstall_ffmpeg'],
  ['cookies_chrome', 'cookies_chrome', 'use_firefox'],
  ['cookies_dpapi', 'cookies_chrome', 'use_firefox'],
  ['disk', 'disk', 'choose_folder'],
  ['disk_permission', 'disk', 'choose_folder'],
  ['network', 'network', 'retry'],
]

describe('mapError: fixtures', () => {
  it.each(cases)('stderr-%s -> %s', (name, code, action) => {
    const err = mapError(load(name))
    expect(err.code).toBe(code)
    expect(err.action).toBe(action)
    expect(err.titleKey).toBe(`errors.${code}.title`)
    expect(err.messageKey).toBe(`errors.${code}.message`)
  })

  it('covers every stderr fixture on disk', () => {
    const onDisk = Object.keys(raws)
      .map((p) => /stderr-(.+)\.txt$/.exec(p)?.[1])
      .sort()
    expect(onDisk).toEqual(cases.map((c) => c[0]).sort())
  })

  it('does not let the JS-runtime WARNING decide the classification', () => {
    expect(load('unavailable')[0]).toMatch(/No supported JavaScript runtime/)
    expect(mapError(load('unavailable')).code).toBe('private')
    expect(mapError(load('ffmpeg')).code).toBe('ffmpeg')
  })

  it('gives the last non-empty line for a fixture', () => {
    expect(mapError(load('unsupported')).lastLine).toBe(
      'ERROR: Unsupported URL: https://example.com/',
    )
  })
})

describe('mapError: matching', () => {
  it('is case-insensitive', () => {
    expect(mapError(['ERROR: COULD NOT COPY CHROME COOKIE DATABASE']).code).toBe('cookies_chrome')
    expect(mapError(['error: unsupported url: x']).code).toBe('unsupported')
  })

  it('recognises WinError 5 as a disk error', () => {
    expect(mapError(['ERROR: [WinError 5] Access is denied']).code).toBe('disk')
  })

  it('recognises getaddrinfo failures as network', () => {
    const err = mapError([
      'ERROR: [youtube] x: Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>',
    ])
    expect(err.code).toBe('network')
    expect(err.action).toBe('retry')
  })

  it('recognises "ffmpeg not found"', () => {
    expect(
      mapError([
        'ERROR: ffmpeg not found. Please install or provide the path using --ffmpeg-location',
      ]).code,
    ).toBe('ffmpeg')
  })

  it('does not treat a network error that mentions ffmpeg in a path as ffmpeg', () => {
    const err = mapError([
      'WARNING: ffmpeg-location C:\tools\ffmpeg\bin does not exist! Continuing without ffmpeg',
      'ERROR: [youtube] x: Unable to download API page: getaddrinfo failed',
    ])
    expect(err.code).toBe('network')
  })

  it('prefers a disk error over a Postprocessing prefix', () => {
    expect(mapError(['ERROR: Postprocessing: [Errno 28] No space left on device']).code).toBe(
      'disk',
    )
  })

  it('classifies a bare Postprocessing failure as ffmpeg', () => {
    expect(mapError(['ERROR: Postprocessing: Error opening input files']).code).toBe('ffmpeg')
  })

  it('ignores WARNING lines when an ERROR line is present', () => {
    const err = mapError([
      'WARNING: [youtube] Unable to download webpage: HTTP Error 429',
      'ERROR: [youtube] x: Video unavailable',
    ])
    expect(err.code).toBe('private')
  })

  it('classifies a generic extractor error when nothing more specific matches', () => {
    expect(mapError(['ERROR: [twitter] 123: No video could be found in this tweet']).code).toBe(
      'extractor',
    )
  })
})

describe('mapError: unknown', () => {
  it('falls back to unknown with the last non-empty line, trimmed', () => {
    const err = mapError(['something odd', '  the real last line  ', '', '   '])
    expect(err).toEqual({
      code: 'unknown',
      titleKey: 'errors.unknown.title',
      messageKey: 'errors.unknown.message',
      lastLine: 'the real last line',
    })
    expect(err.action).toBeUndefined()
  })

  it('handles empty input', () => {
    expect(mapError([])).toMatchObject({ code: 'unknown', lastLine: '' })
    expect(mapError(['', '  ']).lastLine).toBe('')
  })

  it('does not classify on warnings alone', () => {
    expect(mapError(['WARNING: [youtube] Unable to download webpage: HTTP Error 429']).code).toBe(
      'unknown',
    )
  })
})
