import { useId } from 'react'
import * as RadixSwitch from '@radix-ui/react-switch'
import styles from './Switch.module.css'

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
}

export function Switch({ checked, onCheckedChange, label }: SwitchProps) {
  const id = useId()
  return (
    <span className={styles.row}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
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
