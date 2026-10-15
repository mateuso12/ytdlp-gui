import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockBridge, type MockBridge } from '../bridge/mock'
import { FILE_MARK, PROGRESS_MARK, buildArgs } from '../core/buildArgs'
import { mapError } from '../core/mapError'
import type { DownloadOptions } from '../core/types'
import i18n from '../i18n'
import { bootstrapStores } from './bootstrap'
import { createHistoryStore } from './history'
import { createQueueStore, startScheduler, useQueue, type QueueInput } from './queue'
import { createSettingsStore, defaultSettings, startSettingsEffects, useSettings } from './settings'
import { ALL_INSTALLED } from '../test/fixtures'

const OPTS: DownloadOptions = {
  mode: 'video',
  video: { maxHeight: 1080, container: 'mp4' },
  embedThumbnail: true,
  embedMetadata: true,
  embedChapters: true,
}

const DEPS = {
  ytdlp: { path: '/bin/yt-dlp', version: '1' },
  ffmpeg: { path: '/bin/ffmpeg', version: '1', source: 'app' as const },
  deno: { path: '/bin/deno', version: '1', source: 'app' as const },
}

function input(n: number): QueueInput {
  return {
    url: `https://youtu.be/v${n}`,
    title: `Video ${n}`,
    thumbnail: null,
    extractor: 'youtube',
    videoId: `v${n}`,
    opts: OPTS,
  }
}

const lastQueueWrite = (b: MockBridge): unknown => {
  const writes = b.calls.filter((c) => c.method === 'store.set' && c.args[0] === 'queue')
  expect(writes.length).toBeGreaterThan(0)
  return writes[writes.length - 1].args[1]
}
const flush = () => vi.waitFor(() => undefined)
const progressLine = (downloaded: number, total: number) =>
  `${PROGRESS_MARK}${JSON.stringify({ downloaded_bytes: downloaded, total_bytes: total, speed: 1, eta: 1 })}`

interface Rig {
  bridge: MockBridge
  settings: ReturnType<typeof createSettingsStore>
  history: ReturnType<typeof createHistoryStore>
  queue: ReturnType<typeof createQueueStore>
  stop: () => void
  runIds: () => string[]
}

async function rig(opts: { concurrency?: number; store?: Record<string, unknown> } = {}) {
  const bridge = createMockBridge({ deps: DEPS, store: opts.store })
  const settings = createSettingsStore()
  const history = createHistoryStore()
  const queue = createQueueStore({ settings, history })
  await settings.getState().load(bridge)
  if (opts.concurrency !== undefined) settings.getState().update({ concurrency: opts.concurrency })
  await history.getState().load(bridge)
  await queue.getState().load(bridge)
  const stop = await startScheduler(bridge, { queue, settings })
  const runIds = () =>
    bridge.calls.filter((c) => c.method === 'run').map((c) => c.args[0] as string)
  const r: Rig = { bridge, settings, history, queue, stop, runIds }
  return r
}

async function enqueue(r: Rig, n: number) {
  r.queue.getState().enqueue(Array.from({ length: n }, (_, i) => input(i + 1)))
  await vi.waitFor(() => expect(r.queue.getState().jobs.every((j) => j.args.length > 0)).toBe(true))
  return r.queue.getState().jobs
}

const job = (r: Rig, i: number) => r.queue.getState().jobs[i]

describe('settings store', () => {
  it('builds defaults from the bridge: <Videos>/ytdlp-gui joined with the platform separator', async () => {
    const win = createMockBridge({ videoDir: 'C:\\Users\\me\\Videos', platform: 'windows' })
    expect((await defaultSettings(win)).outputDir).toBe('C:\\Users\\me\\Videos\\ytdlp-gui')
    const mac = createMockBridge({ videoDir: '/Users/me/Movies/', platform: 'macos' })
    expect((await defaultSettings(mac)).outputDir).toBe('/Users/me/Movies/ytdlp-gui')
  })

  it('has the documented defaults', async () => {
    const s = await defaultSettings(createMockBridge())
    expect(s).toMatchObject({
      outputTemplate: '%(title)s [%(id)s].%(ext)s',
      concurrency: 2,
      retries: 10,
      cookiesBrowser: 'none',
      theme: 'system',
      channel: 'stable',
      defaults: {
        mode: 'video',
        video: { maxHeight: 1080, container: 'mp4' },
      },
    })
    expect(['pt-BR', 'en']).toContain(s.language)
  })

  it('loads persisted settings over the defaults (missing keys keep their default)', async () => {
    const bridge = createMockBridge({ store: { settings: { concurrency: 4, theme: 'dark' } } })
    const store = createSettingsStore()
    expect(store.getState().loaded).toBe(false)
    await store.getState().load(bridge)
    expect(store.getState().loaded).toBe(true)
    expect(store.getState().settings).toMatchObject({ concurrency: 4, theme: 'dark', retries: 10 })
  })

  describe('persistence', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('debounces writes by 300ms and writes the latest value once', async () => {
      const bridge = createMockBridge()
      const store = createSettingsStore()
      await store.getState().load(bridge)
      const writes = () => bridge.calls.filter((c) => c.method === 'store.set')
      store.getState().update({ concurrency: 3 })
      await vi.advanceTimersByTimeAsync(200)
      store.getState().update({ retries: 5 })
      await vi.advanceTimersByTimeAsync(200)
      expect(writes()).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(100)
      expect(writes()).toHaveLength(1)
      expect(writes()[0].args[0]).toBe('settings')
      expect(writes()[0].args[1]).toMatchObject({ concurrency: 3, retries: 5 })
    })

    it('flush() writes a pending change immediately and cancels the timer', async () => {
      const bridge = createMockBridge()
      const store = createSettingsStore()
      await store.getState().load(bridge)
      store.getState().update({ concurrency: 3 })
      await store.getState().flush()
      const writes = () => bridge.calls.filter((c) => c.method === 'store.set')
      expect(writes()).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1000)
      expect(writes()).toHaveLength(1)
    })
  })

  describe('effects (language + theme)', () => {
    let listeners: Array<() => void>
    let dark: boolean
    beforeEach(() => {
      listeners = []
      dark = false
      vi.stubGlobal('matchMedia', () => ({
        get matches() {
          return dark
        },
        addEventListener: (_: string, cb: () => void) => listeners.push(cb),
        removeEventListener: (_: string, cb: () => void) => {
          listeners = listeners.filter((l) => l !== cb)
        },
      }))
    })
    afterEach(() => {
      vi.unstubAllGlobals()
      delete document.documentElement.dataset.theme
    })

    it('drives i18n and the theme from settings, and follows the system theme only when "system"', async () => {
      const store = createSettingsStore()
      const stop = startSettingsEffects(store)
      expect(document.documentElement.dataset.theme).toBe('light')

      dark = true
      listeners.forEach((l) => l())
      expect(document.documentElement.dataset.theme).toBe('dark')

      store.getState().update({ theme: 'light' })
      expect(document.documentElement.dataset.theme).toBe('light')
      dark = false
      dark = true
      listeners.forEach((l) => l())
      expect(document.documentElement.dataset.theme).toBe('light')

      store.getState().update({ language: 'pt-BR' })
      await vi.waitFor(() => expect(i18n.language).toBe('pt-BR'))
      expect(document.documentElement.lang).toBe('pt-BR')
      store.getState().update({ language: 'en' })
      await vi.waitFor(() => expect(i18n.language).toBe('en'))
      expect(document.documentElement.lang).toBe('en')

      stop()
      expect(listeners).toHaveLength(0)
      store.getState().update({ theme: 'dark' })
      expect(document.documentElement.dataset.theme).toBe('light')
    })
  })
})

describe('history store', () => {
  const item = (id: string, videoId: string, title = 'T') => ({
    id,
    extractor: 'youtube',
    videoId,
    title,
    thumbnail: null,
    path: `/v/${id}.mp4`,
    sizeBytes: 1,
    finishedAt: 1,
  })

  it('has() is true after add(), false for others, and remove() undoes it', () => {
    const h = createHistoryStore()
    expect(h.getState().has('youtube', 'abc')).toBe(false)
    h.getState().add(item('1', 'abc'))
    expect(h.getState().has('youtube', 'abc')).toBe(true)
    expect(h.getState().has('vimeo', 'abc')).toBe(false)
    h.getState().remove('1')
    expect(h.getState().has('youtube', 'abc')).toBe(false)
  })

  it('puts newest first and searches titles case-insensitively', () => {
    const h = createHistoryStore()
    h.getState().add(item('1', 'a', 'Cats compilation'))
    h.getState().add(item('2', 'b', 'Dogs'))
    expect(h.getState().items.map((i) => i.id)).toEqual(['2', '1'])
    expect(
      h
        .getState()
        .search('CATS')
        .map((i) => i.id),
    ).toEqual(['1'])
    expect(h.getState().search('  ')).toHaveLength(2)
  })

  it('searches ignoring case and accents, in both directions', () => {
    const h = createHistoryStore()
    h.getState().add(item('1', 'a', 'Big Buck Bunny'))
    h.getState().add(item('2', 'b', 'Ação e Emoção'))
    h.getState().add(item('3', 'c', 'Cafe com leite'))
    const ids = (q: string) =>
      h
        .getState()
        .search(q)
        .map((i) => i.id)
    expect(ids('BUNNY')).toEqual(['1'])
    expect(ids('acao')).toEqual(['2'])
    expect(ids('EMOÇÃO')).toEqual(['2'])
    expect(ids('café')).toEqual(['3'])
    expect(ids('nada')).toEqual([])
  })

  it('keeps the url of a history item through a save and a reload (R18)', async () => {
    const bridge = createMockBridge()
    const h = createHistoryStore()
    await h.getState().load(bridge)
    h.getState().add({ ...item('1', 'a'), url: 'https://youtu.be/a' })
    await h.getState().flush()
    const h2 = createHistoryStore()
    await h2.getState().load(bridge)
    expect(h2.getState().items[0].url).toBe('https://youtu.be/a')
  })

  it('loads saved items that have no url (R18)', async () => {
    const bridge = createMockBridge()
    await bridge.store.set('history', [item('1', 'a')])
    const h = createHistoryStore()
    await h.getState().load(bridge)
    expect(h.getState().items.map((i) => i.id)).toEqual(['1'])
    expect(h.getState().items[0].url).toBeUndefined()
  })

  it('persists on add/remove and reloads', async () => {
    const bridge = createMockBridge()
    const h = createHistoryStore()
    await h.getState().load(bridge)
    h.getState().add(item('1', 'a'))
    await h.getState().flush()
    const h2 = createHistoryStore()
    await h2.getState().load(bridge)
    expect(h2.getState().items.map((i) => i.id)).toEqual(['1'])
    h.getState().remove('1')
    await h.getState().flush()
    const h3 = createHistoryStore()
    await h3.getState().load(bridge)
    expect(h3.getState().items).toEqual([])
  })
})

describe('queue store + scheduler', () => {
  it('builds args with the ffmpeg/deno paths from deps.status() (R9)', async () => {
    const r = await rig({ concurrency: 1 })
    const [j] = await enqueue(r, 1)
    expect(j.args).toEqual(
      buildArgs('https://youtu.be/v1', OPTS, r.settings.getState().settings, {
        ffmpeg: '/bin/ffmpeg',
        deno: '/bin/deno',
      }),
    )
    r.stop()
  })

  it('errors the job (ffmpeg) instead of running when ffmpeg is missing', async () => {
    const bridge = createMockBridge({ deps: { ytdlp: DEPS.ytdlp, ffmpeg: null, deno: null } })
    const settings = createSettingsStore()
    const history = createHistoryStore()
    const queue = createQueueStore({ settings, history })
    await queue.getState().load(bridge)
    const stop = await startScheduler(bridge, { queue, settings })
    queue.getState().enqueue([input(1)])
    await vi.waitFor(() => expect(queue.getState().jobs[0].status).toBe('error'))
    expect(queue.getState().jobs[0].error?.code).toBe('ffmpeg')
    expect(bridge.calls.some((c) => c.method === 'run')).toBe(false)
    stop()
  })

  it('with concurrency 2 and three jobs only two run; the third starts when one exits 0', async () => {
    const r = await rig({ concurrency: 2 })
    await enqueue(r, 3)
    await flush()
    expect(r.runIds()).toHaveLength(2)
    expect(r.queue.getState().activeCount).toBe(2)
    expect(job(r, 2).status).toBe('queued')

    r.bridge.emitExit({ jobId: r.runIds()[0], code: 0 })
    await flush()
    expect(r.runIds()).toHaveLength(3)
    expect(job(r, 0).status).toBe('done')
    expect(job(r, 2).status).toBe('active')
    expect(r.queue.getState().activeCount).toBe(2)
    r.stop()
  })

  it('never exceeds a lowered concurrency, and starts more when it is raised', async () => {
    const r = await rig({ concurrency: 3 })
    await enqueue(r, 5)
    await flush()
    expect(r.runIds()).toHaveLength(3)

    r.settings.getState().update({ concurrency: 1 })
    r.bridge.emitExit({ jobId: r.runIds()[0], code: 0 })
    await flush()
    expect(r.runIds()).toHaveLength(3) // 2 still active > 1: nothing new
    r.bridge.emitExit({ jobId: r.runIds()[1], code: 0 })
    await flush()
    expect(r.runIds()).toHaveLength(3) // 1 still active == 1: nothing new
    r.bridge.emitExit({ jobId: r.runIds()[2], code: 0 })
    await flush()
    expect(r.runIds()).toHaveLength(4)
    expect(r.queue.getState().activeCount).toBe(1)

    r.settings.getState().update({ concurrency: 4 })
    await flush()
    expect(r.runIds()).toHaveLength(5)
    r.stop()
  })

  it('never starts a job twice', async () => {
    const r = await rig({ concurrency: 2 })
    await enqueue(r, 2)
    r.queue.getState().enqueue([input(3)])
    r.settings.getState().update({ concurrency: 2 })
    await flush()
    expect(new Set(r.runIds()).size).toBe(r.runIds().length)
    expect(r.runIds()).toHaveLength(2)
    r.stop()
  })

  it('uses a unique run id per attempt: ${job.id}#${attempt}', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 1)
    await flush()
    const id = job(r, 0).id
    expect(r.runIds()).toEqual([`${id}#1`])
  })

  it('updates job.progress from progress lines and stores the path from a file line', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 1)
    await flush()
    const run = r.runIds()[0]
    expect(job(r, 0).status).toBe('active')
    expect(job(r, 0).progress).toBeNull() // R10: active + null progress = indeterminate

    r.bridge.emitLine({ jobId: run, stream: 'stdout', line: progressLine(50, 200) })
    expect(job(r, 0).progress).toMatchObject({ percent: 25, totalBytes: 200 })
    r.bridge.emitLine({ jobId: run, stream: 'stdout', line: `${FILE_MARK}/v/Video 1.mp4` })
    expect(job(r, 0).filePath).toBe('/v/Video 1.mp4')
    r.bridge.emitLine({ jobId: run, stream: 'stdout', line: '[Merger] Merging formats' })
    expect(job(r, 0).phase).toBe('merging')
    r.stop()
  })

  it('exit 0 marks done and adds a history item with the path', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 1)
    await flush()
    const run = r.runIds()[0]
    r.bridge.emitLine({ jobId: run, stream: 'stdout', line: progressLine(200, 200) })
    r.bridge.emitLine({ jobId: run, stream: 'stdout', line: `${FILE_MARK}/v/Video 1.mp4` })
    r.bridge.emitExit({ jobId: run, code: 0 })
    expect(job(r, 0).status).toBe('done')
    expect(job(r, 0).finishedAt).not.toBeNull()
    expect(r.history.getState().items).toHaveLength(1)
    expect(r.history.getState().items[0]).toMatchObject({
      extractor: 'youtube',
      videoId: 'v1',
      title: 'Video 1',
      path: '/v/Video 1.mp4',
      sizeBytes: 200,
      url: 'https://youtu.be/v1',
    })
    expect(r.history.getState().has('youtube', 'v1')).toBe(true)
    r.stop()
  })

  it('keeps the job options in the history item, for "download again"', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 1)
    await flush()
    const run = r.runIds()[0]
    r.bridge.emitLine({ jobId: run, stream: 'stdout', line: `${FILE_MARK}/v/Video 1.mp4` })
    r.bridge.emitExit({ jobId: run, code: 0 })
    expect(r.history.getState().items[0].opts).toEqual(OPTS)
    r.stop()
  })

  it('titles a placeholder-titled job (title === url) from the file name', async () => {
    const r = await rig({ concurrency: 1 })
    r.queue.getState().enqueue([{ ...input(1), title: input(1).url }])
    await vi.waitFor(() => expect(job(r, 0).args.length).toBeGreaterThan(0))
    await flush()
    const run = r.runIds()[0]
    r.bridge.emitLine({
      jobId: run,
      stream: 'stdout',
      line: `${FILE_MARK}C:\\Videos\\Aula de Ação [abc].mp4`,
    })
    r.bridge.emitExit({ jobId: run, code: 0 })
    expect(r.history.getState().items[0].title).toBe('Aula de Ação [abc]')
    r.stop()
  })

  it('exit 1 marks error with the code from mapError(stderrTail)', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 1)
    await flush()
    const run = r.runIds()[0]
    const line =
      "ERROR: [youtube] abc: Private video. Sign in if you've been granted access to this video"
    r.bridge.emitLine({ jobId: run, stream: 'stderr', line })
    r.bridge.emitExit({ jobId: run, code: 1 })
    expect(job(r, 0).status).toBe('error')
    expect(job(r, 0).error?.code).toBe(mapError([line]).code)
    expect(r.history.getState().items).toHaveLength(0)
    r.stop()
  })

  it('treats a signal exit (code null) as an error', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 1)
    await flush()
    r.bridge.emitExit({ jobId: r.runIds()[0], code: null })
    expect(job(r, 0).status).toBe('error')
    r.stop()
  })

  it('keeps only the last 50 stderr lines', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 1)
    await flush()
    const run = r.runIds()[0]
    for (let i = 0; i < 80; i++) r.bridge.emitLine({ jobId: run, stream: 'stderr', line: `l${i}` })
    const tail = job(r, 0).stderrTail
    expect(tail).toHaveLength(50)
    expect(tail[0]).toBe('l30')
    expect(tail[49]).toBe('l79')
    r.stop()
  })

  it('cancel() calls bridge.cancel with the run id and marks cancelled', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 1)
    await flush()
    const run = r.runIds()[0]
    r.queue.getState().cancel(job(r, 0).id)
    expect(job(r, 0).status).toBe('cancelled')
    expect(r.bridge.calls.filter((c) => c.method === 'cancel').map((c) => c.args[0])).toEqual([run])
    // a late exit from the killed process must not resurrect or finish the job
    r.bridge.emitExit({ jobId: run, code: null })
    expect(job(r, 0).status).toBe('cancelled')
    r.stop()
  })

  it('cancelling a queued job does not call bridge.cancel and it never starts', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 2)
    await flush()
    r.queue.getState().cancel(job(r, 1).id)
    expect(job(r, 1).status).toBe('cancelled')
    r.bridge.emitExit({ jobId: r.runIds()[0], code: 0 })
    await flush()
    expect(r.runIds()).toHaveLength(1)
    expect(r.bridge.calls.some((c) => c.method === 'cancel')).toBe(false)
    r.stop()
  })

  it('the slot of a cancelled job frees only once bridge.cancel has settled', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 2)
    await flush()
    let release!: (v: boolean) => void
    r.bridge.cancel = () => new Promise<boolean>((res) => (release = res))
    r.queue.getState().cancel(job(r, 0).id)
    await flush()
    expect(r.runIds()).toHaveLength(1)
    release(true)
    await vi.waitFor(() => expect(r.runIds()).toHaveLength(2))
    r.stop()
  })

  it('retry of a cancelled job goes back to queued with the SAME args, even if settings changed (Review Focus 5)', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 1)
    await flush()
    const original = job(r, 0).args
    r.queue.getState().cancel(job(r, 0).id)
    r.settings.getState().update({ retries: 99, rateLimit: '1M' })
    r.queue.getState().retry(job(r, 0).id)
    expect(job(r, 0).args).toEqual(original)
    expect(job(r, 0).status).toBe('queued') // the cancelled run's slot is still held
    // once the cancel settles the scheduler picks it up again, with the identical argv
    await vi.waitFor(() => expect(r.runIds()).toHaveLength(2))
    const runs = r.bridge.calls.filter((c) => c.method === 'run')
    expect(runs[1].args[1]).toEqual(original)
    r.stop()
  })

  it('retry resets progress/error and leaves it queued while the pool is full', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 2)
    await flush()
    r.bridge.emitExit({ jobId: r.runIds()[0], code: 1 }) // job 0 errors, job 1 starts
    expect(job(r, 0).status).toBe('error')
    r.queue.getState().retry(job(r, 0).id)
    expect(job(r, 0)).toMatchObject({
      status: 'queued',
      error: null,
      progress: null,
      filePath: null,
      stderrTail: [],
      finishedAt: null,
    })
    r.stop()
  })

  it('a late exit from a cancelled attempt does not affect the retried attempt (R13)', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 1)
    await flush()
    const first = r.runIds()[0]
    r.queue.getState().cancel(job(r, 0).id)
    r.queue.getState().retry(job(r, 0).id)
    await vi.waitFor(() => expect(r.runIds()).toHaveLength(2))
    const second = r.runIds()[1]
    expect(second).not.toBe(first)

    r.bridge.emitLine({ jobId: first, stream: 'stderr', line: 'ERROR: old attempt' })
    r.bridge.emitLine({ jobId: first, stream: 'stdout', line: progressLine(10, 10) })
    r.bridge.emitExit({ jobId: first, code: 1 })
    expect(job(r, 0).status).toBe('active')
    expect(job(r, 0).stderrTail).toEqual([])
    expect(job(r, 0).progress).toBeNull()

    r.bridge.emitExit({ jobId: second, code: 0 })
    expect(job(r, 0).status).toBe('done')
    r.stop()
  })

  it('a late exit that arrives while the retried job is still queued is ignored too', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 2)
    await flush()
    const first = r.runIds()[0]
    r.queue.getState().cancel(job(r, 0).id)
    // job 1 takes the free slot once the cancel settles
    await vi.waitFor(() => expect(r.runIds()).toHaveLength(2))
    r.queue.getState().retry(job(r, 0).id)
    expect(job(r, 0).status).toBe('queued')
    r.bridge.emitExit({ jobId: first, code: 0 })
    expect(job(r, 0).status).toBe('queued')
    expect(r.history.getState().items).toHaveLength(0)
    r.stop()
  })

  it('ignores events for unknown ids', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 1)
    await flush()
    r.bridge.emitLine({ jobId: 'nope', stream: 'stderr', line: 'x' })
    r.bridge.emitExit({ jobId: 'nope#1', code: 0 })
    r.bridge.emitExit({ jobId: 'garbage', code: 0 })
    expect(job(r, 0).status).toBe('active')
    r.stop()
  })

  it('marks the job as error when bridge.run rejects', async () => {
    const r = await rig({ concurrency: 1 })
    r.bridge.run = () => Promise.reject(new Error('spawn failed'))
    await enqueue(r, 1)
    await vi.waitFor(() => expect(job(r, 0).status).toBe('error'))
    r.stop()
  })

  describe('persistence', () => {
    const queueWrites = (b: MockBridge) =>
      b.calls.filter((c) => c.method === 'store.set' && c.args[0] === 'queue')

    it('writes the queue on status changes only, never per progress line', async () => {
      const r = await rig({ concurrency: 1 })
      await enqueue(r, 1)
      await flush()
      await r.queue.getState().flush()
      const before = queueWrites(r.bridge).length
      expect(before).toBeGreaterThan(0)
      const run = r.runIds()[0]
      for (let i = 1; i <= 20; i++) {
        r.bridge.emitLine({ jobId: run, stream: 'stdout', line: progressLine(i, 100) })
        r.bridge.emitLine({ jobId: run, stream: 'stderr', line: `w${i}` })
      }
      await r.queue.getState().flush()
      expect(queueWrites(r.bridge)).toHaveLength(before)
      r.bridge.emitExit({ jobId: run, code: 0 })
      await r.queue.getState().flush()
      expect(queueWrites(r.bridge).length).toBeGreaterThan(before)
      const last = lastQueueWrite(r.bridge) as Array<{ status: string }>
      expect(last[0].status).toBe('done')
      r.stop()
    })

    it('writes are ordered: the persisted queue is always the latest state', async () => {
      const r = await rig({ concurrency: 1 })
      await enqueue(r, 3)
      await flush()
      r.bridge.emitExit({ jobId: r.runIds()[0], code: 0 })
      r.bridge.emitExit({ jobId: r.runIds()[1], code: 1 })
      await r.queue.getState().flush()
      const last = lastQueueWrite(r.bridge) as Array<{ status: string }>
      expect(last.map((j) => j.status)).toEqual(r.queue.getState().jobs.map((j) => j.status))
      r.stop()
    })

    it('jobs that were active in the previous session load as interrupted, queued ones stay queued', async () => {
      const r1 = await rig({ concurrency: 1 })
      await enqueue(r1, 2)
      await flush()
      await r1.queue.getState().flush()
      const saved = lastQueueWrite(r1.bridge)
      expect((saved as Array<{ status: string }>).map((j) => j.status)).toEqual([
        'active',
        'queued',
      ])
      r1.stop()

      const bridge2 = createMockBridge({ deps: DEPS, store: { queue: saved } })
      const settings = createSettingsStore()
      const history = createHistoryStore()
      const queue = createQueueStore({ settings, history })
      await queue.getState().load(bridge2)
      expect(queue.getState().jobs.map((j) => j.status)).toEqual(['interrupted', 'queued'])
      expect(queue.getState().activeCount).toBe(0)

      // the interrupted one can be retried with its original args
      const args = queue.getState().jobs[0].args
      expect(args.length).toBeGreaterThan(0)
      queue.getState().retry(queue.getState().jobs[0].id)
      expect(queue.getState().jobs[0].args).toEqual(args)
    })

    it('starts restored queued jobs when the scheduler starts', async () => {
      const r1 = await rig({ concurrency: 1 })
      await enqueue(r1, 2)
      await flush()
      await r1.queue.getState().flush()
      const saved = lastQueueWrite(r1.bridge)
      r1.stop()

      const r2 = await rig({ concurrency: 1, store: { queue: saved } })
      await flush()
      expect(r2.queue.getState().jobs.map((j) => j.status)).toEqual(['interrupted', 'active'])
      expect(r2.runIds()).toHaveLength(1)
      r2.stop()
    })
  })

  describe('scheduler lifecycle', () => {
    it('subscribes once and unsubscribes on teardown', async () => {
      const bridge = createMockBridge({ deps: DEPS })
      const onLine = vi.spyOn(bridge, 'onLine')
      const onExit = vi.spyOn(bridge, 'onExit')
      const settings = createSettingsStore()
      const history = createHistoryStore()
      const queue = createQueueStore({ settings, history })
      await queue.getState().load(bridge)

      const stop = await startScheduler(bridge, { queue, settings })
      const again = await startScheduler(bridge, { queue, settings })
      expect(onLine).toHaveBeenCalledTimes(1)
      expect(onExit).toHaveBeenCalledTimes(1)
      expect(again).toBe(stop)

      queue.getState().enqueue([input(1)])
      await vi.waitFor(() => expect(bridge.calls.some((c) => c.method === 'run')).toBe(true))
      const run = queue.getState().jobs[0].id + '#1'

      stop()
      bridge.emitExit({ jobId: run, code: 0 })
      expect(queue.getState().jobs[0].status).toBe('active') // no longer listening

      queue.getState().enqueue([input(2)])
      await flush()
      expect(bridge.calls.filter((c) => c.method === 'run')).toHaveLength(1) // pump is off

      // and it can be started again afterwards
      const stop2 = await startScheduler(bridge, { queue, settings })
      expect(stop2).not.toBe(stop)
      stop2()
    })
  })
})

describe('bootstrapStores', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.theme
  })

  it('loads every store, starts the scheduler, and tears it all down', async () => {
    const bridge = createMockBridge({ deps: DEPS })
    const onLine = vi.spyOn(bridge, 'onLine')
    const stop = await bootstrapStores(bridge)
    const keys = bridge.calls.filter((c) => c.method === 'store.get').map((c) => c.args[0])
    expect(keys).toEqual(expect.arrayContaining(['settings', 'history', 'queue']))
    expect(onLine).toHaveBeenCalledTimes(1)
    stop()
  })
})

describe('queue: jobs whose args could not be built survive a restart', () => {
  it('retry after a restart rebuilds the args from the persisted data and runs the job', async () => {
    // Session 1: ffmpeg is missing, so the job errors without args.
    const bridge1 = createMockBridge({ deps: { ytdlp: DEPS.ytdlp, ffmpeg: null, deno: null } })
    const settings1 = createSettingsStore()
    const queue1 = createQueueStore({ settings: settings1, history: createHistoryStore() })
    await queue1.getState().load(bridge1)
    queue1.getState().enqueue([input(1)])
    await vi.waitFor(() => expect(queue1.getState().jobs[0].status).toBe('error'))
    await queue1.getState().flush()
    const saved = lastQueueWrite(bridge1) as Array<{ status: string; args: string[] }>
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ status: 'error', args: [] })

    // Session 2: ffmpeg installed; the user hits retry.
    const r = await rig({ concurrency: 1, store: { queue: saved } })
    expect(r.queue.getState().jobs[0]).toMatchObject({ status: 'error', args: [] })
    r.queue.getState().retry(r.queue.getState().jobs[0].id)
    await vi.waitFor(() => expect(r.runIds()).toHaveLength(1))
    const expected = buildArgs('https://youtu.be/v1', OPTS, r.settings.getState().settings, {
      ffmpeg: '/bin/ffmpeg',
      deno: '/bin/deno',
    })
    expect(r.bridge.calls.find((c) => c.method === 'run')?.args[1]).toEqual(expected)
    expect(r.queue.getState().jobs[0].status).toBe('active')
    expect(r.queue.getState().jobs[0].pending).toBeUndefined()
    r.stop()
  })

  it('a restored queued job that never got its args is rebuilt and started on startup', async () => {
    const bridge1 = createMockBridge({ deps: DEPS })
    bridge1.deps.status = () => new Promise(() => undefined) // never resolves: args never built
    const queue1 = createQueueStore({
      settings: createSettingsStore(),
      history: createHistoryStore(),
    })
    await queue1.getState().load(bridge1)
    queue1.getState().enqueue([input(1)])
    await queue1.getState().flush()
    const saved = lastQueueWrite(bridge1) as Array<{ status: string; args: string[] }>
    expect(saved[0]).toMatchObject({ status: 'queued', args: [] })

    const r = await rig({ concurrency: 1, store: { queue: saved } })
    await vi.waitFor(() => expect(r.runIds()).toHaveLength(1))
    expect(r.queue.getState().jobs[0].status).toBe('active')
    r.stop()
  })

  it('retry of an unbuildable job (no pending data) errors instead of staying queued forever', async () => {
    const legacy = [{ ...jobShape('a'), status: 'error', args: [] }]
    const bridge = createMockBridge({ deps: DEPS, store: { queue: legacy } })
    const queue = createQueueStore({
      settings: createSettingsStore(),
      history: createHistoryStore(),
    })
    await queue.getState().load(bridge)
    // such an entry is not recoverable, so it is dropped on load
    expect(queue.getState().jobs).toEqual([])

    // and if one gets into that state anyway, retry surfaces an error
    queue.setState({
      jobs: [{ ...jobShape('b'), status: 'error', args: [], attempt: 0 } as never],
    })
    queue.getState().retry('b')
    expect(queue.getState().jobs[0].status).toBe('error')
    expect(queue.getState().jobs[0].error).not.toBeNull()
  })
})

function jobShape(id: string) {
  return {
    id,
    url: `https://youtu.be/${id}`,
    title: id,
    thumbnail: null,
    extractor: 'youtube',
    videoId: id,
    args: ['--x'],
    status: 'done',
    attempt: 1,
    progress: null,
    phase: null,
    filePath: null,
    error: null,
    stderrTail: [],
    startedAt: 1,
    finishedAt: 2,
  }
}

describe('startup is resilient to failing reads', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.theme
  })

  it('falls back to a relative outputDir when videoDir() rejects', async () => {
    const bridge = createMockBridge()
    bridge.os.videoDir = () => Promise.reject(new Error('no XDG dirs'))
    expect((await defaultSettings(bridge)).outputDir).toBe('ytdlp-gui')
    const store = createSettingsStore()
    await store.getState().load(bridge)
    expect(store.getState().loaded).toBe(true)
    expect(store.getState().settings.outputDir).toBe('ytdlp-gui')
  })

  it('treats a rejecting store.get as empty: defaults are used and the queue still accepts jobs', async () => {
    const bridge = createMockBridge({ deps: DEPS })
    bridge.store.get = () => Promise.reject(new Error('disk on fire'))
    const settings = createSettingsStore()
    const history = createHistoryStore()
    const queue = createQueueStore({ settings, history })
    await settings.getState().load(bridge)
    await history.getState().load(bridge)
    await queue.getState().load(bridge)
    expect(settings.getState().loaded).toBe(true)
    expect(settings.getState().settings.concurrency).toBe(2)
    expect(history.getState().items).toEqual([])
    queue.getState().enqueue([input(1)])
    expect(queue.getState().jobs).toHaveLength(1)
  })

  it('bootstrap keeps going when settings and history fail to load', async () => {
    const bridge = createMockBridge({ deps: DEPS })
    const onLine = vi.spyOn(bridge, 'onLine')
    bridge.os.videoDir = () => Promise.reject(new Error('x'))
    bridge.store.get = (key: string) =>
      key === 'queue' ? Promise.resolve(undefined) : Promise.reject(new Error(`cannot read ${key}`))
    const stop = await bootstrapStores(bridge)
    expect(onLine).toHaveBeenCalledTimes(1)
    const before = useQueue.getState().jobs.length
    useQueue.getState().enqueue([input(1)])
    expect(useQueue.getState().jobs).toHaveLength(before + 1)
    stop()
  })

  it('bootstrap still starts the scheduler when a load step throws outright', async () => {
    const bridge = createMockBridge({ deps: DEPS })
    const onLine = vi.spyOn(bridge, 'onLine')
    const load = vi.spyOn(useSettings.getState(), 'load').mockRejectedValue(new Error('boom'))
    const stop = await bootstrapStores(bridge)
    expect(onLine).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalled()
    stop()
  })

  it('skips null and malformed entries in the saved queue and history, keeps valid ones', async () => {
    const good = jobShape('ok')
    const bridge = createMockBridge({
      store: {
        queue: [
          null,
          42,
          'str',
          { id: 'bad' },
          { ...jobShape('x'), status: 'weird' },
          { ...jobShape('y'), args: 'nope' },
          good,
        ],
        history: [
          null,
          { nope: true },
          {
            id: 'h1',
            extractor: 'youtube',
            videoId: 'a',
            title: 'T',
            thumbnail: null,
            path: '/p',
            sizeBytes: null,
            finishedAt: 1,
          },
        ],
      },
    })
    const queue = createQueueStore({
      settings: createSettingsStore(),
      history: createHistoryStore(),
    })
    await queue.getState().load(bridge)
    expect(queue.getState().jobs.map((j) => j.id)).toEqual(['ok'])
    const history = createHistoryStore()
    await history.getState().load(bridge)
    expect(history.getState().items.map((i) => i.id)).toEqual(['h1'])
  })

  it('ignores a non-object saved settings value', async () => {
    const bridge = createMockBridge({ store: { settings: 'garbage' } })
    const store = createSettingsStore()
    await store.getState().load(bridge)
    expect(store.getState().settings.concurrency).toBe(2)
  })
})

const jobFixture = (n: number) => ({
  id: `stored-${n}`,
  url: `https://youtu.be/s${n}`,
  title: `Stored ${n}`,
  thumbnail: null,
  extractor: 'youtube',
  videoId: `s${n}`,
  args: ['--newline', `https://youtu.be/s${n}`],
  status: 'done',
  attempt: 1,
  progress: null,
  phase: null,
  filePath: null,
  error: null,
  stderrTail: [],
  startedAt: null,
  finishedAt: 1,
})

describe('queue: remove', () => {
  it('drops a finished, errored, cancelled or interrupted job, and persists it', async () => {
    const stored = ['done', 'error', 'cancelled', 'interrupted'].map((status, n) => ({
      ...jobFixture(n),
      status,
    }))
    const r = await rig({ store: { queue: stored } })
    expect(r.queue.getState().jobs).toHaveLength(4)
    r.queue.getState().remove(stored[3].id)
    r.queue.getState().remove(stored[0].id)
    expect(r.queue.getState().jobs.map((j) => j.id)).toEqual([stored[1].id, stored[2].id])
    await r.queue.getState().flush()
    expect((lastQueueWrite(r.bridge) as { id: string }[]).map((j) => j.id)).toEqual([
      stored[1].id,
      stored[2].id,
    ])
    r.stop()
  })

  it('leaves an active job alone (cancel it first) and ignores unknown ids', async () => {
    const r = await rig({ concurrency: 1 })
    const [j] = await enqueue(r, 1)
    await flush()
    expect(job(r, 0).status).toBe('active')
    r.queue.getState().remove(j.id)
    r.queue.getState().remove('nope')
    expect(r.queue.getState().jobs).toHaveLength(1)
    expect(r.queue.getState().activeCount).toBe(1)
    r.stop()
  })

  it('clearFinished keeps interrupted jobs', async () => {
    const stored = ['done', 'interrupted'].map((status, n) => ({ ...jobFixture(n), status }))
    const r = await rig({ store: { queue: stored } })
    r.queue.getState().clearFinished()
    expect(r.queue.getState().jobs.map((j) => j.status)).toEqual(['interrupted'])
    r.stop()
  })
})

describe('queue: retryRebuilt', () => {
  const runCalls = (r: Rig) => r.bridge.calls.filter((c) => c.method === 'run')

  async function failedJob(r: Rig) {
    await enqueue(r, 1)
    await vi.waitFor(() => expect(r.runIds()).toHaveLength(1))
    r.bridge.emitExit({ jobId: r.runIds()[0], code: 1 })
    expect(job(r, 0).status).toBe('error')
  }

  it('keeps the options on the job after its args are built', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 1)
    expect(job(r, 0).opts).toEqual(OPTS)
    expect(job(r, 0).pending).toBeUndefined()
    r.stop()
  })

  it('rebuilds the args with the current cookies browser and output folder, then runs them', async () => {
    const r = await rig({ concurrency: 1 })
    await failedJob(r)
    const before = job(r, 0).args
    expect(before).not.toContain('--cookies-from-browser')

    r.settings.getState().update({ cookiesBrowser: 'firefox', outputDir: 'D:\\Novo' })
    r.queue.getState().retryRebuilt(job(r, 0).id)
    await vi.waitFor(() => expect(runCalls(r)).toHaveLength(2))

    const args = runCalls(r)[1].args[1] as string[]
    expect(args).toEqual(
      buildArgs('https://youtu.be/v1', OPTS, r.settings.getState().settings, {
        ffmpeg: '/bin/ffmpeg',
        deno: '/bin/deno',
      }),
    )
    expect(args.join(' ')).toContain('--cookies-from-browser firefox')
    expect(args).toContain('D:\\Novo')
    expect(job(r, 0)).toMatchObject({ status: 'active', attempt: 2, error: null })
    expect(job(r, 0).pending).toBeUndefined()
    r.stop()
  })

  it('plain retry still reuses the frozen args', async () => {
    const r = await rig({ concurrency: 1 })
    await failedJob(r)
    const before = job(r, 0).args
    r.settings.getState().update({ cookiesBrowser: 'firefox' })
    r.queue.getState().retry(job(r, 0).id)
    await vi.waitFor(() => expect(runCalls(r)).toHaveLength(2))
    expect(runCalls(r)[1].args[1]).toEqual(before)
    r.stop()
  })

  it('falls back to a plain retry (same args) for a job saved without options', async () => {
    const stored = { ...jobFixture(1), status: 'error' }
    const r = await rig({ concurrency: 1, store: { queue: [stored] } })
    expect(job(r, 0).opts).toBeUndefined()
    r.settings.getState().update({ cookiesBrowser: 'firefox' })
    r.queue.getState().retryRebuilt(stored.id)
    await vi.waitFor(() => expect(runCalls(r)).toHaveLength(1))
    expect(runCalls(r)[0].args[1]).toEqual(stored.args)
    r.stop()
  })

  it('errors with ffmpeg when it is missing, keeping the job retryable', async () => {
    const r = await rig({ concurrency: 1 })
    await failedJob(r)
    r.bridge.deps.status = () => Promise.resolve({ ytdlp: DEPS.ytdlp, ffmpeg: null, deno: null })
    r.queue.getState().retryRebuilt(job(r, 0).id)
    await vi.waitFor(() => expect(job(r, 0).error?.code).toBe('ffmpeg'))
    expect(job(r, 0).pending?.opts).toEqual(OPTS)
    r.stop()
  })

  it('ignores active, done and unknown jobs', async () => {
    const r = await rig({ concurrency: 1 })
    const [j] = await enqueue(r, 1)
    await vi.waitFor(() => expect(job(r, 0).status).toBe('active'))
    r.queue.getState().retryRebuilt(j.id)
    r.queue.getState().retryRebuilt('nope')
    expect(job(r, 0).status).toBe('active')
    expect(runCalls(r)).toHaveLength(1)
    r.stop()
  })
})

describe('deps.ensure (cached engine status)', () => {
  it('reads the status once, then serves the cache while every tool is installed', async () => {
    const { useDeps } = await import('./deps')
    const bridge = createMockBridge({ deps: ALL_INSTALLED })
    const reads = () => bridge.calls.filter((c) => c.method === 'deps.status').length
    await useDeps.getState().ensure(bridge)
    await useDeps.getState().ensure(bridge)
    await useDeps.getState().ensure(bridge)
    expect(reads()).toBe(1)
  })

  it('reads again while a tool is missing (it may have been installed since)', async () => {
    const { useDeps } = await import('./deps')
    const bridge = createMockBridge()
    await useDeps.getState().ensure(bridge)
    await useDeps.getState().ensure(bridge)
    expect(bridge.calls.filter((c) => c.method === 'deps.status')).toHaveLength(2)
  })
})

describe('queue: engine status is cached', () => {
  it('enqueueing several times does not re-read the status each time', async () => {
    const r = await rig({ concurrency: 1 })
    await enqueue(r, 1)
    r.queue.getState().enqueue([input(2)])
    await vi.waitFor(() => expect(r.queue.getState().jobs.every((j) => j.args.length > 0)).toBe(true))
    r.queue.getState().enqueue([input(3)])
    await vi.waitFor(() => expect(r.queue.getState().jobs.every((j) => j.args.length > 0)).toBe(true))
    expect(r.bridge.calls.filter((c) => c.method === 'deps.status')).toHaveLength(1)
    r.stop()
  })
})
