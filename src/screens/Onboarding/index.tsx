import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBridge } from '../../bridge/context'
import type { DepName, DepsProgress, DepsStatus } from '../../bridge/types'
import { BrandLoader } from '../../components/BrandLoader'
import { Icon } from '../../components/Icon'
import { PillButton } from '../../components/PillButton'
import { formatBytes } from '../../core/units'
import { useDeps } from '../../stores/deps'
import { useUi } from '../../stores/ui'
import { ProgressBar } from '../Queue/ProgressBar'
import styles from './Onboarding.module.css'

/** The tools, in install order (R9). */
const TOOLS: { which: DepName; name: string }[] = [
  { which: 'ytdlp', name: 'yt-dlp' },
  { which: 'ffmpeg', name: 'ffmpeg' },
  { which: 'deno', name: 'Deno' },
]

/** True while the app cannot work yet: the status is unknown or a tool is missing. */
export function needsSetup(status: DepsStatus | null): boolean {
  return status === null || TOOLS.some(({ which }) => status[which] === null)
}

type Problem =
  /** `reason` is the error text; `null` when the install ended but the tool is still missing. */
  | { kind: 'step'; which: DepName; reason: string | null }
  /** The status could not be read (or not confirmed after an install). */
  | { kind: 'read' }

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * First-run engine setup (spec 2.5): installs yt-dlp, ffmpeg and Deno, each only when absent, in
 * that order, one at a time. The shell shows it while `needsSetup(status)`; it gates the UI only,
 * the stores bootstrap underneath. A failed step stops the run and offers "Tentar de novo", which
 * starts again from the missing tools, so a step that worked is never repeated.
 */
export function Onboarding() {
  const { t, i18n } = useTranslation()
  const bridge = useBridge()
  const status = useDeps((s) => s.status)
  const readFailed = useDeps((s) => s.failed)
  const [installing, setInstalling] = useState<DepName | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [progress, setProgress] = useState<Partial<Record<DepName, DepsProgress>>>({})
  // The run belongs to the component, not to an effect: StrictMode re-runs effects, and an
  // install must never start twice.
  const running = useRef(false)
  // Resolves once the latest progress subscription is live, so an install does not miss events.
  const subscribed = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let off: (() => void) | undefined
    let disposed = false
    subscribed.current = bridge.deps
      .onProgress((p) => setProgress((all) => ({ ...all, [p.which]: p })))
      .then((unsubscribe) => {
        if (disposed) unsubscribe()
        else off = unsubscribe
      })
      // Without events the bars are just indeterminate; the install itself still works.
      .catch((error: unknown) => console.error('could not follow the install progress', error))
    return () => {
      disposed = true
      off?.()
    }
  }, [bridge])

  const run = useCallback(async () => {
    if (running.current) return
    running.current = true
    setProblem(null)
    try {
      let deps = useDeps.getState()
      if (deps.status === null || deps.failed) {
        await deps.refresh(bridge)
        deps = useDeps.getState()
        if (deps.status === null || deps.failed) {
          setProblem({ kind: 'read' })
          return
        }
      }
      for (const { which } of TOOLS) {
        if (useDeps.getState().status?.[which]) continue
        setInstalling(which)
        await subscribed.current
        try {
          await bridge.deps.install(which)
        } catch (error) {
          console.error(`could not install ${which}`, error)
          setProblem({ kind: 'step', which, reason: reasonOf(error) })
          return
        } finally {
          setProgress((all) => ({ ...all, [which]: undefined }))
        }
        await useDeps.getState().refresh(bridge)
        if (useDeps.getState().failed) {
          setProblem({ kind: 'read' })
          return
        }
      }
      const missing = TOOLS.find(({ which }) => !useDeps.getState().status?.[which])
      if (missing) {
        setProblem({ kind: 'step', which: missing.which, reason: null })
        return
      }
      // The shell takes over now; it focuses the link field as it mounts.
      useUi.getState().go('download')
    } finally {
      running.current = false
      setInstalling(null)
    }
  }, [bridge])

  // The status is known and something is missing: start. (Unknown: the shell is still reading it.)
  const known = status !== null
  useEffect(() => {
    if (known) void run()
  }, [known, run])

  // A read that failed before any status was known has no run behind it to report it.
  const shown: Problem | null = problem ?? (!known && readFailed ? { kind: 'read' } : null)
  const checking = !known && !readFailed
  const nameOf = (which: DepName) => TOOLS.find((tool) => tool.which === which)?.name ?? which
  const liveText = installing ? t('onboarding.installing', { name: nameOf(installing) }) : ''

  // Nothing is known to be missing yet: show only the logo loader (its label says the engine is
  // being checked), so the first-run copy never flashes at someone who already has everything.
  if (checking) {
    return (
      <section className={styles.checking} aria-busy="true">
        <BrandLoader size={72} />
      </section>
    )
  }

  return (
    <section className={styles.screen} aria-labelledby="onboarding-title">
      <BrandLoader size={56} label={null} className={styles.loader} />
      <h1 id="onboarding-title" className={styles.title}>
        {t('onboarding.title')}
      </h1>
      <p className={styles.intro}>{t('onboarding.intro')}</p>
      <ul className={styles.list} aria-label={t('onboarding.tools')}>
        {TOOLS.map(({ which, name }) => (
          <ToolRow
            key={which}
            name={name}
            tool={status?.[which] ?? null}
            installing={installing === which}
            failed={shown?.kind === 'step' && shown.which === which}
            progress={progress[which]}
            language={i18n.language}
          />
        ))}
      </ul>
      <p className={styles.live} role="status">
        {liveText}
      </p>
      {shown ? (
        <div className={styles.problem} role="alert">
          <p className={styles.problemText}>
            {shown.kind === 'step'
              ? t('onboarding.failed', { name: nameOf(shown.which) })
              : t('onboarding.readFailed')}
          </p>
          {shown.kind === 'step' ? (
            <p className={styles.reason}>{shown.reason ?? t('onboarding.notFound')}</p>
          ) : null}
          <PillButton variant="primary" icon="rotate-ccw" onClick={() => void run()}>
            {t('onboarding.retry')}
          </PillButton>
        </div>
      ) : null}
    </section>
  )
}

interface ToolRowProps {
  name: string
  tool: { version: string; source?: 'app' | 'system' } | null
  installing: boolean
  failed: boolean
  progress: DepsProgress | undefined
  language: string
}

function ToolRow({ name, tool, installing, failed, progress, language }: ToolRowProps) {
  const { t } = useTranslation()
  const percent =
    progress && progress.total
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : null
  const state = tool
    ? tool.source === 'system'
      ? t('onboarding.state.system')
      : t('onboarding.state.installed')
    : installing
      ? t('onboarding.state.installing')
      : failed
        ? t('onboarding.state.failed')
        : t('onboarding.state.waiting')

  return (
    <li className={styles.row}>
      <div className={styles.rowHead}>
        <span className={styles.name}>{name}</span>
        <span className={`${styles.state} ${failed ? styles.stateFailed : ''}`}>
          {tool ? <Icon name="check" size={16} /> : null}
          {state}
        </span>
      </div>
      {installing && !tool ? (
        <>
          <ProgressBar
            label={t('onboarding.progressLabel', { name })}
            percent={percent}
            unknownText={t('onboarding.state.installing')}
          />
          {progress ? (
            <span className={styles.bytes}>
              {progress.total
                ? `${formatBytes(progress.received, language)} / ${formatBytes(progress.total, language)}`
                : formatBytes(progress.received, language)}
            </span>
          ) : null}
        </>
      ) : null}
    </li>
  )
}
