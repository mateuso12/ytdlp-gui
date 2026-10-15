import { create } from 'zustand'

export type Screen = 'download' | 'queue' | 'history' | 'settings'

/** The Settings sections, in order. Each has the anchor `settings-<id>` on the screen. */
export const SETTINGS_SECTIONS = [
  'downloads',
  'network',
  'access',
  'appearance',
  'engine',
  'about',
] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

interface UiState {
  screen: Screen
  sidebarCollapsed: boolean
  /** The Settings section to scroll to and focus on arrival; the screen clears it once it has. */
  settingsSection: SettingsSection | null
  /** Switches screen. `section` only means something for `settings` (e.g. an error action). */
  go(screen: Screen, opts?: { section?: SettingsSection }): void
  clearSettingsSection(): void
  toggleSidebar(): void
}

export const useUi = create<UiState>((set) => ({
  screen: 'download',
  sidebarCollapsed: false,
  settingsSection: null,
  go: (screen, opts) =>
    set({ screen, settingsSection: screen === 'settings' ? (opts?.section ?? null) : null }),
  clearSettingsSection: () => set({ settingsSection: null }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}))
