import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useBridge } from '../../bridge/context'
import type { Bridge } from '../../bridge/types'
import { Icon } from '../../components/Icon'
import { splitUrls } from '../../core/splitUrls'
import { useUi } from '../../stores/ui'
import styles from './UrlField.module.css'
import { useProbe } from './useProbe'

/** `id` of the error message, referenced by the field's `aria-describedby`. */
export const URL_ERROR_ID = 'url-error'

/** The clipboard text, or '' when it is empty, holds an image or cannot be read. */
async function readClipboard(bridge: Bridge): Promise<string> {
  try {
    return (await bridge.os.readClipboard()) || ''
  } catch {
    return ''
  }
}

/**
 * The link field of the top bar (spec 2.1, 3.1): a 40px pill with a check icon once the link is
 * recognised and a "Colar" button. Contract with the shell: the input has `id="url-field"`, which
 * Ctrl/Cmd+V focuses. A paste replaces the whole field and analyses the link right away.
 */
export function UrlField() {
  const { t } = useTranslation()
  const bridge = useBridge()
  const go = useUi((s) => s.go)
  const { state, input, setInput, submit, reset } = useProbe()
  const inputRef = useRef<HTMLInputElement>(null)
  const [clipboardLink, setClipboardLink] = useState<string | null>(null)
  // Read by the async clipboard check, which must not offer a link over text the user typed.
  const fieldIsEmpty = useRef(true)
  const mounted = useRef(false)

  useEffect(() => {
    fieldIsEmpty.current = input === ''
  }, [input])

  const checkClipboard = useCallback(async () => {
    const text = await readClipboard(bridge)
    if (!mounted.current || !fieldIsEmpty.current) return
    setClipboardLink(splitUrls(text).length > 0 ? text.trim() : null)
  }, [bridge])

  useEffect(() => {
    mounted.current = true
    inputRef.current?.focus() // spec 3.3: the app opens with the focus on the link field
    void checkClipboard()
    const onFocus = () => void checkClipboard()
    window.addEventListener('focus', onFocus)
    return () => {
      mounted.current = false
      window.removeEventListener('focus', onFocus)
    }
  }, [checkClipboard])

  const apply = (text: string) => {
    setClipboardLink(null)
    const urls = splitUrls(text)
    // Several links share the one-line field separated by spaces; `splitUrls` reads them back.
    setInput(urls.length > 0 ? urls.join(' ') : text.trim())
    go('download') // Ctrl/Cmd+V works on every screen
    submit(text)
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (text.trim() === '') return
    e.preventDefault()
    apply(text)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    apply(input)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setClipboardLink(null)
  }

  const pasteFromClipboard = async () => {
    const text = await readClipboard(bridge)
    if (text.trim() === '') inputRef.current?.focus()
    else apply(text)
  }

  const recognized = state.status === 'ready' || state.status === 'multi'
  const invalid = state.status === 'error'
  const suggestion = input === '' ? clipboardLink : null

  return (
    <div className={styles.wrap}>
      <form className={styles.field} onSubmit={onSubmit}>
        <div className={styles.inputWrap}>
          {recognized ? (
            <span className={styles.ok} data-testid="url-ok">
              <Icon name="circle-check" size={18} />
            </span>
          ) : null}
          <input
            ref={inputRef}
            id="url-field"
            className={styles.input}
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            aria-label={t('url.label')}
            aria-invalid={invalid}
            aria-describedby={invalid ? URL_ERROR_ID : undefined}
            placeholder={t('url.placeholder')}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              if (e.target.value.trim() === '') reset()
            }}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
          />
        </div>
        <button type="button" className={styles.paste} onClick={() => void pasteFromClipboard()}>
          <Icon name="clipboard" size={18} />
          {t('url.paste')}
        </button>
      </form>
      {suggestion ? (
        <div className={styles.suggest}>
          <button
            type="button"
            className={styles.suggestBtn}
            // Keep the focus in the field, so the suggestion does not blink away before the click.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(suggestion)}
          >
            <Icon name="clipboard" size={18} />
            <span className={styles.suggestText}>
              <span>{t('url.suggestion')}</span>
              <span className={styles.suggestUrl}>{splitUrls(suggestion).join(' ')}</span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
