import { describe, expect, it } from 'vitest'
import videoJson from '../../core/__fixtures__/video.json?raw'
import { parseProbe } from '../../core/parseProbe'
import type { Format } from '../../core/types'
import { qualityOptions, resolveQuality, visibleQualityOptions } from './qualityOptions'

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

describe('qualityOptions', () => {
  it('lists the heights the video has, tallest first, with best on top', () => {
    const options = qualityOptions(formats)
    expect(options.map((o) => o.height)).toEqual(['best', 2160, 1440, 1080, 720, 480])
    expect(options.map((o) => o.label)).toEqual(['best', '4K', '1440p', '1080p', '720p', '480p'])
  })

  it('does not list heights that are not among 2160, 1440, 1080, 720 and 480', () => {
    const options = qualityOptions(formats)
    expect(options.some((o) => o.height === 360 || o.height === 144)).toBe(false)
  })

  it('the size is the biggest video up to that height plus the best audio', () => {
    const bySize = Object.fromEntries(qualityOptions(formats).map((o) => [o.height, o.sizeBytes]))
    const bestAudio = 10271496 // format 140, 129 kbps
    expect(bySize[2160]).toBe(1362269481 + bestAudio)
    expect(bySize[1080]).toBe(257619653 + bestAudio)
    expect(bySize[720]).toBe(150524867 + bestAudio)
    expect(bySize[480]).toBe(33138062 + bestAudio)
    expect(bySize.best).toBe(bySize[2160])
    for (const o of qualityOptions(formats)) expect(o.sizeBytes).not.toBeNull()
  })

  it('the size is null when no video format of the height reports one', () => {
    const options = qualityOptions([fmt({ vcodec: 'avc1', height: 1080 })])
    expect(options.map((o) => o.sizeBytes)).toEqual([null, null])
  })

  it('without audio-only formats the size is just the video', () => {
    const options = qualityOptions([fmt({ vcodec: 'avc1', height: 720, filesize: 1000 })])
    expect(options.find((o) => o.height === 720)?.sizeBytes).toBe(1000)
  })

  it('a video with only small heights is left with just "best"', () => {
    const options = qualityOptions([fmt({ vcodec: 'avc1', height: 360, filesize: 10 })])
    expect(options.map((o) => o.height)).toEqual(['best'])
    expect(options[0].sizeBytes).toBe(10)
  })

  it('a probe with no formats is left with just "best" and no size', () => {
    expect(qualityOptions([])).toEqual([{ height: 'best', label: 'best', sizeBytes: null }])
  })
})

describe('visibleQualityOptions', () => {
  it('hides "best" when the tallest listed height is the tallest video', () => {
    expect(visibleQualityOptions(formats).map((o) => o.height)).toEqual([
      2160, 1440, 1080, 720, 480,
    ])
  })

  it('keeps "best" when the video is taller than the listed heights', () => {
    const tall = [...formats, fmt({ id: '8k', vcodec: 'av01', height: 4320, filesize: 5e9 })]
    expect(visibleQualityOptions(tall).map((o) => o.height)).toEqual([
      'best',
      2160,
      1440,
      1080,
      720,
      480,
    ])
  })

  it('keeps "best" when no listed height exists', () => {
    expect(visibleQualityOptions([]).map((o) => o.height)).toEqual(['best'])
  })
})

describe('resolveQuality', () => {
  const options = visibleQualityOptions(formats)

  it('keeps a height the video has', () => {
    expect(resolveQuality(720, options)).toBe(720)
  })

  it('"best" becomes the tallest height when "best" is not listed', () => {
    expect(resolveQuality('best', options)).toBe(2160)
  })

  it('a missing height falls to the tallest one below it, or the lowest one', () => {
    const small = visibleQualityOptions([
      fmt({ vcodec: 'avc1', height: 720, filesize: 1 }),
      fmt({ vcodec: 'avc1', height: 480, filesize: 1 }),
    ])
    expect(resolveQuality(1080, small)).toBe(720)
    expect(resolveQuality(360, small)).toBe(480)
  })

  it('keeps "best" when it is listed', () => {
    expect(resolveQuality('best', visibleQualityOptions([]))).toBe('best')
  })
})
