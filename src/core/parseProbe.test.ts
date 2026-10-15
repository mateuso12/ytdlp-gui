import { describe, expect, it } from 'vitest'
import channelFlat from './__fixtures__/channel-flat.json?raw'
import playlistFlat from './__fixtures__/playlist-flat.json?raw'
import videoSubs from './__fixtures__/video-subs.json?raw'
import video from './__fixtures__/video.json?raw'
import { ProbeParseError, parseProbe } from './parseProbe'
import type { PlaylistInfo, Probe, VideoInfo } from './types'

const fixtures = {
  'video.json': video,
  'video-subs.json': videoSubs,
  'playlist-flat.json': playlistFlat,
  'channel-flat.json': channelFlat,
}

function fixture(name: keyof typeof fixtures): unknown {
  return JSON.parse(fixtures[name])
}

function expectVideo(probe: Probe): VideoInfo {
  if (probe.kind !== 'video') throw new Error(`expected video, got ${probe.kind}`)
  return probe.video
}

function expectPlaylist(probe: Probe): PlaylistInfo {
  if (probe.kind !== 'playlist') throw new Error(`expected playlist, got ${probe.kind}`)
  return probe.playlist
}

const VIDEO_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'

describe('parseProbe: video', () => {
  const video = expectVideo(parseProbe(fixture('video.json'), VIDEO_URL))

  it('maps the basic metadata', () => {
    expect(video.id).toBe('aqz-KE-bpKQ')
    expect(video.extractor).toBe('youtube')
    expect(video.url).toBe(VIDEO_URL)
    expect(video.title).toContain('Big Buck Bunny')
    expect(video.channel).toBe('Blender')
    expect(video.uploadDate).toBe('20141110')
    expect(video.duration).toBe(635)
    expect(video.thumbnail).toMatch(/^https:\/\//)
    expect(video.chapters).toBe(0)
    expect(video.filename).toBeNull()
  })

  it('keeps downloadable formats and drops storyboards', () => {
    expect(video.formats.length).toBeGreaterThan(5)
    expect(video.formats.some((f) => f.id.startsWith('sb'))).toBe(false)
    expect(video.formats.some((f) => f.id === '401')).toBe(true)
  })

  it('maps a video-only format', () => {
    expect(video.formats.find((f) => f.id === '160')).toEqual({
      id: '160',
      ext: 'mp4',
      height: 144,
      fps: 30,
      vcodec: 'avc1.4D400C',
      acodec: null,
      abr: null,
      filesize: 4323893,
      note: '144p',
    })
  })

  it('maps an audio-only format', () => {
    expect(video.formats.find((f) => f.id === '140')).toEqual({
      id: '140',
      ext: 'm4a',
      height: null,
      fps: null,
      vcodec: null,
      acodec: 'mp4a.40.2',
      abr: 129.481,
      filesize: 10271496,
      note: 'medium',
    })
  })

  it('maps a format that reports no acodec and no size', () => {
    expect(video.formats.find((f) => f.id === '233')).toEqual({
      id: '233',
      ext: 'mp4',
      height: null,
      fps: null,
      vcodec: null,
      acodec: null,
      abr: null,
      filesize: null,
      note: 'Default, low',
    })
  })

  it('has no subtitles when the video has none', () => {
    expect(video.subtitles).toEqual([])
    expect(video.autoSubtitles).toEqual([])
  })
})

describe('parseProbe: video with subtitles', () => {
  const video = expectVideo(
    parseProbe(fixture('video-subs.json'), 'https://www.youtube.com/watch?v=WhWc3b3KhnY'),
  )

  it('lists manual subtitle languages, without the live chat pseudo-track', () => {
    expect(video.subtitles).toContain('en')
    expect(video.subtitles).not.toContain('live_chat')
  })

  it('lists automatic caption languages', () => {
    expect(video.autoSubtitles).toContain('en')
  })
})

describe('parseProbe: video edge cases', () => {
  const minimal = { id: 'abc', title: 'T', formats: [] }

  it('treats an object with an id but no _type as a video', () => {
    expect(expectVideo(parseProbe(minimal, 'https://example.com/v')).id).toBe('abc')
  })

  it('falls back to the input url, uploader and the _filename', () => {
    const video = expectVideo(
      parseProbe({ ...minimal, uploader: 'Up', _filename: 'a.mp4' }, 'https://example.com/v'),
    )
    expect(video.url).toBe('https://example.com/v')
    expect(video.extractor).toBe('generic')
    expect(video.channel).toBe('Up')
    expect(video.filename).toBe('a.mp4')
  })

  it('prefers filename over _filename and webpage_url over the input url', () => {
    const video = expectVideo(
      parseProbe(
        { ...minimal, filename: 'f.mp4', _filename: 'g.mp4', webpage_url: 'https://real/v' },
        'https://short/v',
      ),
    )
    expect(video.filename).toBe('f.mp4')
    expect(video.url).toBe('https://real/v')
  })

  it('counts chapters', () => {
    const video = expectVideo(parseProbe({ ...minimal, chapters: [{}, {}, {}] }, 'u'))
    expect(video.chapters).toBe(3)
  })

  it('uses the id as title and nulls when metadata is missing', () => {
    const video = expectVideo(parseProbe({ id: 'abc' }, 'u'))
    expect(video.title).toBe('abc')
    expect(video.channel).toBeNull()
    expect(video.uploadDate).toBeNull()
    expect(video.duration).toBeNull()
    expect(video.thumbnail).toBeNull()
    expect(video.formats).toEqual([])
  })

  it('falls back to the largest thumbnail', () => {
    const video = expectVideo(
      parseProbe({ ...minimal, thumbnails: [{ url: 'small' }, { url: 'large' }] }, 'u'),
    )
    expect(video.thumbnail).toBe('large')
  })

  it('uses filesize_approx when filesize is missing and ignores non-numeric values', () => {
    const video = expectVideo(
      parseProbe(
        {
          ...minimal,
          formats: [
            { format_id: 'a', ext: 'mp4', vcodec: 'avc1', acodec: 'none', filesize_approx: 99 },
            { format_id: 'b', ext: 'mp4', vcodec: 'avc1', height: '720', fps: 0 },
          ],
        },
        'u',
      ),
    )
    expect(video.formats[0].filesize).toBe(99)
    expect(video.formats[1].height).toBeNull()
    expect(video.formats[1].fps).toBeNull()
  })

  it('skips malformed format entries', () => {
    const video = expectVideo(
      parseProbe({ ...minimal, formats: [null, 'x', { ext: 'mp4' }, { format_id: 'ok' }] }, 'u'),
    )
    expect(video.formats.map((f) => f.id)).toEqual(['ok'])
  })
})

describe('parseProbe: playlist', () => {
  const raw = fixture('playlist-flat.json') as { entries: unknown[] }
  const playlist = expectPlaylist(
    parseProbe(raw, 'https://www.youtube.com/playlist?list=PLa1F2ddGya_8Pn07ZxzgxFRw5iQbovXZv'),
  )

  it('maps the playlist metadata', () => {
    expect(playlist.id).toBe('PLa1F2ddGya_8Pn07ZxzgxFRw5iQbovXZv')
    expect(playlist.extractor).toBe('youtube:tab')
    expect(playlist.title).toBe('Settlers')
    expect(playlist.channel).toBe('Blender')
  })

  it('keeps every entry of the fixture', () => {
    expect(playlist.entries).toHaveLength(raw.entries.length)
    expect(playlist.entries).toHaveLength(8)
  })

  it('maps an entry', () => {
    expect(playlist.entries[0]).toEqual({
      id: 'BIRCCQHz-B8',
      url: 'https://www.youtube.com/watch?v=BIRCCQHz-B8',
      title: 'Settlers - Character Modeling Preparation',
      duration: 1103,
      thumbnail: expect.stringMatching(/^https:\/\/i\.ytimg\.com\//),
      available: true,
    })
  })

  it('keeps the size of an entry only when yt-dlp reported one', () => {
    const entries = [
      { id: 'a', url: 'https://v/a', title: 'A', filesize: 1000 },
      { id: 'b', url: 'https://v/b', title: 'B', filesize_approx: 2000 },
      { id: 'c', url: 'https://v/c', title: 'C', filesize: 'big' },
      { id: 'd', url: 'https://v/d', title: 'D', filesize: 0 },
      { id: 'e', url: 'https://v/e', title: 'E', filesize: 0, filesize_approx: 3000 },
    ]
    const parsed = expectPlaylist(
      parseProbe({ _type: 'playlist', id: 'PL', title: 'P', entries }, 'u'),
    )
    expect(parsed.entries.map((e) => e.sizeBytes)).toEqual([1000, 2000, undefined, undefined, 3000])
    // The flat fixture has no sizes at all.
    expect(playlist.entries.every((e) => e.sizeBytes === undefined)).toBe(true)
  })

  it('marks an entry without a title as unavailable instead of failing', () => {
    const entries = [
      { id: 'a', url: 'https://v/a', title: null },
      { id: 'b', url: 'https://v/b', title: 'Fine', duration: 5 },
    ]
    const parsed = expectPlaylist(
      parseProbe({ _type: 'playlist', id: 'PL', title: 'P', entries }, 'u'),
    )
    expect(parsed.entries.map((e) => [e.id, e.available])).toEqual([
      ['a', false],
      ['b', true],
    ])
    expect(parsed.entries[0].title).toBeNull()
  })

  it.each(['[Private video]', '[Deleted video]', ''])(
    'marks the placeholder title %j as unavailable',
    (title) => {
      const parsed = expectPlaylist(
        parseProbe({ _type: 'playlist', id: 'PL', entries: [{ id: 'a', url: 'x', title }] }, 'u'),
      )
      expect(parsed.entries[0].available).toBe(false)
    },
  )

  it('falls back to the input url, the id as title and a null channel', () => {
    const parsed = expectPlaylist(parseProbe({ _type: 'playlist', id: 'PL' }, 'u'))
    expect(parsed.title).toBe('PL')
    expect(parsed.channel).toBeNull()
    expect(parsed.extractor).toBe('generic')
    expect(parsed.entries).toEqual([])
  })

  it('uses the input url as id when the playlist has none', () => {
    const parsed = expectPlaylist(parseProbe({ _type: 'playlist', entries: [] }, 'https://p'))
    expect(parsed.id).toBe('https://p')
  })

  it('treats multi_video like a playlist', () => {
    expect(parseProbe({ _type: 'multi_video', id: 'm', entries: [] }, 'u').kind).toBe('playlist')
  })

  it('fills the entry url from webpage_url and the thumbnail from the thumbnails list', () => {
    const parsed = expectPlaylist(
      parseProbe(
        {
          _type: 'playlist',
          id: 'PL',
          entries: [
            {
              id: 'a',
              webpage_url: 'https://w/a',
              title: 'A',
              thumbnails: [{ url: 't1' }, { url: 't2' }],
            },
          ],
        },
        'u',
      ),
    )
    expect(parsed.entries[0].url).toBe('https://w/a')
    expect(parsed.entries[0].thumbnail).toBe('t2')
  })

  it('skips null entries, entries without id or url, and duplicates', () => {
    const parsed = expectPlaylist(
      parseProbe(
        {
          _type: 'playlist',
          id: 'PL',
          entries: [
            null,
            'x',
            { title: 'no id and no url' },
            { id: 'a', url: 'https://v/a', title: 'A' },
            { id: 'a', url: 'https://v/a', title: 'A again' },
            { url: 'https://v/only-url', title: 'U' },
          ],
        },
        'u',
      ),
    )
    expect(parsed.entries.map((e) => e.id)).toEqual(['a', 'https://v/only-url'])
    expect(parsed.entries[0].title).toBe('A')
  })
})

describe('parseProbe: channel with nested tabs', () => {
  const raw = fixture('channel-flat.json') as {
    entries: { _type: string; entries: { id: string }[] }[]
  }
  const playlist = expectPlaylist(parseProbe(raw, 'https://www.youtube.com/@BlenderOfficial'))

  it('has nested playlists in the raw output', () => {
    expect(raw.entries.length).toBeGreaterThan(1)
    expect(raw.entries.every((e) => e._type === 'playlist')).toBe(true)
  })

  it('flattens the tabs into video entries', () => {
    const total = raw.entries.reduce((sum, tab) => sum + tab.entries.length, 0)
    expect(playlist.entries).toHaveLength(total)
    expect(playlist.entries.every((e) => e.url.startsWith('https://www.youtube.com/'))).toBe(true)
    expect(playlist.entries.every((e) => e.available)).toBe(true)
  })

  it('keeps the channel metadata', () => {
    expect(playlist.title).toBe('Blender')
    expect(playlist.channel).toBe('Blender')
  })

  it('flattens arbitrarily deep nesting and drops repeats across tabs', () => {
    const leaf = (id: string) => ({ id, url: `https://v/${id}`, title: id })
    const parsed = expectPlaylist(
      parseProbe(
        {
          _type: 'playlist',
          id: 'root',
          entries: [
            { _type: 'playlist', id: 't1', entries: [leaf('a'), leaf('b')] },
            {
              _type: 'playlist',
              id: 't2',
              entries: [{ _type: 'playlist', id: 'inner', entries: [leaf('b'), leaf('c')] }],
            },
          ],
        },
        'u',
      ),
    )
    expect(parsed.entries.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('parseProbe: invalid input', () => {
  it('throws ProbeParseError for an empty object', () => {
    expect(() => parseProbe({}, 'u')).toThrow(ProbeParseError)
  })

  it.each([null, undefined, 'text', 42, []])('throws ProbeParseError for %j', (input) => {
    expect(() => parseProbe(input, 'u')).toThrow(ProbeParseError)
  })

  it('throws ProbeParseError for a video type without an id', () => {
    expect(() => parseProbe({ _type: 'video', title: 'x' }, 'u')).toThrow(ProbeParseError)
  })

  it('is a named Error subclass', () => {
    const error = new ProbeParseError('boom')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ProbeParseError')
    expect(error.message).toBe('boom')
  })
})
