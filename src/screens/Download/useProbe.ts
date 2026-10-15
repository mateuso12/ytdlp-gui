import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useBridge } from '../../bridge/context'
import type { Bridge } from '../../bridge/types'
import { buildProbeArgs, type BinPaths } from '../../core/buildArgs'
import { mapError } from '../../core/mapError'
import { parseProbe } from '../../core/parseProbe'
import { splitUrls } from '../../core/splitUrls'
import type { FriendlyError, Probe } from '../../core/types'
import { urlKind } from '../../core/urlKind'
import { useDeps } from '../../stores/deps'
import { STDERR_TAIL_LINES } from '../../stores/queue'
import { useSettings } from '../../stores/settings'

/** What the "Só este vídeo / Playlist inteira" bar needs, and which side is selected. */
export interface AmbiguousInfo {
  videoUrl: string
  playlistUrl: string
  playlistCount: number
  choice: 'video' | 'playlist'
}

export type ProbeState =
  | { status: 'idle' }
  /** `ambiguous` is kept while the chosen side loads, so the bar does not blink away. */
  | { status: 'loading'; url: string; ambiguous?: AmbiguousInfo }
  | { status: 'error'; error: FriendlyError; ambiguous?: AmbiguousInfo }
  /**
   * `probe` is what is displayed: a video or a playlist. For an ambiguous link `ambiguous` is also
   * set, and `probe` is the side `ambiguous.choice` selects (the `ambiguous` variant of `Probe` is
   * never emitted: the bar is described by `ambiguous`).
   */
  | { status: 'ready'; probe: Probe; ambiguous?: AmbiguousInfo }
  /** Several links were pasted. They are not probed; `urls` is what a confirm enqueues. */
  | { status: 'multi'; count: number; urls: string[] }

export interface ProbeApi {
  state: ProbeState
  /** The text of the link field. It lives here so that `reset()` can empty the field. */
  input: string
  setInput(text: string): void
  /** Analyses what was typed or pasted: one link, several links, or text that is no link. */
  submit(text: string): void
  /** Picks a side of an ambiguous link. Does nothing when there is no ambiguous link. */
  choose(which: 'video' | 'playlist'): void
  /** Back to idle with an empty field. Whatever probe is still running is discarded. */
  reset(): void
}

type Outcome = { ok: true; probe: Probe } | { ok: false; error: FriendlyError }

/** Answers kept so that switching back and forth on an ambiguous link does not probe again. */
interface AmbiguousCache {
  info: Omit<AmbiguousInfo, 'choice'>
  playlist: Probe
  video?: Probe
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const fail = (lines: string[]): Outcome => ({ ok: false, error: mapError(lines) })

/**
 * Binary paths for the probe. Only the JS runtime (deno) matters to `buildProbeArgs`; ffmpeg is
 * not used by a probe, so a missing one is passed as '' instead of blocking the analysis.
 */
async function probeBins(bridge: Bridge): Promise<BinPaths> {
  try {
    const status = await useDeps.getState().ensure(bridge)
    return { ffmpeg: status?.ffmpeg?.path ?? '', deno: status?.deno?.path ?? null }
  } catch {
    return { ffmpeg: '', deno: null }
  }
}

/** Runs one yt-dlp probe and turns whatever happens into a Probe or a friendly error. */
async function runProbe(bridge: Bridge, url: string, mode: 'flat' | 'full'): Promise<Outcome> {
  const args = buildProbeArgs(url, mode, useSettings.getState().settings, await probeBins(bridge))
  let res
  try {
    res = await bridge.probe(args)
  } catch (e) {
    return fail([errorText(e)])
  }
  if (res.code !== 0) return fail(res.stderr.split(/\r?\n/).slice(-STDERR_TAIL_LINES))
  try {
    return { ok: true, probe: parseProbe(JSON.parse(res.stdout), url) }
  } catch (e) {
    return fail([`yt-dlp returned something that is not a video or a playlist: ${errorText(e)}`])
  }
}

/** `https://youtube.com/playlist?list=…` for a `watch?v=…&list=…` link. */
function playlistUrlOf(url: string): string {
  try {
    const parsed = new URL(url)
    const list = parsed.searchParams.get('list')
    return list ? `${parsed.origin}/playlist?list=${encodeURIComponent(list)}` : url
  } catch {
    return url
  }
}

/**
 * The link-analysis state machine behind the Download screen. Every `submit`, `choose` and `reset`
 * takes a new ticket; an answer that arrives with an old ticket is dropped, so a slow probe for a
 * previous link can never replace the state of a newer one.
 */
export function useProbeController(): ProbeApi {
  const bridge = useBridge()
  const [state, setState] = useState<ProbeState>({ status: 'idle' })
  const [input, setInput] = useState('')
  const ticket = useRef(0)
  const cache = useRef<AmbiguousCache | null>(null)

  useEffect(
    () => () => {
      ticket.current++ // an answer after unmount has nowhere to go
    },
    [],
  )

  const detect = useCallback(
    async (url: string, mine: number) => {
      const current = () => ticket.current === mine
      const finish = (next: ProbeState) => {
        if (current()) setState(next)
      }
      const showFull = async (target: string) => {
        const full = await runProbe(bridge, target, 'full')
        if (full.ok) finish({ status: 'ready', probe: full.probe })
        else finish({ status: 'error', error: full.error })
      }

      setState({ status: 'loading', url })
      const kind = urlKind(url)

      // A YouTube watch/shorts/youtu.be link without a list is certainly one video.
      if (kind === 'single') {
        await showFull(url)
        return
      }

      const flat = await runProbe(bridge, url, 'flat')
      if (!current()) return
      if (!flat.ok) {
        finish({ status: 'error', error: flat.error })
        return
      }
      if (flat.probe.kind === 'video') {
        await showFull(url)
        return
      }
      if (kind === 'ambiguous' && flat.probe.kind === 'playlist') {
        // The flat probe of `watch?v=…&list=…` is the playlist: it gives the item count and the
        // playlist side of the choice, which is the default (spec mockup).
        const info = {
          videoUrl: url,
          playlistUrl: playlistUrlOf(url),
          playlistCount: flat.probe.playlist.entries.length,
        }
        cache.current = { info, playlist: flat.probe }
        finish({ status: 'ready', probe: flat.probe, ambiguous: { ...info, choice: 'playlist' } })
        return
      }
      finish({ status: 'ready', probe: flat.probe })
    },
    [bridge],
  )

  const reset = useCallback(() => {
    ticket.current++
    cache.current = null
    setState({ status: 'idle' })
    setInput('')
  }, [])

  const submit = useCallback(
    (text: string) => {
      const mine = ++ticket.current
      cache.current = null
      const urls = splitUrls(text)
      if (urls.length === 0) {
        if (text.trim() === '') setState({ status: 'idle' })
        else
          setState({
            status: 'error',
            error: mapError([`ERROR: Unsupported URL: ${text.trim()}`]),
          })
        return
      }
      if (urls.length > 1) {
        setState({ status: 'multi', count: urls.length, urls })
        return
      }
      void detect(urls[0], mine)
    },
    [detect],
  )

  const choose = useCallback(
    (which: 'video' | 'playlist') => {
      const cached = cache.current
      if (!cached) return
      const mine = ++ticket.current
      const info: AmbiguousInfo = { ...cached.info, choice: which }

      if (which === 'playlist') {
        setState({ status: 'ready', probe: cached.playlist, ambiguous: info })
        return
      }
      if (cached.video) {
        setState({ status: 'ready', probe: cached.video, ambiguous: info })
        return
      }
      setState({ status: 'loading', url: cached.info.videoUrl, ambiguous: info })
      void runProbe(bridge, cached.info.videoUrl, 'full').then((full) => {
        if (ticket.current !== mine) return
        if (full.ok) {
          cached.video = full.probe
          setState({ status: 'ready', probe: full.probe, ambiguous: info })
        } else {
          setState({ status: 'error', error: full.error, ambiguous: info })
        }
      })
    },
    [bridge],
  )

  return { state, input, setInput, submit, choose, reset }
}

export const ProbeContext = createContext<ProbeApi | null>(null)

/** The shared probe state: the link field (top bar) and the Download screen read the same one. */
export function useProbe(): ProbeApi {
  const probe = useContext(ProbeContext)
  if (!probe) throw new Error('useProbe must be used inside a <ProbeProvider>')
  return probe
}
