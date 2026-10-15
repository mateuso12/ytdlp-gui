import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Chip } from './Chip'
import { Icon } from './Icon'
import { PillButton } from './PillButton'
import { Segmented } from './Segmented'
import { Switch } from './Switch'

describe('Chip', () => {
  it('exposes selection through aria-pressed', () => {
    render(
      <>
        <Chip selected onClick={() => {}}>
          1080p
        </Chip>
        <Chip onClick={() => {}}>720p</Chip>
      </>,
    )
    expect(screen.getByRole('button', { name: '1080p' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '720p' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onClick and renders the hint', async () => {
    const onClick = vi.fn()
    render(
      <Chip onClick={onClick} hint="~420 MB">
        1080p
      </Chip>,
    )
    expect(screen.getByText('~420 MB')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('Switch', () => {
  function Harness() {
    const [checked, setChecked] = useState(false)
    return <Switch checked={checked} onCheckedChange={setChecked} label="Legendas" />
  }

  it('toggles with the Space key', async () => {
    render(<Harness />)
    const sw = screen.getByRole('switch', { name: 'Legendas' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.tab()
    expect(sw).toHaveFocus()
    await userEvent.keyboard(' ')
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await userEvent.keyboard(' ')
    expect(sw).toHaveAttribute('aria-checked', 'false')
  })
})

describe('Segmented', () => {
  it('calls onChange with the clicked value', async () => {
    const onChange = vi.fn()
    render(
      <Segmented
        value="one"
        onChange={onChange}
        options={[
          { value: 'one', label: 'Só este vídeo' },
          { value: 'all', label: 'Playlist inteira' },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Playlist inteira' }))
    expect(onChange).toHaveBeenCalledWith('all')
  })

  it('does not call onChange when the active item is clicked again', async () => {
    const onChange = vi.fn()
    render(
      <Segmented
        value="one"
        onChange={onChange}
        options={[
          { value: 'one', label: 'A' },
          { value: 'all', label: 'B' },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'A' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('PillButton', () => {
  it('renders a real button that handles clicks', async () => {
    const onClick = vi.fn()
    render(
      <PillButton variant="primary" icon="download" onClick={onClick}>
        Baixar
      </PillButton>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Baixar' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('Icon', () => {
  it('renders an svg hidden from assistive tech', () => {
    const { container } = render(<Icon name="download" size={20} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '20')
    expect(svg).toHaveAttribute('stroke-width', '1.75')
  })
})
