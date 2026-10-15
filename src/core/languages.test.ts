import { describe, expect, it } from 'vitest'
import { languageName } from './languages'

describe('languageName', () => {
  it('names a language in the language asked for, with a capital letter', () => {
    expect(languageName('pt', 'pt-BR')).toBe('Português')
    expect(languageName('en', 'pt-BR')).toBe('Inglês')
    expect(languageName('pt', 'en')).toBe('Portuguese')
    expect(languageName('es', 'en')).toBe('Spanish')
  })

  it('keeps the region of a regional code', () => {
    expect(languageName('pt-BR', 'pt-BR')).toBe('Português (Brasil)')
  })

  it('falls back to the code when it is not a language tag', () => {
    expect(languageName('live_chat', 'en')).toBe('live_chat')
    expect(languageName('', 'en')).toBe('')
  })
})
