import { describe, expect, it } from 'vitest'
import type { PlaylistEntry } from '../../core/types'
import {
  entryExtractor,
  formatTotalDuration,
  initialSelection,
  isSelectable,
  parseRange,
} from './selection'

function entry(id: string, over: Partial<PlaylistEntry> = {}): PlaylistEntry {
  return {
    id,
    url: `https://v/${id}`,
    title: `Title ${id}`,
    duration: 60,
    thumbnail: null,
    available: true,
    ...over,
  }
}

const set = (r: Set<number> | Error) => {
  if (r instanceof Error) throw r
  return [...r].sort((a, b) => a - b)
}

describe('parseRange', () => {
  it('reads single items and closed ranges, counting from 1', () => {
    expect(set(parseRange('1-3,7', 10))).toEqual([1, 2, 3, 7])
  })

  it('reads an open range up to the last item', () => {
    expect(set(parseRange('10-', 12))).toEqual([10, 11, 12])
  })

  it('reads a range that starts at the beginning', () => {
    expect(set(parseRange('-3', 10))).toEqual([1, 2, 3])
  })

  it('accepts spaces and the example of the brief', () => {
    expect(set(parseRange('1-3, 7, 10-', 12))).toEqual([1, 2, 3, 7, 10, 11, 12])
  })

  it('merges overlapping parts and ignores a trailing comma', () => {
    expect(set(parseRange('1-4, 3-5,', 10))).toEqual([1, 2, 3, 4, 5])
  })

  it('clamps the end of a range to the last item', () => {
    expect(set(parseRange('3-99', 5))).toEqual([3, 4, 5])
  })

  it.each(['0', 'a', '1-a', '0-3', '-', '1--3', '1.5', '2-1'])('rejects %j as invalid', (input) => {
    const r = parseRange(input, 5)
    expect(r).toBeInstanceOf(Error)
    expect((r as Error).message).toBe('invalid')
  })

  it('rejects an empty input', () => {
    const r = parseRange('  ', 5)
    expect(r).toBeInstanceOf(Error)
    expect((r as Error).message).toBe('empty')
  })

  it('rejects items past the end', () => {
    for (const input of ['6', '9-12', '6-']) {
      const r = parseRange(input, 5)
      expect(r).toBeInstanceOf(Error)
      expect((r as Error).message).toBe('outOfRange')
    }
  })

  it('rejects everything on an empty list', () => {
    expect(parseRange('1', 0)).toBeInstanceOf(Error)
  })
})

describe('isSelectable', () => {
  it('needs an available entry with a link', () => {
    expect(isSelectable(entry('a'))).toBe(true)
    expect(isSelectable(entry('a', { available: false }))).toBe(false)
    expect(isSelectable(entry('a', { url: '' }))).toBe(false)
  })
})

describe('initialSelection', () => {
  it('leaves out unavailable entries and the ones the history knows', () => {
    const entries = [
      entry('a'),
      entry('b', { available: false }),
      entry('c'),
      entry('d'),
      entry('e', { url: '' }),
    ]
    const selected = initialSelection(entries, (e) => e.id === 'c')
    expect(set(selected)).toEqual([1, 4])
  })

  it('selects everything on a fresh history', () => {
    expect(set(initialSelection([entry('a'), entry('b')], () => false))).toEqual([1, 2])
  })

  it('is empty for an empty list', () => {
    expect(initialSelection([], () => false).size).toBe(0)
  })
})

describe('entryExtractor', () => {
  it('drops the playlist suffix so the entries match what a single video reports', () => {
    expect(entryExtractor('youtube:tab')).toBe('youtube')
    expect(entryExtractor('soundcloud:set')).toBe('soundcloud')
    expect(entryExtractor('generic')).toBe('generic')
  })
})

describe('formatTotalDuration', () => {
  it('writes hours and minutes, or minutes alone', () => {
    expect(formatTotalDuration(6 * 3600 + 12 * 60 + 5)).toBe('6 h 12 min')
    expect(formatTotalDuration(3600)).toBe('1 h')
    expect(formatTotalDuration(45 * 60)).toBe('45 min')
    expect(formatTotalDuration(20)).toBe('1 min')
  })
})
