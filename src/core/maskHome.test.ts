import { describe, expect, it } from 'vitest'
import { maskHome } from './maskHome'

describe('maskHome', () => {
  it.each([
    ['C:\\Users\\Mateus Amaro\\Vídeos\\x', '~\\Vídeos\\x'],
    ['C:\\\\Users\\\\Mateus Amaro\\\\x', '~\\\\x'],
    ['C:/Users/Mateus Amaro/x', '~/x'],
    ['/home/mateus_amaro/x', '~/x'],
    ['/Users/Mateus Amaro/x', '~/x'],
    ["Permission denied: 'C:\\\\Users\\\\Mateus Amaro'", "Permission denied: '~'"],
    ['Permission denied: /home/ana', 'Permission denied: ~'],
    ['in C:\\Users\\Mateus Amaro: access denied', 'in ~: access denied'],
    ['-P=/Users/ana/Movies', '-P=~/Movies'],
    ['(C:\\Users\\ana\\x)', '(~\\x)'],
  ])('masks %s', (input, expected) => {
    expect(maskHome(input)).toBe(expected)
  })

  it.each([
    'https://example.com/home/videos/1',
    'https://example.com/Users/foo/bar',
    '/usr/local/bin/ffmpeg',
    'nothing to hide',
  ])('leaves %s alone', (input) => {
    expect(maskHome(input)).toBe(input)
  })
})

describe('browser compatibility', () => {
  // WKWebView before Safari 16.4 throws a SyntaxError on regexp lookbehind, at module load.
  it('no source file under src uses regexp lookbehind', () => {
    const files = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
      eager: true,
      query: '?raw',
      import: 'default',
    })
    expect(Object.keys(files).length).toBeGreaterThan(20)
    const offenders = Object.entries(files)
      .filter(([, source]) => /\(\?<[=!]/.test(source.replace(/String\.raw`[^`]*`/g, '')))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
