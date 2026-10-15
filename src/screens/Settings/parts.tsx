import { useId, useState, type ReactNode } from 'react'
import type { SettingsSection } from '../../stores/ui'
import styles from './Settings.module.css'
import type { Validation } from './validate'

interface SectionProps {
  id: SettingsSection
  title: string
  children: ReactNode
}

/**
 * One Settings section: a titled region. The title takes focus (it has `tabIndex={-1}`) when an
 * error action sends the user here, so a screen reader announces where they landed.
 */
export function Section({ id, title, children }: SectionProps) {
  return (
    <section
      className={styles.section}
      id={`settings-${id}`}
      aria-labelledby={`settings-${id}-title`}
    >
      <h2 className={styles.title} id={`settings-${id}-title`} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </section>
  )
}

interface RowProps {
  /** Visible label. Pass `htmlFor` when the control is a native input/select it names. */
  label: string
  htmlFor?: string
  hint?: ReactNode
  /** Puts the control under the label instead of beside it (long fields). */
  stack?: boolean
  children: ReactNode
}

/** "Label on the left, control on the right", like the option rows of the Download panel. */
export function Row({ label, htmlFor, hint, stack = false, children }: RowProps) {
  return (
    <div className={`${styles.row} ${stack ? styles.stack : ''}`}>
      <div className={styles.text}>
        {htmlFor ? (
          <label className={styles.label} htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className={styles.label}>{label}</span>
        )}
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  )
}

interface DraftFieldOptions<T> {
  /** What is saved now, as the text the field shows. */
  stored: string
  validate(text: string): Validation<T>
  /** Called with every valid value; an invalid text is never passed on (so never saved). */
  commit(value: T): void
}

/**
 * The text of a field being edited. A valid text is saved as it is typed; an invalid one stays in
 * the field with an error and is never saved. The draft is dropped on blur when valid, so the
 * field goes back to showing what is stored.
 */
export function useDraftField<T>({ stored, validate, commit }: DraftFieldOptions<T>) {
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? stored
  return {
    text,
    invalid: draft !== null && !validate(draft).ok,
    onChange(next: string) {
      setDraft(next)
      const result = validate(next)
      if (result.ok) commit(result.value)
    },
    onBlur() {
      if (validate(text).ok) setDraft(null)
    },
    /** Saves a value picked some other way (an example chip) and drops the draft. */
    pick(value: T) {
      setDraft(null)
      commit(value)
    },
  }
}

interface TextRowProps {
  label: string
  hint?: ReactNode
  placeholder?: string
  value: string
  invalid: boolean
  error: string
  mono?: boolean
  stack?: boolean
  onChange(next: string): void
  onBlur(): void
}

/** A text field row with an inline, announced error. */
export function TextRow({
  label,
  hint,
  placeholder,
  value,
  invalid,
  error,
  mono = false,
  stack = false,
  onChange,
  onBlur,
}: TextRowProps) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <Row label={label} htmlFor={id} hint={hint} stack={stack}>
      <input
        id={id}
        type="text"
        className={`${styles.input} ${mono ? styles.mono : ''} ${stack ? styles.wide : ''}`}
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {invalid ? (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </Row>
  )
}

interface SelectRowProps<T extends string> {
  label: string
  hint?: ReactNode
  value: T
  options: { value: T; label: string }[]
  onChange(value: T): void
}

export function SelectRow<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: SelectRowProps<T>) {
  const id = useId()
  return (
    <Row label={label} htmlFor={id} hint={hint}>
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  )
}
