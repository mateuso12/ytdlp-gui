import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBridge } from '../../bridge/context'
import type { DepName } from '../../bridge/types'
import { PillButton } from '../../components/PillButton'
import { Segmented } from '../../components/Segmented'
import type { Settings } from '../../core/types'
import { useDeps } from '../../stores/deps'
import { useSettings } from '../../stores/settings'
import { Row, Section } from './parts'
import styles from './Settings.module.css'

type Channel = Settings['channel']

const TOOLS: { which: DepName; name: string }[] = [
  { which: 'ytdlp', name: 'yt-dlp' },
  { which: 'ffmpeg', name: 'ffmpeg' },
  { which: 'deno', name: 'Deno' },
]

/** What the engine panel is doing now, and the last thing it has to say. */
type Busy = DepName | 'update' | null
type Note = { kind: 'info' | 'error'; text: string } | null

export function EngineSection() {
  const { t } = useTranslation()
  const bridge = useBridge()
  const status = useDeps((s) => s.status)
  const channel = useSettings((s) => s.settings.channel)
  const update = useSettings((s) => s.update)
  const [busy, setBusy] = useState<Busy>(null)
  const [note, setNote] = useState<Note>(null)

  useEffect(() => {
    void useDeps.getState().refresh(bridge)
  }, [bridge])

  const run = async (what: Exclude<Busy, null>, work: () => Promise<string | null>) => {
    setBusy(what)
    setNote(null)
    try {
      const text = await work()
      await useDeps.getState().refresh(bridge)
      if (text) setNote({ kind: 'info', text })
    } catch (error) {
      setNote({
        kind: 'error',
        text: t('settings.failed', {
          reason: error instanceof Error ? error.message : String(error),
        }),
      })
    } finally {
      setBusy(null)
    }
  }

  const updateNow = () =>
    run('update', async () => {
      const before = status?.ytdlp?.version
      const version = await bridge.deps.update(channel)
      return version === before
        ? t('settings.engine.upToDate')
        : t('settings.engine.updated', { version })
    })

  const install = (which: DepName) =>
    run(which, async () => {
      await bridge.deps.install(which)
      return null
    })

  return (
    <Section id="engine" title={t('settings.sections.engine')}>
      {TOOLS.map(({ which, name }) => {
        const tool = status?.[which] ?? null
        const source = tool && 'source' in tool ? tool.source : null
        return (
          <Row key={which} label={name}>
            {tool ? (
              <>
                <span className={styles.version}>{tool.version}</span>
                {source ? (
                  <span className={styles.source}>{t(`settings.engine.source.${source}`)}</span>
                ) : null}
              </>
            ) : status ? (
              <>
                <span className={styles.muted}>{t('settings.engine.notInstalled')}</span>
                <PillButton
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => void install(which)}
                >
                  {busy === which
                    ? t('settings.engine.installing')
                    : t('settings.engine.install', { name })}
                </PillButton>
              </>
            ) : null}
          </Row>
        )
      })}
      <Row label={t('settings.engine.channel')}>
        <Segmented<Channel>
          label={t('settings.engine.channel')}
          value={channel}
          options={[
            { value: 'stable', label: t('settings.engine.stable') },
            { value: 'nightly', label: t('settings.engine.nightly') },
          ]}
          onChange={(value) => update({ channel: value })}
        />
        <PillButton variant="primary" disabled={busy !== null} onClick={() => void updateNow()}>
          {busy === 'update' ? t('settings.engine.updating') : t('settings.engine.update')}
        </PillButton>
      </Row>
      {note?.kind === 'error' ? (
        <p className={styles.failure} role="alert">
          {note.text}
        </p>
      ) : note ? (
        <p className={styles.status} role="status">
          {note.text}
        </p>
      ) : null}
    </Section>
  )
}
