import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { BridgeProvider } from '../bridge/context'
import { createMockBridge } from '../bridge/mock'
import i18n from '../i18n'
import { ProbeProvider } from '../screens/Download/ProbeProvider'
import { useDeps } from '../stores/deps'
import { useUi } from '../stores/ui'
import { ALL_INSTALLED } from '../test/fixtures'
import { App } from './App'

/** The Download screen reads the probe state, so the shell needs the providers `main.tsx` adds. */
function renderShell(ui: ReactElement) {
  // Seeded, so the first render is the shell and not the "checking the engine" screen.
  useDeps.setState({ status: ALL_INSTALLED, failed: false })
  return render(
    <BridgeProvider bridge={createMockBridge({ deps: ALL_INSTALLED })}>
      <ProbeProvider>{ui}</ProbeProvider>
    </BridgeProvider>,
  )
}

beforeEach(async () => {
  await act(() => i18n.changeLanguage('pt-BR'))
  useUi.setState({ screen: 'download', sidebarCollapsed: false })
})

describe('App shell', () => {
  it('starts on the Download screen', () => {
    renderShell(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Baixar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows the Queue screen title when "Fila" is clicked in the sidebar', async () => {
    const user = userEvent.setup()
    renderShell(<App />)
    await user.click(screen.getByRole('button', { name: 'Fila' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Fila' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fila' })).toHaveAttribute('aria-current', 'page')
  })

  it('navigates to every screen', async () => {
    const user = userEvent.setup()
    renderShell(<App />)
    for (const name of ['Histórico', 'Configurações', 'Baixar']) {
      await user.click(screen.getByRole('button', { name }))
      expect(screen.getByRole('heading', { level: 1, name })).toBeInTheDocument()
    }
  })

  it('collapses the sidebar with the menu button', async () => {
    const user = userEvent.setup()
    renderShell(<App />)
    const menu = screen.getByRole('button', { name: 'Alternar menu lateral' })
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    await user.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(useUi.getState().sidebarCollapsed).toBe(true)
    await user.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders the Engine heading and the brand name', () => {
    renderShell(<App />)
    expect(screen.getByText('Motor')).toBeInTheDocument()
    expect(screen.getByText('ytdlp-gui')).toBeInTheDocument()
  })

  it('translates the shell when the language changes', async () => {
    renderShell(<App />)
    await act(() => i18n.changeLanguage('en'))
    expect(screen.getByRole('button', { name: 'Queue' })).toBeInTheDocument()
    expect(screen.getByText('Engine')).toBeInTheDocument()
  })
})

describe('Ctrl/Cmd+V shortcut', () => {
  it('focuses the element with id "url-field" when pressed outside an input', async () => {
    const user = userEvent.setup()
    renderShell(<App urlSlot={<input id="url-field" aria-label="url" />} />)
    expect(screen.getByLabelText('url')).not.toHaveFocus()
    await user.keyboard('{Control>}v{/Control}')
    expect(screen.getByLabelText('url')).toHaveFocus()
  })

  it('also works with Meta (Cmd)', async () => {
    const user = userEvent.setup()
    renderShell(<App urlSlot={<input id="url-field" aria-label="url" />} />)
    await user.keyboard('{Meta>}v{/Meta}')
    expect(screen.getByLabelText('url')).toHaveFocus()
  })

  it('does not steal focus from another input', async () => {
    const user = userEvent.setup()
    renderShell(
      <>
        <input aria-label="other" />
        <App urlSlot={<input id="url-field" aria-label="url" />} />
      </>,
    )
    await user.click(screen.getByLabelText('other'))
    await user.keyboard('{Control>}v{/Control}')
    expect(screen.getByLabelText('other')).toHaveFocus()
  })

  it('does nothing when there is no url field', async () => {
    const user = userEvent.setup()
    renderShell(<App />)
    await user.keyboard('{Control>}v{/Control}')
    expect(document.body).toHaveFocus()
  })

  it('ignores Ctrl+Shift+V (paste as plain text elsewhere) and Ctrl+Alt+V', () => {
    renderShell(<App urlSlot={<input id="url-field" aria-label="url" />} />)
    fireEvent.keyDown(document.body, { key: 'V', ctrlKey: true, shiftKey: true })
    expect(screen.getByLabelText('url')).not.toHaveFocus()
    fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true, altKey: true })
    expect(screen.getByLabelText('url')).not.toHaveFocus()
  })

  it('ignores key repeat', () => {
    renderShell(<App urlSlot={<input id="url-field" aria-label="url" />} />)
    fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true, repeat: true })
    expect(screen.getByLabelText('url')).not.toHaveFocus()
  })

  it('ignores a key event something else already handled', () => {
    renderShell(<App urlSlot={<input id="url-field" aria-label="url" />} />)
    const handled = (e: Event) => e.preventDefault()
    window.addEventListener('keydown', handled, true)
    fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true })
    window.removeEventListener('keydown', handled, true)
    expect(screen.getByLabelText('url')).not.toHaveFocus()
  })
})
