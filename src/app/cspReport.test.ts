import { describe, expect, it, vi } from 'vitest'
import mainSource from '../main.tsx?raw'
import { reportCspViolations } from './cspReport'

describe('reportCspViolations', () => {
  it('warns with the blocked URI and the directive', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const doc = document.implementation.createHTMLDocument('t')
    reportCspViolations(doc)
    const event = new Event('securitypolicyviolation')
    Object.assign(event, { blockedURI: 'https://x.test/a.png', violatedDirective: 'img-src' })
    doc.dispatchEvent(event)
    expect(warn).toHaveBeenCalledWith('CSP blocked https://x.test/a.png (img-src)')
    warn.mockRestore()
  })

  it('is only registered in development builds', () => {
    // main.tsx guards the call with import.meta.env.DEV; production builds drop it.
    expect(mainSource).toMatch(/if \(import\.meta\.env\.DEV\) reportCspViolations\(\)/)
  })
})
