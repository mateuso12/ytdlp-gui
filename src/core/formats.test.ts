import { describe, expect, it } from 'vitest'
import videoJson from './__fixtures__/video.json?raw'
import { parseProbe } from './parseProbe'
import type { Format } from './types'
import {
  audioTracks,
  bestAudio,
  codecLabel,
  maxVideoHeight,
  swapExtension,
  topVideoLabel,
  videoTracks,
} from './formats'

const probe = parseProbe(JSON.parse(videoJson), 'https://x/')
if (probe.kind !== 'video') throw new Error('fixture is not a video')
const { formats } = probe.video

const fmt = (over: Partial<Format>): Format => ({
  id: 'x',
  ext: 'mp4',
  height: null,
  fps: null,
  vcodec: null,
  acodec: null,
  abr: null,
  filesize: null,
  note: '',
  ...over,
})

describe('tracks', () => {
  it('splits the real formats into video and audio-only tracks, best first', () => {
    const video = videoTracks(formats)
    const audio = audioTracks(formats)
    expect(video[0]).toMatchObject({ height: 2160 })
    expect(video.every((f) => f.vcodec !== null)).toBe(true)
    const heights = video.map((f) => f.height ?? 0)
    expect([...heights].sort((a, b) => b - a)).toEqual(heights)
    expect(audio.every((f) => f.vcodec === null && f.acodec !== null)).toBe(true)
    expect(audio[0].abr).toBeGreaterThanOrEqual(audio[audio.length - 1].abr ?? 0)
  })

  it('puts 60 fps before 30 fps of the same height, then the bigger file first', () => {
    const list = [
      fmt({ id: 'a', vcodec: 'avc1', height: 720, fps: 30, filesize: 5 }),
      fmt({ id: 'b', vcodec: 'avc1', height: 720, fps: 60, filesize: 1 }),
      fmt({ id: 'c', vcodec: 'vp9', height: 720, fps: 30, filesize: 9 }),
      fmt({ id: 'd', vcodec: 'vp9', height: 720, fps: 30, filesize: null }),
    ]
    expect(videoTracks(list).map((f) => f.id)).toEqual(['b', 'c', 'a', 'd'])
  })
})

describe('bestAudio', () => {
  it('is the audio-only format with the highest bitrate', () => {
    expect(bestAudio(formats)?.abr).toBeCloseTo(129.481, 2)
  })

  it('is null when there is no audio-only format', () => {
    expect(bestAudio([fmt({ vcodec: 'avc1', acodec: 'mp4a' })])).toBeNull()
  })
})

describe('maxVideoHeight and topVideoLabel', () => {
  it('reads the tallest video', () => {
    expect(maxVideoHeight(formats)).toBe(2160)
    expect(topVideoLabel(formats)).toBe('2160p60')
  })

  it('writes the fps only above 30', () => {
    expect(topVideoLabel([fmt({ vcodec: 'avc1', height: 1080, fps: 30 })])).toBe('1080p')
    expect(topVideoLabel([fmt({ vcodec: 'avc1', height: 720, fps: null })])).toBe('720p')
  })

  it('is null without video', () => {
    expect(maxVideoHeight([fmt({ acodec: 'opus' })])).toBeNull()
    expect(topVideoLabel([])).toBeNull()
  })
})

describe('codecLabel', () => {
  it('gives the common name of a codec string', () => {
    expect(codecLabel('opus')).toBe('Opus')
    expect(codecLabel('mp4a.40.2')).toBe('AAC')
    expect(codecLabel('vp09.00.40.08')).toBe('VP9')
    expect(codecLabel('vp9')).toBe('VP9')
    expect(codecLabel('avc1.640028')).toBe('H.264')
    expect(codecLabel('av01.0.12M.08')).toBe('AV1')
    expect(codecLabel('vorbis')).toBe('Vorbis')
    expect(codecLabel('flac')).toBe('FLAC')
    expect(codecLabel('weird.thing')).toBe('WEIRD')
    expect(codecLabel(null)).toBe('')
  })
})

describe('swapExtension', () => {
  it('replaces the extension of the file name only', () => {
    expect(swapExtension('C:\\Videos\\clip.webm', 'mp4')).toBe('C:\\Videos\\clip.mp4')
    expect(swapExtension('/home/u/a.b/clip.mkv', 'mp3')).toBe('/home/u/a.b/clip.mp3')
    expect(swapExtension('/home/u/a.b/clip', 'mp3')).toBe('/home/u/a.b/clip')
  })
})

describe('tie-breaks between audio tracks', () => {
  it('a DRC copy of the same quality comes after the plain one', () => {
    const list = [
      fmt({ id: '140-drc', acodec: 'mp4a', abr: 129.4, filesize: 10, note: 'medium, DRC' }),
      fmt({ id: '140', acodec: 'mp4a', abr: 129.4, filesize: 10, note: 'medium' }),
    ]
    expect(audioTracks(list).map((f) => f.id)).toEqual(['140', '140-drc'])
    expect(bestAudio(list)?.id).toBe('140')
  })
})
