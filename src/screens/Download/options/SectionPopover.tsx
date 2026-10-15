import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../components/Icon'
import { PillButton } from '../../../components/PillButton'
import type { SectionResult } from '../../../core/timecode'
import { PopoverRow } from './OptionRow'
import styles from './options.module.css'

export interface SectionText {
  start: string
  end: string
}

export const NO_SECTION_TEXT: SectionText = { start: '', end: '' }

interface SectionRowProps {
  value: SectionText
  result: SectionResult
  onChange(next: SectionText): void
}

/** "Baixar só um trecho": the start and end boxes, checked as they are typed. */
export function SectionRow({ value, result, onChange }: SectionRowProps) {
  const { t } = useTranslation()
  const errorId = useId()

  const summary = !result.ok ? (
    <span className={styles.invalid}>
      <Icon name="alert-circle" size={16} />
      {t('panel.section.invalid')}
    </span>
  ) : result.section ? (
    `${result.section.start} → ${result.section.end === 'inf' ? t('panel.section.untilEnd') : result.section.end}`
  ) : (
    t('panel.section.off')
  )

  const invalidField = result.ok ? null : result.field
  const field = (which: 'start' | 'end', label: string, placeholder: string) => (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        type="text"
        className={styles.input}
        value={value[which]}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        inputMode="decimal"
        aria-invalid={invalidField === which}
        aria-describedby={invalidField === which ? errorId : undefined}
        onChange={(e) => onChange({ ...value, [which]: e.target.value })}
      />
    </label>
  )

  return (
    <PopoverRow icon="scissors" label={t('panel.section.label')} summary={summary}>
      <div className={styles.fields}>
        {field('start', t('panel.section.start'), '0:00')}
        <span className={styles.arrow} aria-hidden="true">
          →
        </span>
        {field('end', t('panel.section.end'), t('panel.section.untilEnd'))}
      </div>
      {result.ok ? (
        <p className={styles.note}>{t('panel.section.hint')}</p>
      ) : (
        <p role="alert" id={errorId} className={styles.error}>
          {t(`panel.section.errors.${result.error}`)}
        </p>
      )}
      <div className={styles.actions}>
        <PillButton
          variant="ghost"
          disabled={value.start === '' && value.end === ''}
          onClick={() => onChange(NO_SECTION_TEXT)}
        >
          {t('panel.section.clear')}
        </PillButton>
      </div>
    </PopoverRow>
  )
}
