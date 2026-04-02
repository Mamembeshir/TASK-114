import '@testing-library/jest-dom'
// Polyfill IndexedDB for jsdom — must come before any Dexie imports
import 'fake-indexeddb/auto'
import { beforeAll, afterAll } from 'vitest'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'

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

// Seed a system-level admin user into the auth store so that service-layer
// permission guards (requirePermission) pass in all service tests.
// Individual tests that need to verify permission denial can override this.
useAuthStore.setState({
  currentUser: {
    id: 'test-system-user',
    username: 'system',
    displayName: 'Test System',
    email: 'system@test',
    passwordHash: '',
    passwordSalt: '',
    role: Role.Administrator,
    isActive: true,
    isTemporaryPassword: false,
    createdAt: 0,
    updatedAt: 0,
    createdBy: 'system',
  },
  sessionId: 'test-session',
  isLoading: false,
  error: null,
})
