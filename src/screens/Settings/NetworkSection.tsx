import { useTranslation } from 'react-i18next'
import { useSettings } from '../../stores/settings'
import { Section, TextRow, useDraftField } from './parts'
import { validateProxy, validateRateLimit, validateRetries } from './validate'

export function NetworkSection() {
  const { t } = useTranslation()
  const rateLimit = useSettings((s) => s.settings.rateLimit)
  const proxy = useSettings((s) => s.settings.proxy)
  const retries = useSettings((s) => s.settings.retries)
  const update = useSettings((s) => s.update)

  const rate = useDraftField({
    stored: rateLimit ?? '',
    validate: validateRateLimit,
    commit: (value) => update({ rateLimit: value }),
  })
  const proxyField = useDraftField({
    stored: proxy ?? '',
    validate: validateProxy,
    commit: (value) => update({ proxy: value }),
  })
  const retriesField = useDraftField({
    stored: String(retries),
    validate: validateRetries,
    commit: (value) => update({ retries: value }),
  })

  return (
    <Section id="network" title={t('settings.sections.network')}>
      <TextRow
        label={t('settings.network.rateLimit.label')}
        hint={t('settings.network.rateLimit.hint')}
        placeholder={t('settings.network.rateLimit.placeholder')}
        value={rate.text}
        invalid={rate.invalid}
        error={t('settings.network.rateLimit.error')}
        mono
        onChange={rate.onChange}
        onBlur={rate.onBlur}
      />
      <TextRow
        label={t('settings.network.proxy.label')}
        hint={t('settings.network.proxy.hint')}
        placeholder={t('settings.network.proxy.placeholder')}
        value={proxyField.text}
        invalid={proxyField.invalid}
        error={t('settings.network.proxy.error')}
        mono
        onChange={proxyField.onChange}
        onBlur={proxyField.onBlur}
      />
      <TextRow
        label={t('settings.network.retries.label')}
        hint={t('settings.network.retries.hint')}
        value={retriesField.text}
        invalid={retriesField.invalid}
        error={t('settings.network.retries.error')}
        mono
        onChange={retriesField.onChange}
        onBlur={retriesField.onBlur}
      />
    </Section>
  )
}
