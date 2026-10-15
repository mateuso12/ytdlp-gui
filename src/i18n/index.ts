import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ptBR from './locales/pt-BR.json'

export type Locale = 'pt-BR' | 'en'

/** pt* maps to pt-BR (the reference locale); anything else falls back to en. */
export function detectLocale(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

// TODO(task 13): read the language from the settings store instead of the navigator.
void i18n.use(initReactI18next).init({
  resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  lng: detectLocale(typeof navigator === 'undefined' ? undefined : navigator.language),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  initAsync: false,
})

export default i18n
