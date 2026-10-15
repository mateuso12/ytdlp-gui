import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { useDeps } from '../stores/deps'

beforeEach(() => {
  // The engine status is cached in a module singleton; a test must never inherit another's.
  useDeps.setState({ status: null, failed: false })
})

afterEach(() => {
  cleanup()
})
