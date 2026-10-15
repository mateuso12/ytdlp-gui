import { afterEach, describe, expect, it } from 'vitest'
import { applyTheme } from './theme'

describe('applyTheme', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme
  })

  it('resolves "system" to dark when the system is dark and writes data-theme', () => {
    expect(applyTheme('system', true)).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('resolves "system" to light when the system is light', () => {
    expect(applyTheme('system', false)).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('lets an explicit preference win over the system', () => {
    expect(applyTheme('light', true)).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(applyTheme('dark', false)).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
