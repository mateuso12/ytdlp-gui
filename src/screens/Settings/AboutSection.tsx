import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_AUTHOR, APP_NAME, REPO_URL } from '../../app/brand'
import { useBridge } from '../../bridge/context'
import { useToast } from '../../components/Toast'
import { Section } from './parts'
import styles from './Settings.module.css'

/** The projects the app is built on (all on GitHub, the only host the opener capability allows). */
const CREDITS = [
  { name: 'yt-dlp', license: 'Unlicense', url: 'https://github.com/yt-dlp/yt-dlp' },
  { name: 'ffmpeg', license: 'LGPL/GPL', url: 'https://github.com/FFmpeg/FFmpeg' },
  { name: 'Deno', license: 'MIT', url: 'https://github.com/denoland/deno' },
] as const

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  const { t } = useTranslation()
  const bridge = useBridge()
  const toast = useToast()

  // The webview must not navigate away from the app: the system browser opens the page.
  const open = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    bridge.os.openUrl(href).catch((error: unknown) => {
      toast.show(
        t('settings.failed', { reason: error instanceof Error ? error.message : String(error) }),
      )
    })
  }

  return (
    <a className={styles.link} href={href} onClick={open}>
      {children}
    </a>
  )
}

export function AboutSection() {
  const { t } = useTranslation()
  return (
    <Section id="about" title={t('settings.sections.about')}>
      <p className={styles.paragraph}>
        <span className={styles.appName}>{APP_NAME}</span>
        {' · '}
        {t('settings.about.description')}
      </p>
      <p className={styles.paragraph}>{t('settings.about.author', { author: APP_AUTHOR })}</p>
      <p className={styles.paragraph}>
        <ExternalLink href={REPO_URL}>{t('settings.about.repo')}</ExternalLink>
      </p>
      <p className={styles.paragraph}>{t('settings.about.license')}</p>
      <p className={styles.paragraph}>{t('settings.about.creditsIntro')}</p>
      <ul className={styles.credits} aria-label={t('settings.about.credits')}>
        {CREDITS.map(({ name, license, url }) => (
          <li key={name}>
            <ExternalLink href={url}>{name}</ExternalLink>
            {` (${license})`}
          </li>
        ))}
      </ul>
    </Section>
  )
}
