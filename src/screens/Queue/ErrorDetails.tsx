import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { useBridge } from '../../bridge/context'
import { PillButton } from '../../components/PillButton'
import { useToast } from '../../components/Toast'
import styles from './Queue.module.css'

const MASK = '•••'
/** Flags whose value is private: it never reaches the screen or the clipboard. */
const SECRET_FLAGS = ['--cookies-from-browser', '--proxy']

/** The argv with the value of every secret flag replaced by `•••` (both `--flag value` and `--flag=value`). */
export function maskArgs(args: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const inline = SECRET_FLAGS.find((flag) => arg.startsWith(`${flag}=`))
    if (inline) {
      out.push(`${inline}=${MASK}`)
    } else if (SECRET_FLAGS.includes(arg) && i + 1 < args.length) {
      out.push(arg, MASK)
      i++
    } else {
      out.push(arg)
    }
  }
  return out
}

/** The command as one readable line. Quoting is for reading only, not for pasting into a shell. */
export function formatCommand(args: readonly string[]): string {
  const quote = (a: string) => (a === '' || /[\s"']/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)
  return ['yt-dlp', ...maskArgs(args).map(quote)].join(' ')
}

/** yt-dlp echoes the proxy URL in some errors; the user:password part must not leak either. */
export function maskStderr(lines: readonly string[]): string[] {
  return lines.map((line) => line.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, `$1${MASK}@`))
}

interface ErrorDetailsProps {
  args: readonly string[]
  stderrTail: readonly string[]
}

/** The "Ver detalhes técnicos" link and the dialog it opens. */
export function ErrorDetails({ args, stderrTail }: ErrorDetailsProps) {
  const { t } = useTranslation()
  const bridge = useBridge()
  const toast = useToast()

  const command = args.length > 0 ? formatCommand(args) : ''
  const stderr = maskStderr(stderrTail).join('\n')
  const report = [command, stderr].filter(Boolean).join('\n\n')

  const copy = async () => {
    try {
      await bridge.os.writeClipboard(report)
      toast.show(t('queue.details.copied'))
    } catch (error) {
      toast.show(
        t('queue.actionFailed', { reason: error instanceof Error ? error.message : String(error) }),
      )
    }
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className={styles.link}>
          {t('queue.technicalDetails')}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          <Dialog.Title className={styles.dialogTitle}>{t('queue.details.title')}</Dialog.Title>
          <Dialog.Description className={styles.dialogHint}>
            {t('queue.details.description')}
          </Dialog.Description>
          {command ? (
            <>
              <h3 className={styles.dialogLabel}>{t('queue.details.command')}</h3>
              <pre className={styles.code} data-testid="command" tabIndex={0}>
                {command}
              </pre>
            </>
          ) : null}
          <h3 className={styles.dialogLabel}>{t('queue.details.stderr')}</h3>
          <pre className={styles.code} data-testid="stderr" tabIndex={0}>
            {stderr || t('queue.details.noStderr')}
          </pre>
          <div className={styles.dialogFooter}>
            <PillButton variant="primary" icon="clipboard" onClick={() => void copy()}>
              {t('queue.details.copy')}
            </PillButton>
            <Dialog.Close asChild>
              <PillButton variant="ghost">{t('queue.details.close')}</PillButton>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
