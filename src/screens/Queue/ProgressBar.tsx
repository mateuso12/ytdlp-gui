import styles from './Queue.module.css'

interface ProgressBarProps {
  /** What the bar measures, read by screen readers. */
  label: string
  /** 0-100, or `null` when unknown: the bar then slides instead of showing a number that would be a lie. */
  percent: number | null
  /** The spoken value when `percent` is unknown. */
  unknownText: string
}

/** The thin progress bar of the queue rows, also used by the first-run setup. */
export function ProgressBar({ label, percent, unknownText }: ProgressBarProps) {
  return (
    <div
      className={styles.bar}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-valuetext={percent === null ? unknownText : `${percent}%`}
      data-indeterminate={percent === null}
    >
      <div
        className={styles.fill}
        style={percent === null ? undefined : { width: `${percent}%` }}
      />
    </div>
  )
}
