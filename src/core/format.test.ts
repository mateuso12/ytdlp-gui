import { describe, expect, it } from 'vitest'
import { formatBytes, formatEta, formatSpeed } from './format'

describe('formatSpeed', () => {
  it('shows bytes per second with the units and decimal separator of the language', () => {
    expect(formatSpeed(2.4 * 1024 * 1024, 'pt-BR')).toBe('2,4 MB/s')
    expect(formatSpeed(2.4 * 1024 * 1024, 'en')).toBe('2.4 MB/s')
    expect(formatSpeed(300 * 1024, 'en')).toBe('300 KB/s')
  })
})

describe('formatEta', () => {
  it('writes minutes and seconds', () => {
    expect(formatEta(80)).toBe('1 min 20 s')
    expect(formatEta(120)).toBe('2 min')
  })

  it('writes only seconds below a minute, rounded', () => {
    expect(formatEta(45)).toBe('45 s')
    expect(formatEta(0)).toBe('0 s')
    expect(formatEta(4.6)).toBe('5 s')
  })

  it('writes hours and minutes from an hour on, dropping the seconds', () => {
    expect(formatEta(3600)).toBe('1 h')
    expect(formatEta(3725)).toBe('1 h 2 min')
  })
})

describe('format re-exports', () => {
  it('formatBytes is the one from units', () => {
    expect(formatBytes(420 * 1024 * 1024, 'en')).toBe('420 MB')
  })
})
