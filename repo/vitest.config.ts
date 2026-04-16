import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Exclude Playwright E2E specs — they use a different runner and must not
    // be collected by Vitest.
    exclude: ['node_modules/**', 'src/test/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Write to a subdirectory so vitest can manage its own dir without
      // conflicting with the Docker bind-mount point (/app/coverage)
      reportsDirectory: './coverage/data',
      exclude: [
        'node_modules/',
        'src/test/',
        // Pure UI primitives (Button, Table, Modal, etc.) — exercised indirectly
        // by page tests; no behaviour logic to unit-test independently.
        'src/components/**',
        // Entry points — not testable in jsdom
        'src/main.tsx',
        'src/App.tsx',
        'src/index.css',
        // DOM-specific utility not runnable in Node.js
        'src/utils/sanitize.ts',
        // DB migration upgrade functions — tested implicitly by integration tests
        'src/db/database.ts',
      ],
      include: ['src/**/*.{ts,tsx}'],
      // Thresholds now cover pages, stores, hooks, and services together.
      // Pages, stores, and hooks that were previously excluded are now measured —
      // so the numbers are honest across the full shipped UI/state surface.
      // Complex form/detail pages not yet directly tested lower the ceiling,
      // which is intentional: these gaps are now visible rather than hidden.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
})
