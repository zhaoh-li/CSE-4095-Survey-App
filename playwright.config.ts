import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

// End-to-end tests (D27, D28).
//
// npm run test:e2e
//   Builds the app and serves it with `vite preview`, which sends the same
//   security headers as Cloudflare (public/_headers). The full workflow tests
//   need a separate Supabase test project in .env.test (see TESTING.md).
//   Without it, only the tests that never change data run, against .env.
//
// E2E_BASE_URL=https://<site>.pages.dev npm run test:e2e:prod
//   Runs only the read-only tests against the live site and its database (.env).
const productionUrl = process.env.E2E_BASE_URL

if (productionUrl) {
  if (existsSync('.env')) process.loadEnvFile('.env')
} else if (existsSync('.env.test')) {
  process.loadEnvFile('.env.test')
} else if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

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
    baseURL: productionUrl ?? `http://localhost:${PORT}`,
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
  // A production build ("--mode test" loads .env.test on top of .env), kept in
  // its own folder so it never mixes with the real dist/.
  webServer: productionUrl
    ? undefined
    : {
        command:
          `npx vite build --mode test --outDir dist-e2e --emptyOutDir && ` +
          `npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
})
