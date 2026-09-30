import { defineConfig, devices } from '@playwright/test'

/**
 * E2E runs against the real production build served by `vite preview`, so the
 * tests exercise the same bundle a judge would load. Network is blocked except
 * for the app's own origin: the flows must work with no external calls.
 */
export default defineConfig({
  testDir: './e2e',
  // live.spec.ts hits the real network and only runs on explicit request
  testIgnore: [process.env.RA_VISUAL ? 'never-ignore-visual' : '**/visual.spec.ts', ...(process.env.RA_LIVE ? [] : ['**/live.spec.ts'])],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    // `npm run build` runs first as a separate step; the suite always tests the
    // production bundle, never the dev server.
    command: 'npx vite preview --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
