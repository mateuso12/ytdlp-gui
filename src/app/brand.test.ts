import { describe, expect, it } from 'vitest'
import { APP_AUTHOR, APP_NAME, REPO_URL } from './brand'

describe('brand', () => {
  it('exposes the app name and author', () => {
    expect(APP_NAME).toBe('ytdlp-gui')
    expect(APP_AUTHOR).toBe('Mateus Amaro')
  })

  it('points at the real repository, not the OWNER placeholder', () => {
    expect(REPO_URL).not.toContain('OWNER')
    expect(REPO_URL).toMatch(/^https:\/\/github\.com\/[\w-]+\/ytdlp-gui$/)
  })
})
