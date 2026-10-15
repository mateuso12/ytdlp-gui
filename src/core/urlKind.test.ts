import { describe, expect, it } from 'vitest'
import { splitUrls } from './splitUrls'
import { urlKind } from './urlKind'

describe('urlKind', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abc', 'single'],
    ['https://www.youtube.com/playlist?list=PL1', 'playlist'],
    ['https://www.youtube.com/watch?v=abc&list=PL1', 'ambiguous'],
    ['https://www.youtube.com/watch?v=abc&list=RDabc', 'single'],
    ['https://youtu.be/abc?list=PL1', 'ambiguous'],
    ['https://youtu.be/abc', 'single'],
    ['https://youtu.be/abc?list=RDabc', 'single'],
    ['https://m.youtube.com/watch?v=abc', 'single'],
    ['https://music.youtube.com/watch?v=abc&list=PL1', 'ambiguous'],
    ['https://music.youtube.com/playlist?list=PL1', 'playlist'],
    ['https://youtube.com/watch?v=abc', 'single'],
    ['https://www.youtube.com/shorts/abc', 'single'],
    ['https://www.youtube.com/watch?list=PL1', 'playlist'],
    ['https://www.youtube.com/watch?v=abc&list=PL1&index=2', 'ambiguous'],
    ['https://www.youtube.com/@channel', 'unknown'],
    ['https://www.youtube.com/', 'unknown'],
    ['https://youtu.be/', 'unknown'],
    ['https://vimeo.com/123', 'unknown'],
    ['https://notyoutube.com/watch?v=abc&list=PL1', 'unknown'],
    ['https://www.youtube.com.evil.com/watch?v=abc', 'unknown'],
    ['texto qualquer', 'unknown'],
    ['', 'unknown'],
    ['ftp://www.youtube.com/watch?v=abc', 'unknown'],
  ] as const)('%s -> %s', (url, expected) => {
    expect(urlKind(url)).toBe(expected)
  })

  it('tolerates surrounding whitespace', () => {
    expect(urlKind('  https://www.youtube.com/watch?v=abc \n')).toBe('single')
  })
})

describe('splitUrls', () => {
  it('extracts urls, ignoring other text and duplicates', () => {
    expect(splitUrls('https://a.com/x\n  https://b.com/y foo')).toEqual([
      'https://a.com/x',
      'https://b.com/y',
    ])
  })

  it('removes duplicates keeping first occurrence order', () => {
    expect(splitUrls('https://b.com\nhttps://a.com\nhttps://b.com')).toEqual([
      'https://b.com',
      'https://a.com',
    ])
  })

  it('ignores invalid and non-http urls', () => {
    expect(splitUrls('foo ftp://a.com http:// https://ok.com bar')).toEqual(['https://ok.com'])
  })

  it('returns an empty list for empty text', () => {
    expect(splitUrls('')).toEqual([])
    expect(splitUrls('   \n ')).toEqual([])
  })

  it('handles CRLF and tabs', () => {
    expect(splitUrls('https://a.com\r\nhttps://b.com\thttps://c.com')).toEqual([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ])
  })
})
