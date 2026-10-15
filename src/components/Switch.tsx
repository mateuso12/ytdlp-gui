import { useId, type ReactNode } from 'react'
import * as RadixSwitch from '@radix-ui/react-switch'
import styles from './Switch.module.css'

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: ReactNode
  /** Stretches over the row: the label on the left, the switch on the right. */
  fill?: boolean
  /** Sits between the label and the switch (e.g. a summary button that opens more settings). */
  children?: ReactNode
}

export function Switch({ checked, onCheckedChange, label, fill = false, children }: SwitchProps) {
  const id = useId()
  return (
    <span className={`${styles.row} ${fill ? styles.fill : ''}`}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
      <RadixSwitch.Root
        id={id}
        className={styles.root}
        checked={checked}
        onCheckedChange={onCheckedChange}
      >
        <RadixSwitch.Thumb className={styles.thumb} />
      </RadixSwitch.Root>
    </span>
  )
}
