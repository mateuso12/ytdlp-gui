import { create } from 'zustand'

export type Screen = 'download' | 'queue' | 'history' | 'settings'

interface UiState {
  screen: Screen
  sidebarCollapsed: boolean
  go(screen: Screen): void
  toggleSidebar(): void
}

export const useUi = create<UiState>((set) => ({
  screen: 'download',
  sidebarCollapsed: false,
  go: (screen) => set({ screen }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}))
