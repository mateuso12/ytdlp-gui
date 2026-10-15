import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBridge } from '../bridge/context'
import type { AvailableUpdate } from '../bridge/types'
import { Icon } from '../components/Icon'
import { PillButton } from '../components/PillButton'
import { useToast } from '../components/Toast'
import styles from './UpdateBanner.module.css'

type Phase = 'offer' | 'installing' | 'installed'

/**
 * The app-update banner (spec 8.2): checks once when the app opens and, if a newer version exists,
 * offers it without blocking anything. Nothing is installed until the user clicks "Atualizar". A
 * check that rejects (e.g. the updater is not configured yet) means "no update": no banner, no error.
 */
export function UpdateBanner() {
  const { t } = useTranslation()
  const bridge = useBridge()
  const toast = useToast()
  const [update, setUpdate] = useState<AvailableUpdate | null>(null)
  const [phase, setPhase] = useState<Phase>('offer')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    bridge.updater
      .check()
      .then((found) => {
        if (!cancelled) setUpdate(found)
      })
      .catch(() => {
        // No update, and nothing to tell the user.
      })
    return () => {
      cancelled = true
    }
  }, [bridge])

  if (!update || dismissed) return null

  const install = async () => {
    setPhase('installing')
    try {
      await update.install()
      setPhase('installed')
    } catch (error) {
      console.error('app update failed', error)
      toast.show(t('update.failed'))
      setPhase('offer')
    }
  }

  return (
    <section className={styles.banner} aria-label={t('update.label')}>
      <p className={styles.text}>
        {phase === 'installed'
          ? t('update.installed')
          : t('update.available', { version: update.version })}
      </p>
      {phase === 'installed' ? null : (
        <PillButton
          variant="primary"
          disabled={phase === 'installing'}
          onClick={() => void install()}
        >
          {phase === 'installing' ? t('update.installing') : t('update.install')}
        </PillButton>
      )}
      <button
        type="button"
        className={styles.dismiss}
        aria-label={t('update.dismiss')}
        disabled={phase === 'installing'}
        onClick={() => setDismissed(true)}
      >
        <Icon name="x" />
      </button>
    </section>
  )
}
