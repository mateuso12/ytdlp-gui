import { useTranslation } from 'react-i18next'
import { useBridge } from '../../bridge/context'
import type { Settings } from '../../core/types'
import { useSettings } from '../../stores/settings'
import { Section, SelectRow } from './parts'
import styles from './Settings.module.css'

type Browser = Settings['cookiesBrowser']

export function AccessSection() {
  const { t } = useTranslation()
  const bridge = useBridge()
  const cookiesBrowser = useSettings((s) => s.settings.cookiesBrowser)
  const update = useSettings((s) => s.update)
  const platform = bridge.os.platform()

  const browsers: Browser[] = [
    'none',
    'firefox',
    'chrome',
    'edge',
    'brave',
    'chromium',
    ...(platform === 'macos' || cookiesBrowser === 'safari' ? (['safari'] as const) : []),
  ]
  // Chrome's app-bound cookie encryption (Windows, 2024) blocks yt-dlp; the spec recommends Firefox.
  const chromeBlocked = platform === 'windows' && cookiesBrowser === 'chrome'

  return (
    <Section id="access" title={t('settings.sections.access')}>
      <SelectRow<Browser>
        label={t('settings.access.cookies')}
        hint={t('settings.access.hint')}
        value={cookiesBrowser}
        options={browsers.map((value) => ({
          value,
          label:
            t(`settings.access.browsers.${value}`) +
            (value === 'firefox' ? ` ${t('settings.access.recommended')}` : ''),
        }))}
        onChange={(value) => update({ cookiesBrowser: value })}
      />
      {chromeBlocked ? (
        <p className={styles.note} role="note">
          {t('settings.access.chromeWarning')}
        </p>
      ) : null}
    </Section>
  )
}
