import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import ptBR from './locales/pt-BR.json'
import { detectLocale } from './index'

function keyPaths(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) return [prefix]
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    keyPaths(value, prefix ? `${prefix}.${key}` : key),
  )
}

describe('locales', () => {
  it('en has exactly the same keys as pt-BR (recursive)', () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(ptBR).sort())
  })

  it('has no empty strings', () => {
    for (const locale of [en, ptBR]) {
      for (const path of keyPaths(locale)) {
        const value = path
          .split('.')
          .reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], locale)
        expect(value, path).not.toBe('')
      }
    }
  })
})

describe('detectLocale', () => {
  it('maps pt* to pt-BR and everything else to en', () => {
    expect(detectLocale('pt-BR')).toBe('pt-BR')
    expect(detectLocale('pt-PT')).toBe('pt-BR')
    expect(detectLocale('pt')).toBe('pt-BR')
    expect(detectLocale('en-US')).toBe('en')
    expect(detectLocale('de')).toBe('en')
    expect(detectLocale(undefined)).toBe('en')
  })
})
