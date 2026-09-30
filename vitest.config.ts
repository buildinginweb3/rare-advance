import { defineConfig } from 'vitest/config'

/**
 * Unit tests only. Playwright specs live in `e2e/` and are run by the
 * `playwright` runner, never by vitest.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: 'default',
  },
})
