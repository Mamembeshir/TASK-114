import '@testing-library/jest-dom'
// Polyfill IndexedDB for jsdom — must come before any Dexie imports
import 'fake-indexeddb/auto'

// Polyfill window.matchMedia — not implemented in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
import { beforeAll, afterAll } from 'vitest'
import { useAuthStore } from '@/store/authStore'

// Suppress "A suspended resource finished loading inside a test, but the event
// was not wrapped in act(...)" warnings. These come from React.lazy's internal
// Suspense Promise resolution in jsdom — a known limitation when all lazy page
// imports are vi.mock-ed (the mocks resolve synchronously but React.lazy's
// internal transition still fires asynchronously). Tests are correct; the
// warning is a false positive caused by the test environment, not the code.
const _consoleError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('suspended resource finished loading')) {
      return
    }
    _consoleError(...args)
  }
})
afterAll(() => {
  console.error = _consoleError
})

// Default to unauthenticated state. Each test that requires an authenticated
// session must explicitly call useAuthStore.setState() with the role it needs.
// This ensures permission regressions are not masked by a globally-seeded admin.
useAuthStore.setState({
  currentUser: null,
  sessionId: null,
  isLoading: false,
  error: null,
})
