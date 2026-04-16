import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration.
 *
 * The app is pre-built inside Dockerfile.test with VITE_SEED_DEMO=true, which
 * seeds demo accounts (admin, editor, reviewer) on first browser visit.
 * All demo accounts start with isTemporaryPassword: true, so every auth
 * helper goes through the forced password-change flow.
 *
 * Run via Docker:  bash run_tests.sh --e2e
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

export default defineConfig({
  testDir: './src/test/e2e',

  // Sequential — each spec file manages its own browser context / IndexedDB state
  fullyParallel: false,
  workers: 1,

  // Retry once on CI to tolerate transient flakiness
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,

  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    // Capture a trace on the first retry so failures are debuggable
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Give the app time to initialise (PBKDF2 seeding takes ~1-2 s)
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // The app is pre-built in the Docker image; just serve it with vite preview.
  // reuseExistingServer lets local dev skip the server start when already running.
  webServer: {
    command: 'pnpm preview --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
