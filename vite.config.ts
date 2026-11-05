import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

/**
 * The headers Cloudflare Pages sends for every page, read from the "/*" block
 * of public/_headers, so `vite preview` (used by the e2e tests) sends the
 * same security headers as production (D28).
 */
function productionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  let inAllPages = false
  for (const line of readFileSync('public/_headers', 'utf8').split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      inAllPages = line.trim() === '/*'
      continue
    }
    const separator = line.indexOf(':')
    if (inAllPages && separator > 0) {
      headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
    }
  }
  return headers
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    headers: productionHeaders(),
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
