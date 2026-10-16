import { render, screen } from '@testing-library/react'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { BrandLoader } from './BrandLoader'

describe('BrandLoader', () => {
  beforeEach(() => act(() => i18n.changeLanguage('pt-BR')))
  afterEach(() => vi.unstubAllGlobals())

  it('is a polite status with an accessible name and no visible text', () => {
    const { container } = render(<BrandLoader />)
    const status = screen.getByRole('status', { name: 'Verificando o motor…' })
    expect(status).toHaveAttribute('aria-live', 'polite')
    // The only text is the visually hidden label; the glyph itself is decorative.
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(container.textContent).toBe('Verificando o motor…')
    expect(status.firstElementChild?.className).toMatch(/label/)
  })

  it('renders the animated mark at the requested size (default 72)', () => {
    const { container, rerender } = render(<BrandLoader />)
    const svg = () => container.querySelector('svg')
    expect(svg()).toHaveAttribute('width', '72')
    expect(container.querySelector('[class*="triangle"]')).not.toBeNull()
    expect(container.querySelector('[class*="bar"]')).not.toBeNull()
    expect(container.querySelector('[class*="drop"]')).not.toBeNull()
    rerender(<BrandLoader size={56} />)
    expect(svg()).toHaveAttribute('height', '56')
  })

  it('still renders the full static mark when reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }))
    const { container } = render(<BrandLoader />)
    expect(container.querySelector('path')).not.toBeNull()
    expect(container.querySelector('rect')).not.toBeNull()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('can be decorative when another element carries the status', () => {
    const { container } = render(<BrandLoader label={null} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})
