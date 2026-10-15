import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { useUi } from '../stores/ui'
import { App } from './App'

beforeEach(async () => {
  await act(() => i18n.changeLanguage('pt-BR'))
  useUi.setState({ screen: 'download', sidebarCollapsed: false })
})

describe('App shell', () => {
  it('starts on the Download screen', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Baixar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows the Queue screen title when "Fila" is clicked in the sidebar', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Fila' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Fila' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fila' })).toHaveAttribute('aria-current', 'page')
  })

  it('navigates to every screen', async () => {
    const user = userEvent.setup()
    render(<App />)
    for (const name of ['Histórico', 'Configurações', 'Baixar']) {
      await user.click(screen.getByRole('button', { name }))
      expect(screen.getByRole('heading', { level: 1, name })).toBeInTheDocument()
    }
  })

  it('collapses the sidebar with the menu button', async () => {
    const user = userEvent.setup()
    render(<App />)
    const menu = screen.getByRole('button', { name: 'Alternar menu lateral' })
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    await user.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(useUi.getState().sidebarCollapsed).toBe(true)
    await user.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders the Engine heading and the brand name', () => {
    render(<App />)
    expect(screen.getByText('Motor')).toBeInTheDocument()
    expect(screen.getByText('ytdlp-gui')).toBeInTheDocument()
  })

  it('translates the shell when the language changes', async () => {
    render(<App />)
    await act(() => i18n.changeLanguage('en'))
    expect(screen.getByRole('button', { name: 'Queue' })).toBeInTheDocument()
    expect(screen.getByText('Engine')).toBeInTheDocument()
  })
})

describe('Ctrl/Cmd+V shortcut', () => {
  it('focuses the element with id "url-field" when pressed outside an input', async () => {
    const user = userEvent.setup()
    render(<App urlSlot={<input id="url-field" aria-label="url" />} />)
    expect(screen.getByLabelText('url')).not.toHaveFocus()
    await user.keyboard('{Control>}v{/Control}')
    expect(screen.getByLabelText('url')).toHaveFocus()
  })

  it('also works with Meta (Cmd)', async () => {
    const user = userEvent.setup()
    render(<App urlSlot={<input id="url-field" aria-label="url" />} />)
    await user.keyboard('{Meta>}v{/Meta}')
    expect(screen.getByLabelText('url')).toHaveFocus()
  })

  it('does not steal focus from another input', async () => {
    const user = userEvent.setup()
    render(
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
    render(<App />)
    await user.keyboard('{Control>}v{/Control}')
    expect(document.body).toHaveFocus()
  })
})
