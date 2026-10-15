import * as Popover from '@radix-ui/react-popover'
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../../components/Icon'
import styles from './options.module.css'

/** The icon and name at the start of an option row. */
export function RowLabel({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span className={styles.label}>
      <Icon name={icon} size={18} />
      {children}
    </span>
  )
}

/** A plain option row (icon and name on the left, a control on the right). */
export function PlainRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>
}

interface PopoverShellProps {
  /** Names the popover for screen readers. */
  label: string
  trigger: ReactNode
  children: ReactNode
}

/**
 * A Radix popover that opens under its trigger, aligned to the right edge of the option list. It
 * keeps focus inside while open, closes on Escape and gives focus back to the trigger.
 */
export function PopoverShell({ label, trigger, children }: PopoverShellProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.popover}
          aria-label={label}
          align="end"
          side="bottom"
          sideOffset={6}
          collisionPadding={16}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

interface PopoverRowProps {
  icon: IconName
  label: string
  /** What is set now: the text on the right of the row. */
  summary: ReactNode
  children: ReactNode
}

/** An option row that shows what is set and opens a popover to change it ("Legendas  Português ›"). */
export function PopoverRow({ icon, label, summary, children }: PopoverRowProps) {
  return (
    <PopoverShell
      label={label}
      trigger={
        <button type="button" className={`${styles.row} ${styles.rowButton}`}>
          <RowLabel icon={icon}>{label}</RowLabel>
          <span className={styles.summary}>
            <span className={styles.summaryText}>{summary}</span>
            <Icon name="chevron-right" size={16} />
          </span>
        </button>
      }
    >
      {children}
    </PopoverShell>
  )
}

interface CheckRowProps {
  checked: boolean
  onChange(checked: boolean): void
  children: ReactNode
}

/** A checkbox with its label, one per line of a popover list. */
export function CheckRow({ checked, onChange, children }: CheckRowProps) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        className={styles.box}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  )
}

export function PopoverHeading({ children }: { children: ReactNode }) {
  return <p className={styles.heading}>{children}</p>
}
