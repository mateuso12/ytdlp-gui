import * as RadixToast from '@radix-ui/react-toast'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Toast.module.css'

export const TOAST_DURATION_MS = 4000

interface ToastApi {
  /** Shows a short message at the bottom of the window for a few seconds. */
  show(message: string): void
}

interface ToastItem {
  id: number
  message: string
}

const ToastContext = createContext<ToastApi | null>(null)

/** Hosts the toasts. It sits above the screens, so a toast outlives the screen that raised it. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const show = useCallback((message: string) => {
    setToasts((list) => [...list, { id: nextId.current++, message }])
  }, [])
  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      <RadixToast.Provider
        duration={TOAST_DURATION_MS}
        swipeDirection="down"
        label={t('toast.label')}
      >
        {children}
        {toasts.map((toast) => (
          <RadixToast.Root
            key={toast.id}
            className={styles.toast}
            onOpenChange={(open) => {
              if (!open) setToasts((list) => list.filter((item) => item.id !== toast.id))
            }}
          >
            <RadixToast.Title className={styles.title}>{toast.message}</RadixToast.Title>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className={styles.viewport} />
      </RadixToast.Provider>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside a <ToastProvider>')
  return api
}
