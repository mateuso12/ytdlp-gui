import type { ReactNode } from 'react'
import styles from './Chip.module.css'

interface ChipProps {
  selected?: boolean
  onClick: () => void
  children: ReactNode
  hint?: string
}

export function Chip({ selected = false, onClick, children, hint }: ChipProps) {
  return (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={selected}
      data-selected={selected}
      onClick={onClick}
    >
      {children}
      {hint ? <small className={styles.hint}>{hint}</small> : null}
    </button>
  )
}
