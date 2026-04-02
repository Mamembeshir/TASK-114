import '@testing-library/jest-dom'
// Polyfill IndexedDB for jsdom — must come before any Dexie imports
import 'fake-indexeddb/auto'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'

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
