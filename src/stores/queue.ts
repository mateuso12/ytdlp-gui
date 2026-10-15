import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { Bridge } from '../bridge/types'
import { buildArgs, type BinPaths } from '../core/buildArgs'
import { mapError } from '../core/mapError'
import { parseLine } from '../core/parseProgress'
import type { DownloadOptions, FriendlyError, ProgressEvent, Settings } from '../core/types'
import { useHistory, type HistoryStore } from './history'
import { createWriter } from './persist'
import { useSettings, type SettingsStore } from './settings'

export const STDERR_TAIL_LINES = 50

export type JobStatus = 'queued' | 'active' | 'done' | 'error' | 'cancelled' | 'interrupted'

export interface Job {
  id: string
  url: string
  title: string
  thumbnail: string | null
  extractor: string
  videoId: string
  /** The full yt-dlp argv, frozen when the job was enqueued: a retry reuses it as is. */
  args: string[]
  status: JobStatus
  /**
   * How many times this job has been started. The id handed to `bridge.run` is
   * `${id}#${attempt}`, so events from an older run can never touch a newer one.
   */
  attempt: number
  /** Last progress line. `null` while `active` means indeterminate (e.g. `--download-sections`), not 0%. */
  progress: ProgressEvent | null
  phase: ProgressEvent['phase'] | null
  filePath: string | null
  error: FriendlyError | null
  stderrTail: string[]
  startedAt: number | null
  finishedAt: number | null
}

export interface QueueInput {
  url: string
  title: string
  thumbnail: string | null
  extractor: string
  videoId: string
  opts: DownloadOptions
}

export interface QueueState {
  jobs: Job[]
  /** Jobs with status `active`. Kept in state so components can select it. */
  activeCount: number
  /**
   * Run ids whose cancel is still in flight. Those processes may not be dead
   * yet, so they keep holding a concurrency slot until `bridge.cancel` settles.
   */
  terminating: string[]

  load(bridge: Bridge): Promise<void>
  enqueue(inputs: QueueInput[]): void
  cancel(id: string): void
  retry(id: string): void
  /** Drops done, cancelled and errored jobs from the list (history keeps the finished downloads). */
  clearFinished(): void
  /** Resolves when every pending write has reached the store. */
  flush(): Promise<void>

  // Scheduler-facing. The UI never calls these.
  /** Marks up to `limit - busy` queued jobs active (synchronously) and returns them. */
  startReady(limit: number): Job[]
  handleLine(runId: string, stream: 'stdout' | 'stderr', line: string): void
  handleExit(runId: string, code: number | null): void
  handleRunError(runId: string, error: unknown): void
}

export const runIdOf = (job: Pick<Job, 'id' | 'attempt'>) => `${job.id}#${job.attempt}`

function parseRunId(runId: string): { id: string; attempt: number } | null {
  const i = runId.lastIndexOf('#')
  if (i <= 0) return null
  const attempt = Number(runId.slice(i + 1))
  return Number.isInteger(attempt) ? { id: runId.slice(0, i), attempt } : null
}

const countActive = (jobs: Job[]) => jobs.filter((j) => j.status === 'active').length

const FFMPEG_MISSING: FriendlyError = {
  code: 'ffmpeg',
  titleKey: 'errors.ffmpeg.title',
  messageKey: 'errors.ffmpeg.message',
  action: 'reinstall_ffmpeg',
  lastLine: 'ffmpeg is not installed',
}

/** Jobs saved as `active` were cut off by the app closing; they come back as `interrupted`. */
function restoreJob(raw: Job): Job {
  const job: Job = { ...raw, attempt: raw.attempt ?? 0, stderrTail: raw.stderrTail ?? [] }
  return job.status === 'active'
    ? { ...job, status: 'interrupted', phase: null, finishedAt: Date.now() }
    : job
}

/** True when a job was added/removed, changed status, or got its args. Progress alone is not a change. */
function structureChanged(a: Job[], b: Job[]): boolean {
  if (a.length !== b.length) return true
  return a.some((j, i) => j.id !== b[i].id || j.status !== b[i].status || j.args !== b[i].args)
}

export interface QueueDeps {
  settings: SettingsStore
  history: HistoryStore
}

/**
 * Stores are created by factories so each test gets a fresh one; the app uses
 * the module singleton `useQueue`. Call `load(bridge)` once at startup, then
 * `startScheduler(bridge)` to actually run jobs.
 */
export function createQueueStore(deps: Partial<QueueDeps> = {}) {
  const settingsStore = deps.settings ?? useSettings
  const historyStore = deps.history ?? useHistory
  let bridge: Bridge | null = null
  /** What each job needs to build its args; dropped once the args exist. Not persisted. */
  const specs = new Map<string, { url: string; opts: DownloadOptions; settings: Settings }>()

  const writer = createWriter(
    'queue',
    () => bridge,
    // A job whose args are still being built is not worth saving yet.
    () => store.getState().jobs.filter((j) => j.args.length > 0 || j.status !== 'queued'),
  )
  const store: UseBoundStore<StoreApi<QueueState>> = create<QueueState>()((set, get) => {
    const patch = (jobs: Job[]) => ({ jobs, activeCount: countActive(jobs) })
    const updateJob = (id: string, fn: (j: Job) => Job) =>
      set((s) => patch(s.jobs.map((j) => (j.id === id ? fn(j) : j))))

    /** The job a run id belongs to, but only while that exact run is the live one. */
    const liveJob = (runId: string): Job | null => {
      const parsed = parseRunId(runId)
      if (!parsed) return null
      const job = get().jobs.find((j) => j.id === parsed.id)
      return job && job.status === 'active' && job.attempt === parsed.attempt ? job : null
    }

    const fail = (job: Job, error: FriendlyError) =>
      updateJob(job.id, (j) => ({ ...j, status: 'error', error, finishedAt: Date.now() }))

    /** Builds the args of freshly enqueued jobs from the installed tool paths (R9). */
    async function prepare(b: Bridge, ids: string[]) {
      let bin: BinPaths | null = null
      try {
        const status = await b.deps.status()
        if (status.ffmpeg) bin = { ffmpeg: status.ffmpeg.path, deno: status.deno?.path ?? null }
      } catch {
        // treated like a missing ffmpeg: nothing can run
      }
      set((s) =>
        patch(
          s.jobs.map((j) => {
            const spec = specs.get(j.id)
            if (!spec || !ids.includes(j.id)) return j
            if (!bin) {
              // keep the spec so a retry can try again once ffmpeg is installed
              return j.status === 'queued'
                ? { ...j, status: 'error', error: FFMPEG_MISSING, finishedAt: Date.now() }
                : j
            }
            specs.delete(j.id)
            return { ...j, args: buildArgs(spec.url, spec.opts, spec.settings, bin) }
          }),
        ),
      )
    }

    return {
      jobs: [],
      activeCount: 0,
      terminating: [],

      async load(b) {
        bridge = b
        const stored = await b.store.get<Job[]>('queue')
        const restored = Array.isArray(stored) ? stored.map(restoreJob) : []
        // Anything enqueued while the read was in flight stays after the restored jobs.
        set((s) => patch([...restored, ...s.jobs]))
      },

      enqueue(inputs) {
        if (!bridge) throw new Error('queue store used before load()')
        const settings = settingsStore.getState().settings
        const jobs: Job[] = inputs.map(({ opts, ...i }) => {
          const job: Job = {
            ...i,
            id: crypto.randomUUID(),
            args: [],
            status: 'queued',
            attempt: 0,
            progress: null,
            phase: null,
            filePath: null,
            error: null,
            stderrTail: [],
            startedAt: null,
            finishedAt: null,
          }
          specs.set(job.id, { url: i.url, opts, settings })
          return job
        })
        set((s) => patch([...s.jobs, ...jobs]))
        void prepare(
          bridge,
          jobs.map((j) => j.id),
        )
      },

      cancel(id) {
        const job = get().jobs.find((j) => j.id === id)
        if (!job) return
        const done = (j: Job): Job => ({ ...j, status: 'cancelled', finishedAt: Date.now() })
        if (job.status === 'queued') {
          updateJob(id, done)
        } else if (job.status === 'active') {
          const runId = runIdOf(job)
          set((s) => ({
            ...patch(s.jobs.map((j) => (j.id === id ? done(j) : j))),
            terminating: [...s.terminating, runId],
          }))
          let killed: Promise<unknown>
          try {
            killed = Promise.resolve(bridge?.cancel(runId))
          } catch (e) {
            killed = Promise.reject(e)
          }
          void killed
            .catch(() => false)
            .then(() => set((s) => ({ terminating: s.terminating.filter((r) => r !== runId) })))
        }
      },

      retry(id) {
        const job = get().jobs.find((j) => j.id === id)
        if (!job || !['error', 'cancelled', 'interrupted'].includes(job.status)) return
        // Same args as before: settings changed since then must not alter a retry.
        updateJob(id, (j) => ({
          ...j,
          status: 'queued',
          progress: null,
          phase: null,
          filePath: null,
          error: null,
          stderrTail: [],
          startedAt: null,
          finishedAt: null,
        }))
        if (job.args.length === 0 && specs.has(id) && bridge) void prepare(bridge, [id])
      },

      clearFinished() {
        const finished = ['done', 'error', 'cancelled']
        set((s) => patch(s.jobs.filter((j) => !finished.includes(j.status))))
      },

      flush: () => writer.settled(),

      startReady(limit) {
        const { jobs, activeCount, terminating } = get()
        const free = limit - activeCount - terminating.length
        if (free <= 0) return []
        const ids = jobs
          .filter((j) => j.status === 'queued' && j.args.length > 0)
          .slice(0, free)
          .map((j) => j.id)
        if (ids.length === 0) return []
        const now = Date.now()
        set((s) =>
          patch(
            s.jobs.map((j) =>
              ids.includes(j.id)
                ? {
                    ...j,
                    status: 'active',
                    attempt: j.attempt + 1,
                    phase: 'downloading',
                    progress: null,
                    filePath: null,
                    error: null,
                    stderrTail: [],
                    startedAt: now,
                    finishedAt: null,
                  }
                : j,
            ),
          ),
        )
        return get().jobs.filter((j) => ids.includes(j.id))
      },

      handleLine(runId, stream, line) {
        const job = liveJob(runId)
        if (!job) return
        if (stream === 'stderr') {
          const text = line.replace(/[\r\n]+$/, '')
          updateJob(job.id, (j) => ({
            ...j,
            stderrTail: [...j.stderrTail, text].slice(-STDERR_TAIL_LINES),
          }))
          return
        }
        const event = parseLine(line)
        if (!event) return
        if (event.type === 'progress') {
          updateJob(job.id, (j) => ({ ...j, progress: event.data, phase: event.data.phase }))
        } else if (event.type === 'file') {
          updateJob(job.id, (j) => ({ ...j, filePath: event.path }))
        } else {
          updateJob(job.id, (j) => ({ ...j, phase: event.phase }))
        }
      },

      handleExit(runId, code) {
        const job = liveJob(runId)
        if (!job) return
        if (code !== 0) {
          fail(job, mapError(job.stderrTail))
          return
        }
        const finishedAt = Date.now()
        updateJob(job.id, (j) => ({ ...j, status: 'done', error: null, finishedAt }))
        historyStore.getState().add({
          id: job.id,
          extractor: job.extractor,
          videoId: job.videoId,
          title: job.title,
          thumbnail: job.thumbnail,
          path: job.filePath ?? '',
          sizeBytes: job.progress?.totalBytes ?? null,
          finishedAt,
        })
      },

      handleRunError(runId, error) {
        const job = liveJob(runId)
        if (!job) return
        fail(job, mapError([error instanceof Error ? error.message : String(error)]))
      },
    }
  })

  // Persist on structural changes only (added/removed/status/args), never per progress or stderr line.
  store.subscribe((s, prev) => {
    if (structureChanged(s.jobs, prev.jobs)) void writer.write()
  })

  return store
}

export type QueueStore = ReturnType<typeof createQueueStore>

export const useQueue = createQueueStore()

const schedulers = new WeakMap<QueueStore, Promise<() => void>>()

/**
 * Wires the bridge events into the queue and starts queued jobs while fewer than
 * `settings.concurrency` are busy. Idempotent per queue store (a second call
 * returns the first one's teardown). Resolves, once subscribed, to the teardown.
 */
export function startScheduler(
  bridge: Bridge,
  stores: { queue: QueueStore; settings: SettingsStore } = {
    queue: useQueue,
    settings: useSettings,
  },
): Promise<() => void> {
  const { queue, settings } = stores
  const existing = schedulers.get(queue)
  if (existing) return existing

  const started = (async () => {
    let stopped = false

    const launch = (job: Job) => {
      const runId = runIdOf(job)
      bridge.run(runId, job.args).then(
        () => {
          // A cancel can land before the process is registered; make sure it dies.
          const now = queue.getState().jobs.find((j) => j.id === job.id)
          if (now && now.status === 'cancelled' && now.attempt === job.attempt) {
            void bridge.cancel(runId).catch(() => false)
          }
        },
        (error) => queue.getState().handleRunError(runId, error),
      )
    }

    const pump = () => {
      if (stopped) return
      const limit = Math.max(1, Math.floor(settings.getState().settings.concurrency) || 1)
      for (const job of queue.getState().startReady(limit)) launch(job)
    }

    const [line, exit] = await Promise.allSettled([
      bridge.onLine((e) => queue.getState().handleLine(e.jobId, e.stream, e.line)),
      bridge.onExit((e) => queue.getState().handleExit(e.jobId, e.code)),
    ])
    if (line.status === 'rejected' || exit.status === 'rejected') {
      if (line.status === 'fulfilled') line.value()
      if (exit.status === 'fulfilled') exit.value()
      throw line.status === 'rejected' ? line.reason : (exit as PromiseRejectedResult).reason
    }

    const offQueue = queue.subscribe(pump)
    const offSettings = settings.subscribe(pump)
    pump() // jobs restored as `queued` from the previous session

    const stop = () => {
      if (stopped) return
      stopped = true
      line.value()
      exit.value()
      offQueue()
      offSettings()
      schedulers.delete(queue)
    }
    return stop
  })()

  schedulers.set(queue, started)
  started.catch(() => schedulers.delete(queue))
  return started
}
