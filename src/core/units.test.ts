import { describe, expect, it } from 'vitest'
import { formatBytes } from './units'

describe('formatBytes', () => {
  it('uses MB below a gigabyte and GB from a gigabyte, in binary steps', () => {
    expect(formatBytes(420 * 1024 * 1024, 'en')).toBe('420 MB')
    expect(formatBytes(1.9 * 1024 ** 3, 'en')).toBe('1.9 GB')
    expect(formatBytes(1024 ** 3, 'en')).toBe('1 GB')
  })

  it('follows the decimal separator of the language', () => {
    expect(formatBytes(1.9 * 1024 ** 3, 'pt-BR')).toBe('1,9 GB')
  })

  it('shows KB for small files and rounds MB to whole numbers above 10', () => {
    expect(formatBytes(512, 'en')).toBe('1 KB')
    expect(formatBytes(300 * 1024, 'en')).toBe('300 KB')
    expect(formatBytes(4.26 * 1024 * 1024, 'en')).toBe('4.3 MB')
    expect(formatBytes(255.5 * 1024 * 1024, 'en')).toBe('256 MB')
  })
})
