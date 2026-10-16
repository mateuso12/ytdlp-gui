import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './BrandLoader.module.css'

/** How far into the splash animation the page was when React took over (set by main.tsx). */
let boot: { elapsed: number; at: number } | null = null

/** Remembers where the pre-React splash animation stood, so the first BrandLoader continues it. */
export function syncWithSplash(elapsedMs: number) {
  boot = { elapsed: elapsedMs, at: performance.now() }
}

/** The offset to resume at; only a loader mounted right after the hand-off continues the splash. */
function resumeOffset(): number {
  if (!boot) return 0
  const since = performance.now() - boot.at
  return since < 1500 ? Math.round(boot.elapsed + since) : 0
}

interface BrandLoaderProps {
  /** Rendered size in px (the mark is square). */
  size?: number
  className?: string
  /** Accessible name; defaults to "checking the engine". `null` makes the loader purely decorative. */
  label?: string | null
}

/**
 * The logo, drawn and then idling in a quiet loop: the loading state of the app. There is no
 * visible phrase; the label is for assistive technology only.
 */
export function BrandLoader({ size = 72, className, label }: BrandLoaderProps) {
  const { t } = useTranslation()
  const [offset] = useState(resumeOffset)
  const style = (offset ? { '--o': `${offset}ms` } : undefined) as CSSProperties | undefined
  const name = label === undefined ? t('onboarding.checking') : label
  return (
    <span
      role={name ? 'status' : undefined}
      aria-live={name ? 'polite' : undefined}
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
      className={`${styles.loader} ${className ?? ''}`.trim()}
      style={style}
    >
      {name ? <span className={styles.label}>{name}</span> : null}
      <svg
        className={styles.mark}
        width={size}
        height={size}
        viewBox="25 24.5 100 100"
        aria-hidden="true"
        focusable="false"
      >
        <g className={styles.drop}>
          <path className={styles.triangle} d="M44 35h62L75 89z" pathLength="100" />
        </g>
        <g className={styles.barIn}>
          <rect className={styles.bar} x="33" y="106" width="84" height="13" rx="6.5" />
        </g>
      </svg>
    </span>
  )
}
