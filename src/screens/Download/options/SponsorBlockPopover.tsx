import { useTranslation } from 'react-i18next'
import { Icon } from '../../../components/Icon'
import { Segmented } from '../../../components/Segmented'
import { Switch } from '../../../components/Switch'
import { CheckRow, PlainRow, PopoverHeading, PopoverShell, RowLabel } from './OptionRow'
import styles from './options.module.css'

export const SPONSOR_CATEGORIES = [
  'sponsor',
  'selfpromo',
  'interaction',
  'intro',
  'outro',
  'preview',
  'music_offtopic',
  'filler',
] as const

export interface SponsorBlockState {
  enabled: boolean
  action: 'remove' | 'mark'
  categories: string[]
}

/** What switching SponsorBlock on starts with: remove sponsors and self-promotion. */
export const DEFAULT_SPONSOR_BLOCK: SponsorBlockState = {
  enabled: false,
  action: 'remove',
  categories: ['sponsor', 'selfpromo'],
}

interface SponsorBlockRowProps {
  value: SponsorBlockState
  onChange(next: SponsorBlockState): void
}

/**
 * "Remover patrocínios": the switch turns SponsorBlock on; once on, the summary opens the
 * popover that picks remove or mark, and the categories.
 */
export function SponsorBlockRow({ value, onChange }: SponsorBlockRowProps) {
  const { t } = useTranslation()
  const n = value.categories.length
  const summary =
    n === 0
      ? t('panel.sponsor.none')
      : t(n === 1 ? 'panel.sponsor.one' : 'panel.sponsor.other', { n })

  const toggle = (category: string, on: boolean) =>
    onChange({
      ...value,
      // keep the order of the list, whatever order they were ticked in
      categories: SPONSOR_CATEGORIES.filter((c) =>
        c === category ? on : value.categories.includes(c),
      ),
    })

  return (
    <PlainRow>
      <Switch
        fill
        label={
          <RowLabel icon="shield-check">
            {t(value.action === 'remove' ? 'panel.sponsor.remove' : 'panel.sponsor.mark')}
          </RowLabel>
        }
        checked={value.enabled}
        onCheckedChange={(enabled) => onChange({ ...value, enabled })}
      >
        {value.enabled ? (
          <PopoverShell
            label={t('panel.sponsor.categories')}
            trigger={
              <button type="button" className={`${styles.summary} ${styles.summaryButton}`}>
                <span className={styles.summaryText}>{summary}</span>
                <Icon name="chevron-right" size={16} />
              </button>
            }
          >
            <PopoverHeading>{t('panel.sponsor.action')}</PopoverHeading>
            <Segmented
              label={t('panel.sponsor.action')}
              value={value.action}
              onChange={(action) => onChange({ ...value, action })}
              options={[
                { value: 'remove', label: t('panel.sponsor.actionRemove') },
                { value: 'mark', label: t('panel.sponsor.actionMark') },
              ]}
            />
            <div className={styles.group}>
              <PopoverHeading>{t('panel.sponsor.categories')}</PopoverHeading>
              <div className={styles.list}>
                {SPONSOR_CATEGORIES.map((category) => (
                  <CheckRow
                    key={category}
                    checked={value.categories.includes(category)}
                    onChange={(on) => toggle(category, on)}
                  >
                    {t(`panel.sponsor.category.${category}`)}
                  </CheckRow>
                ))}
              </div>
            </div>
          </PopoverShell>
        ) : null}
      </Switch>
    </PlainRow>
  )
}
