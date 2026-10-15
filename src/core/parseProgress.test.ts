import { describe, expect, it } from 'vitest'
import audio from './__fixtures__/progress-audio.txt?raw'
import video from './__fixtures__/progress-video.txt?raw'
import { FILE_MARK, PROGRESS_MARK } from './buildArgs'
import { parseLine } from './parseProgress'
import type { ProgressEvent } from './types'

const lines = (raw: string) => raw.split(/\r?\n/).filter((l) => l !== '')

const progress = (obj: Record<string, unknown>) =>
  parseLine(`${PROGRESS_MARK}${JSON.stringify(obj)}`)

describe('parseLine: progress', () => {
  it('turns every progress line of the fixtures into a progress event', () => {
    for (const raw of [video, audio]) {
      const progressLines = lines(raw).filter((l) => l.startsWith(PROGRESS_MARK))
      expect(progressLines.length).toBeGreaterThan(10)
      for (const l of progressLines) {
        expect(parseLine(l)?.type).toBe('progress')
      }
    }
  })

  it('computes percent from downloaded_bytes / total_bytes', () => {
    const e = progress({
      status: 'downloading',
      downloaded_bytes: 250,
      total_bytes: 1000,
      speed: 100.5,
      eta: 7,
    })
    expect(e).toEqual({
      type: 'progress',
      data: {
        phase: 'downloading',
        percent: 25,
        speed: 100.5,
        eta: 7,
        totalBytes: 1000,
        downloadedBytes: 250,
      },
    })
  })

  it('falls back to total_bytes_estimate', () => {
    const e = progress({ downloaded_bytes: 500, total_bytes_estimate: 2000 })
    expect(e).toMatchObject({ data: { percent: 25, totalBytes: 2000, downloadedBytes: 500 } })
  })

  it('prefers total_bytes over the estimate', () => {
    const e = progress({ downloaded_bytes: 500, total_bytes: 1000, total_bytes_estimate: 2000 })
    expect(e).toMatchObject({ data: { percent: 50, totalBytes: 1000 } })
  })

  it('has null percent when no total is known', () => {
    const e = progress({ status: 'downloading', downloaded_bytes: 500, total_bytes: null })
    expect(e).toMatchObject({ data: { percent: null, totalBytes: null, downloadedBytes: 500 } })
  })

  it('has null percent for a zero total or missing downloaded bytes', () => {
    expect(progress({ downloaded_bytes: 0, total_bytes: 0 })).toMatchObject({
      data: { percent: null },
    })
    expect(progress({ total_bytes: 1000 })).toMatchObject({
      data: { percent: null, downloadedBytes: null },
    })
  })

  it('clamps percent to 0..100', () => {
    expect(progress({ downloaded_bytes: 1500, total_bytes_estimate: 1000 })).toMatchObject({
      data: { percent: 100 },
    })
    expect(progress({ downloaded_bytes: -5, total_bytes: 1000 })).toMatchObject({
      data: { percent: 0 },
    })
  })

  it('keeps null speed and eta, and drops non-numeric values', () => {
    expect(progress({ downloaded_bytes: 1, total_bytes: 2, speed: null, eta: null })).toMatchObject(
      { data: { speed: null, eta: null } },
    )
    expect(
      progress({ downloaded_bytes: 1, total_bytes: 2, speed: 'fast', eta: '5' }),
    ).toMatchObject({ data: { speed: null, eta: null } })
  })

  it('handles the finished line of the fixtures (100%)', () => {
    const finished = lines(video).find(
      (l) => l.startsWith(PROGRESS_MARK) && l.includes('"status": "finished"'),
    )
    expect(finished).toBeDefined()
    expect(parseLine(finished ?? '')).toMatchObject({ type: 'progress', data: { percent: 100 } })
  })

  it('tolerates a trailing carriage return', () => {
    const e = parseLine(`${PROGRESS_MARK}{"downloaded_bytes":1,"total_bytes":4}\r`)
    expect(e).toMatchObject({ type: 'progress', data: { percent: 25 } })
  })

  it('returns null (and does not throw) for truncated or non-object JSON', () => {
    expect(parseLine(`${PROGRESS_MARK}{"status": "downloading", "downloaded_by`)).toBeNull()
    expect(parseLine(`${PROGRESS_MARK}`)).toBeNull()
    expect(parseLine(`${PROGRESS_MARK}42`)).toBeNull()
    expect(parseLine(`${PROGRESS_MARK}null`)).toBeNull()
    expect(parseLine(`${PROGRESS_MARK}[1,2]`)).toBeNull()
  })

  it('percent never decreases within one file in the real fixtures', () => {
    // A file boundary is a `[download] Destination:` line (yt-dlp prints one before every
    // file it downloads: video stream, audio stream, ...). Each group is checked on its own,
    // since the percent legitimately resets to ~0 when the next stream starts. As a second
    // guard, downloaded_bytes must also be non-decreasing inside a group, which proves the
    // grouping really isolates single files.
    for (const raw of [video, audio]) {
      const groups: ProgressEvent[][] = []
      for (const l of lines(raw)) {
        if (l.startsWith('[download] Destination:')) {
          groups.push([])
          continue
        }
        const e = parseLine(l)
        if (e?.type === 'progress') {
          expect(groups.length).toBeGreaterThan(0)
          groups[groups.length - 1].push(e.data)
        }
      }
      expect(groups.length).toBeGreaterThanOrEqual(1)
      for (const group of groups) {
        expect(group.length).toBeGreaterThan(1)
        let lastPercent = -1
        let lastBytes = -1
        for (const ev of group) {
          const percent = ev.percent ?? Number.NaN
          const bytes = ev.downloadedBytes ?? Number.NaN
          expect(percent).toBeGreaterThanOrEqual(lastPercent)
          expect(bytes).toBeGreaterThanOrEqual(lastBytes)
          lastPercent = percent
          lastBytes = bytes
        }
        expect(lastPercent).toBe(100)
      }
    }
    // the video fixture downloads two separate streams (video + audio)
    expect(lines(video).filter((l) => l.startsWith('[download] Destination:'))).toHaveLength(2)
  })
})

describe('parseLine: phases', () => {
  it('maps [Merger] to merging', () => {
    expect(parseLine('[Merger] Merging formats into "out.mkv"')).toEqual({
      type: 'phase',
      phase: 'merging',
    })
  })

  it.each(['ExtractAudio', 'SponsorBlock', 'EmbedSubtitle', 'EmbedThumbnail', 'Metadata'])(
    'maps [%s] to postprocessing',
    (tag) => {
      expect(parseLine(`[${tag}] something happening`)).toEqual({
        type: 'phase',
        phase: 'postprocessing',
      })
    },
  )

  it('recognises the phases in the real fixtures', () => {
    expect(
      lines(video)
        .map(parseLine)
        .filter((e) => e?.type === 'phase'),
    ).toEqual([{ type: 'phase', phase: 'merging' }])
    expect(
      lines(audio)
        .map(parseLine)
        .filter((e) => e?.type === 'phase'),
    ).toEqual([{ type: 'phase', phase: 'postprocessing' }])
  })

  it('tolerates a trailing carriage return', () => {
    expect(parseLine('[Merger] Merging formats into "x.mkv"\r')).toEqual({
      type: 'phase',
      phase: 'merging',
    })
  })
})

describe('parseLine: file', () => {
  it('extracts a Windows path with spaces', () => {
    expect(parseLine(`${FILE_MARK}C:\\a b\\x.mp4`)).toEqual({
      type: 'file',
      path: 'C:\\a b\\x.mp4',
    })
  })

  it('strips only the line terminator', () => {
    expect(parseLine(`${FILE_MARK}C:\\a b\\x.mp4\r`)).toEqual({
      type: 'file',
      path: 'C:\\a b\\x.mp4',
    })
  })

  it('finds the final file line in the fixtures', () => {
    expect(
      lines(video)
        .map(parseLine)
        .filter((e) => e?.type === 'file'),
    ).toEqual([{ type: 'file', path: '.cache/dl/aqz-KE-bpKQ.mkv' }])
    expect(
      lines(audio)
        .map(parseLine)
        .filter((e) => e?.type === 'file'),
    ).toEqual([{ type: 'file', path: '.cache/dl/aqz-KE-bpKQ.mp3' }])
  })

  it('returns null for an empty path', () => {
    expect(parseLine(FILE_MARK)).toBeNull()
  })
})

describe('parseLine: other lines', () => {
  it.each([
    '',
    'hello world',
    '[youtube] abc: Downloading webpage',
    '[download] Destination: x.mp4',
    '[info] abc: Downloading 1 format(s): 18',
    'Deleting original file x.m4a (pass -k to keep)',
    '[ytdlp-gui',
  ])('returns null for %j', (line) => {
    expect(parseLine(line)).toBeNull()
  })
})
