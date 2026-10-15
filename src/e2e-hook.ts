import type { ExitEvent, LineEvent } from './bridge/types'
import type { MockCall } from './bridge/mock'

/**
 * What `window.__e2e` offers the Playwright specs. It exists only in the `e2e` build
 * (`src/main.e2e.tsx`, selected by `vite --mode e2e`) and is never part of the production bundle.
 */
export interface E2EHook {
  /** Pretends yt-dlp wrote a line. `jobId` is the run id the app passed to `bridge.run`. */
  emitLine(e: LineEvent): void
  /** Pretends the yt-dlp process ended. */
  emitExit(e: ExitEvent): void
  /** Every Bridge call made so far, in order. */
  calls: MockCall[]
}
