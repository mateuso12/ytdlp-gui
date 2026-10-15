import { describe, expect, it } from 'vitest'
import {
  FILE_MARK,
  PROGRESS_MARK,
  buildArgs,
  buildProbeArgs,
  embedArgs,
  formatArgs,
  sectionArgs,
  sponsorArgs,
  subtitleArgs,
} from './buildArgs'
import type { DownloadOptions, Settings } from './types'

const URL = 'https://www.youtube.com/watch?v=abc'
const bin = { ffmpeg: 'C:\\bin\\ffmpeg.exe', deno: null as string | null }

const settings = (over: Partial<Settings> = {}): Settings => ({
  outputDir: 'C:\\Downloads',
  outputTemplate: '%(title)s [%(id)s].%(ext)s',
  concurrency: 2,
  rateLimit: null,
  proxy: null,
  retries: 10,
  cookiesBrowser: 'none',
  theme: 'system',
  language: 'pt-BR',
  channel: 'stable',
  defaults: {
    mode: 'video',
    video: { maxHeight: 'best', container: 'mp4' },
    audio: { format: 'mp3', quality: 0 },
  },
  ...over,
})

const opts = (over: Partial<DownloadOptions> = {}): DownloadOptions => ({
  mode: 'video',
  video: { maxHeight: 1080, container: 'mp4' },
  embedThumbnail: false,
  embedMetadata: false,
  embedChapters: false,
  ...over,
})

/** True when `seq` appears as consecutive elements of `args`. */
const hasSeq = (args: string[], ...seq: string[]): boolean =>
  args.some((_, i) => seq.every((v, j) => args[i + j] === v))

describe('constants', () => {
  it('exposes the marks', () => {
    expect(PROGRESS_MARK).toBe('[ytdlp-gui]')
    expect(FILE_MARK).toBe('[ytdlp-gui-file]')
  })
})

describe('buildArgs base', () => {
  const args = buildArgs(URL, opts(), settings(), bin)

  it('has the always-on flags', () => {
    expect(args).toEqual(
      expect.arrayContaining([
        '--newline',
        '--no-colors',
        '--no-quiet',
        '--windows-filenames',
        '--no-playlist',
      ]),
    )
    expect(hasSeq(args, '--progress-template', 'download:[ytdlp-gui]%(progress)j')).toBe(true)
    expect(hasSeq(args, '--print', 'after_move:[ytdlp-gui-file]%(filepath)s')).toBe(true)
    expect(hasSeq(args, '--ffmpeg-location', 'C:\\bin\\ffmpeg.exe')).toBe(true)
    expect(hasSeq(args, '--trim-filenames', '180')).toBe(true)
    expect(hasSeq(args, '-P', 'C:\\Downloads')).toBe(true)
    expect(hasSeq(args, '-o', '%(title)s [%(id)s].%(ext)s')).toBe(true)
    expect(hasSeq(args, '--retries', '10')).toBe(true)
  })

  it('puts the URL last', () => {
    expect(args[args.length - 1]).toBe(URL)
    expect(args.filter((a) => a === URL)).toHaveLength(1)
  })

  it('keeps an output dir with spaces and accents as a single element', () => {
    const dir = 'C:\\Users\\Mateus Amaro\\Vídeos'
    const a = buildArgs(URL, opts(), settings({ outputDir: dir }), bin)
    expect(a[a.indexOf('-P') + 1]).toBe(dir)
    expect(a.filter((x) => x.includes('Mateus'))).toEqual([dir])
  })

  it('keeps an ffmpeg path with spaces as a single element', () => {
    const f = 'C:\\Program Files\\app\\ffmpeg.exe'
    const a = buildArgs(URL, opts(), settings(), { ffmpeg: f, deno: null })
    expect(hasSeq(a, '--ffmpeg-location', f)).toBe(true)
  })
})

describe('js runtime (deno)', () => {
  it('omits --js-runtimes when deno is null', () => {
    expect(buildArgs(URL, opts(), settings(), bin)).not.toContain('--js-runtimes')
    expect(buildProbeArgs(URL, 'flat', settings(), bin)).not.toContain('--js-runtimes')
  })

  it('adds --js-runtimes deno:<path> as one element, with spaces', () => {
    const deno = 'C:\\Program Files\\deno\\deno.exe'
    const b = { ffmpeg: bin.ffmpeg, deno }
    expect(hasSeq(buildArgs(URL, opts(), settings(), b), '--js-runtimes', `deno:${deno}`)).toBe(
      true,
    )
    expect(
      hasSeq(buildProbeArgs(URL, 'flat', settings(), b), '--js-runtimes', `deno:${deno}`),
    ).toBe(true)
    expect(
      hasSeq(buildProbeArgs(URL, 'full', settings(), b), '--js-runtimes', `deno:${deno}`),
    ).toBe(true)
  })
})

describe('video mode', () => {
  it('1080p in MP4', () => {
    const a = buildArgs(URL, opts(), settings(), bin)
    expect(hasSeq(a, '-f', 'bv*[height<=1080]+ba/b[height<=1080]')).toBe(true)
    expect(hasSeq(a, '--merge-output-format', 'mp4')).toBe(true)
    expect(hasSeq(a, '-S', 'vcodec:h264,acodec:m4a')).toBe(true)
  })

  it('best in MKV has no -S', () => {
    const a = buildArgs(
      URL,
      opts({ video: { maxHeight: 'best', container: 'mkv' } }),
      settings(),
      bin,
    )
    expect(hasSeq(a, '-f', 'bv*+ba/b')).toBe(true)
    expect(hasSeq(a, '--merge-output-format', 'mkv')).toBe(true)
    expect(a).not.toContain('-S')
  })

  it('webm has no -S', () => {
    const a = formatArgs(opts({ video: { maxHeight: 720, container: 'webm' } }))
    expect(a).not.toContain('-S')
    expect(hasSeq(a, '--merge-output-format', 'webm')).toBe(true)
  })

  it('falls back to best/mp4 when video options are missing', () => {
    const a = formatArgs(opts({ video: undefined }))
    expect(hasSeq(a, '-f', 'bv*+ba/b')).toBe(true)
    expect(hasSeq(a, '--merge-output-format', 'mp4')).toBe(true)
  })
})

describe('audio mode', () => {
  it('mp3 quality 0', () => {
    const a = buildArgs(
      URL,
      opts({ mode: 'audio', audio: { format: 'mp3', quality: 0 } }),
      settings(),
      bin,
    )
    expect(a).toContain('-x')
    expect(hasSeq(a, '--audio-format', 'mp3')).toBe(true)
    expect(hasSeq(a, '--audio-quality', '0')).toBe(true)
    expect(a).not.toContain('--merge-output-format')
  })

  it('falls back to mp3/0 when audio options are missing', () => {
    const a = formatArgs(opts({ mode: 'audio', audio: undefined }))
    expect(hasSeq(a, '--audio-format', 'mp3')).toBe(true)
    expect(hasSeq(a, '--audio-quality', '0')).toBe(true)
  })
})

describe('advanced mode', () => {
  const adv = (v: string | null, a: string | null) =>
    formatArgs(opts({ mode: 'advanced', advanced: { videoFormatId: v, audioFormatId: a } }))

  it('video + audio', () => expect(hasSeq(adv('137', '140'), '-f', '137+140')).toBe(true))
  it('video only', () => expect(hasSeq(adv('137', null), '-f', '137')).toBe(true))
  it('audio only', () => expect(hasSeq(adv(null, '140'), '-f', '140')).toBe(true))
  it('neither falls back to best', () =>
    expect(hasSeq(adv(null, null), '-f', 'bv*+ba/b')).toBe(true))
  it('missing advanced falls back to best', () =>
    expect(
      hasSeq(formatArgs(opts({ mode: 'advanced', advanced: undefined })), '-f', 'bv*+ba/b'),
    ).toBe(true))
})

describe('subtitles', () => {
  it('writes, includes auto and embeds', () => {
    const a = buildArgs(
      URL,
      opts({ subtitles: { langs: ['pt', 'en'], embed: true, includeAuto: true } }),
      settings(),
      bin,
    )
    expect(a).toEqual(expect.arrayContaining(['--write-subs', '--write-auto-subs', '--embed-subs']))
    expect(hasSeq(a, '--sub-langs', 'pt,en')).toBe(true)
  })

  it('without auto and embed', () => {
    const a = subtitleArgs({ langs: ['pt'], embed: false, includeAuto: false })
    expect(a).toEqual(['--write-subs', '--sub-langs', 'pt'])
  })

  it('emits nothing for empty langs or undefined', () => {
    const a = buildArgs(
      URL,
      opts({ subtitles: { langs: [], embed: true, includeAuto: true } }),
      settings(),
      bin,
    )
    for (const f of ['--write-subs', '--write-auto-subs', '--sub-langs', '--embed-subs']) {
      expect(a).not.toContain(f)
    }
    expect(subtitleArgs(undefined)).toEqual([])
  })
})

describe('sponsorblock', () => {
  it('remove', () => {
    const a = buildArgs(
      URL,
      opts({ sponsorBlock: { action: 'remove', categories: ['sponsor', 'selfpromo'] } }),
      settings(),
      bin,
    )
    expect(hasSeq(a, '--sponsorblock-remove', 'sponsor,selfpromo')).toBe(true)
  })

  it('mark', () => {
    expect(sponsorArgs({ action: 'mark', categories: ['intro'] })).toEqual([
      '--sponsorblock-mark',
      'intro',
    ])
  })

  it('emits nothing for empty categories or undefined', () => {
    expect(sponsorArgs({ action: 'remove', categories: [] })).toEqual([])
    expect(sponsorArgs(undefined)).toEqual([])
  })
})

describe('embed flags', () => {
  it('maps each boolean individually', () => {
    expect(embedArgs(opts({ embedThumbnail: true }))).toEqual(['--embed-thumbnail'])
    expect(embedArgs(opts({ embedMetadata: true }))).toEqual(['--embed-metadata'])
    expect(embedArgs(opts({ embedChapters: true }))).toEqual(['--embed-chapters'])
    expect(embedArgs(opts())).toEqual([])
    expect(
      embedArgs(opts({ embedThumbnail: true, embedMetadata: true, embedChapters: true })),
    ).toEqual(['--embed-thumbnail', '--embed-metadata', '--embed-chapters'])
  })
})

describe('section', () => {
  it('start-end', () => {
    const a = buildArgs(URL, opts({ section: { start: '3:15', end: '7:40' } }), settings(), bin)
    expect(hasSeq(a, '--download-sections', '*3:15-7:40')).toBe(true)
  })

  it('emits nothing when undefined', () => expect(sectionArgs(undefined)).toEqual([]))
})

describe('network and cookies', () => {
  it('cookies from browser', () => {
    const a = buildArgs(URL, opts(), settings({ cookiesBrowser: 'firefox' }), bin)
    expect(hasSeq(a, '--cookies-from-browser', 'firefox')).toBe(true)
  })

  it('no cookies for none', () => {
    expect(buildArgs(URL, opts(), settings(), bin)).not.toContain('--cookies-from-browser')
  })

  it('rate limit and proxy', () => {
    const a = buildArgs(URL, opts(), settings({ rateLimit: '2M', proxy: 'http://p:8080' }), bin)
    expect(hasSeq(a, '-r', '2M')).toBe(true)
    expect(hasSeq(a, '--proxy', 'http://p:8080')).toBe(true)
  })

  it('omits rate limit and proxy when null', () => {
    const a = buildArgs(URL, opts(), settings(), bin)
    expect(a).not.toContain('-r')
    expect(a).not.toContain('--proxy')
  })
})

describe('buildProbeArgs', () => {
  it('flat', () => {
    const a = buildProbeArgs(
      URL,
      'flat',
      settings({ cookiesBrowser: 'firefox', proxy: 'http://p:8080' }),
      bin,
    )
    expect(a).toEqual(expect.arrayContaining(['-J', '--flat-playlist']))
    expect(hasSeq(a, '--cookies-from-browser', 'firefox')).toBe(true)
    expect(hasSeq(a, '--proxy', 'http://p:8080')).toBe(true)
    expect(a).not.toContain('--no-playlist')
    expect(a[a.length - 1]).toBe(URL)
  })

  it('full', () => {
    const a = buildProbeArgs(URL, 'full', settings(), bin)
    expect(a).toEqual(expect.arrayContaining(['-J', '--no-playlist']))
    expect(hasSeq(a, '-P', 'C:\\Downloads')).toBe(true)
    expect(hasSeq(a, '-o', '%(title)s [%(id)s].%(ext)s')).toBe(true)
    expect(a).not.toContain('--flat-playlist')
    expect(a[a.length - 1]).toBe(URL)
  })
})
