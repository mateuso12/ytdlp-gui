import { describe, expect, it } from 'vitest'
import { formatTimecode, parseSection, parseTimecode } from './timecode'

describe('parseTimecode', () => {
  it('accepts m:ss', () => {
    expect(parseTimecode('3:15')).toBe(195)
    expect(parseTimecode('0:05')).toBe(5)
    expect(parseTimecode('90:00')).toBe(5400)
  })

  it('accepts h:mm:ss', () => {
    expect(parseTimecode('1:02:03')).toBe(3723)
    expect(parseTimecode('0:00:10')).toBe(10)
  })

  it('accepts plain seconds, with an optional fraction', () => {
    expect(parseTimecode('90')).toBe(90)
    expect(parseTimecode('0')).toBe(0)
    expect(parseTimecode('12.5')).toBe(12.5)
    expect(parseTimecode('1:05.5')).toBe(65.5)
  })

  it('ignores the spaces around the text', () => {
    expect(parseTimecode('  3:15 ')).toBe(195)
  })

  it('rejects what is not a time', () => {
    const bad = ['', ' ', 'abc', '1:2:3:4', ':30', '3:', '-5', '1:60', '1:00:60', '1:60:00', '3:5']
    for (const text of bad) {
      expect(parseTimecode(text), text).toBeNull()
    }
  })
})

describe('formatTimecode', () => {
  it('writes m:ss below an hour and h:mm:ss from an hour', () => {
    expect(formatTimecode(0)).toBe('0:00')
    expect(formatTimecode(195)).toBe('3:15')
    expect(formatTimecode(3599)).toBe('59:59')
    expect(formatTimecode(3600)).toBe('1:00:00')
    expect(formatTimecode(3723)).toBe('1:02:03')
  })

  it('keeps a fraction of a second', () => {
    expect(formatTimecode(65.5)).toBe('1:05.5')
  })
})

describe('parseSection', () => {
  it('both empty means no section', () => {
    expect(parseSection('', '  ')).toEqual({ ok: true, section: null })
  })

  it('accepts 3:15 → 7:40 and writes it back normalised', () => {
    expect(parseSection('3:15', '7:40')).toEqual({
      ok: true,
      section: { start: '3:15', end: '7:40' },
    })
    expect(parseSection('195', '1:00:00')).toEqual({
      ok: true,
      section: { start: '3:15', end: '1:00:00' },
    })
  })

  it('an empty start means the beginning, an empty end means the end of the video', () => {
    expect(parseSection('', '7:40')).toEqual({ ok: true, section: { start: '0:00', end: '7:40' } })
    expect(parseSection('3:15', '')).toEqual({ ok: true, section: { start: '3:15', end: 'inf' } })
  })

  it('end at or before start is an error on the end field', () => {
    expect(parseSection('7:40', '3:15')).toEqual({ ok: false, error: 'order', field: 'end' })
    expect(parseSection('3:15', '195')).toEqual({ ok: false, error: 'order', field: 'end' })
    expect(parseSection('', '0')).toEqual({ ok: false, error: 'order', field: 'end' })
  })

  it('names the field that is not a time', () => {
    expect(parseSection('abc', '7:40')).toEqual({ ok: false, error: 'format', field: 'start' })
    expect(parseSection('3:15', '7:99')).toEqual({ ok: false, error: 'format', field: 'end' })
  })

  it('a start after the end of the video is an error when the duration is known', () => {
    expect(parseSection('11:00', '', 635)).toEqual({ ok: false, error: 'beyond', field: 'start' })
    expect(parseSection('10:00', '20:00', 635)).toMatchObject({ ok: true })
    expect(parseSection('11:00', '', null)).toMatchObject({ ok: true })
  })
})
