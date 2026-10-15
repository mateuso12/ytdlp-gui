import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ptBR from './locales/pt-BR.json'

export type Locale = 'pt-BR' | 'en'

/** pt* maps to pt-BR (the reference locale); anything else falls back to en. */
export function detectLocale(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

// The first paint uses the navigator's language; once the settings are loaded,
// `startSettingsEffects` (src/stores/settings.ts) takes over and drives i18n.changeLanguage.
void i18n.use(initReactI18next).init({
  resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  lng: detectLocale(typeof navigator === 'undefined' ? undefined : navigator.language),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  initAsync: false,
})

export default i18n
