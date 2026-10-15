import { describe, expect, it } from 'vitest'
import { APP_NAME } from './brand'

describe('brand', () => {
  it('exposes the app name', () => {
    expect(APP_NAME).toBe('ytdlp-gui')
  })
})
