import * as ToggleGroup from '@radix-ui/react-toggle-group'
import styles from './Segmented.module.css'

interface SegmentedProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  /** Names the group for screen readers when no visible label does. */
  label?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      className={styles.root}
      value={value}
      aria-label={label}
      // Radix emits an empty string when the active item is pressed again; a segmented control always has a value.
      onValueChange={(next) => {
        if (next) onChange(next as T)
      }}
    >
      {options.map((option) => (
        <ToggleGroup.Item key={option.value} className={styles.item} value={option.value}>
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
