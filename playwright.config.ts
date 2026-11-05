import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

// End-to-end tests (D27). Run with: npm run test:e2e
//
// The full workflow tests need a separate Supabase project for testing, set up
// in .env.test (see TESTING.md). Without it, only the tests that never change
// data run, against the project in .env.
if (existsSync('.env.test')) process.loadEnvFile('.env.test')
else if (existsSync('.env')) process.loadEnvFile('.env')

const PORT = 5174

export default defineConfig({
  testDir: './e2e',
  // Only one survey can be active at a time, so tests that activate surveys
  // must never run at the same time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Desktop browsers plus phone screen sizes (TODO.md Phase 14).
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    // "--mode test" makes Vite load .env.test on top of .env.
    command: `npx vite --mode test --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
