export type UrlKind = 'single' | 'playlist' | 'ambiguous' | 'unknown'

function parseHttpUrl(text: string): URL | null {
  try {
    const url = new URL(text.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function isYoutubeHost(host: string): boolean {
  return host === 'youtube.com' || host.endsWith('.youtube.com')
}

/** Paths under youtube.com that point at one specific video. */
const SINGLE_VIDEO_PATH = /^\/(?:shorts|live|embed|v)\/[^/]+/

/**
 * Cheap, offline guess of what a URL points at, used before the real probe.
 * The heuristic only applies to YouTube hosts; anything else is `unknown` and
 * left to yt-dlp to decide.
 */
export function urlKind(input: string): UrlKind {
  const url = parseHttpUrl(input)
  if (!url) return 'unknown'

  const host = url.hostname.toLowerCase()
  const isShortHost = host === 'youtu.be'
  if (!isShortHost && !isYoutubeHost(host)) return 'unknown'

  const list = url.searchParams.get('list')
  // YouTube's automatic "mix" playlists (RD...) are not real playlists.
  const hasRealList = !!list && !list.startsWith('RD')

  let hasVideo: boolean
  if (isShortHost) {
    hasVideo = url.pathname.length > 1
  } else if (url.pathname === '/watch') {
    hasVideo = !!url.searchParams.get('v')
  } else {
    hasVideo = SINGLE_VIDEO_PATH.test(url.pathname)
  }

  if (hasVideo) return hasRealList ? 'ambiguous' : 'single'
  if (hasRealList && (url.pathname === '/playlist' || url.pathname === '/watch')) return 'playlist'
  return 'unknown'
}
