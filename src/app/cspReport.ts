/** Logs Content-Security-Policy violations so they show up in the console during `tauri dev`. */
export function reportCspViolations(target: Pick<Document, 'addEventListener'> = document): void {
  target.addEventListener('securitypolicyviolation', (e) => {
    const event = e as SecurityPolicyViolationEvent
    console.warn(`CSP blocked ${event.blockedURI || 'inline'} (${event.violatedDirective})`)
  })
}
