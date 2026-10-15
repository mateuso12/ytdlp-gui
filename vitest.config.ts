import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      // The coverage gate only covers the pure core; the rest is covered by component and e2e tests.
      include: ['src/core/**'],
      thresholds: { lines: 90 },
    },
  },
})
