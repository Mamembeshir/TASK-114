/**
 * Unit tests for authStore.login lockout logic.
 *
 * Covers:
 *  - 5 consecutive failures trigger lockout
 *  - Lockout error message is surfaced
 *  - Login is blocked while lockout is active
 *  - Successful login clears failure counter
 *  - Lockout expires after the configured duration (simulated via localStorage manipulation)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { hashPassword } from '@/crypto/password'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'

const USERNAME = 'locktest'
const PASSWORD = 'correct-password'
const LS_LOCKOUT_KEY = `meridian_lockout_${USERNAME}`

async function seedUser() {
  const { hash, salt } = await hashPassword(PASSWORD)
  await db.users.put({
    id: 'lock-user-1',
    username: USERNAME,
    displayName: 'Lock Tester',
    email: 'lock@test',
    passwordHash: hash,
    passwordSalt: salt,
    role: Role.Participant,
    isActive: true,
    isTemporaryPassword: false,
    createdAt: 0,
    updatedAt: 0,
    createdBy: 'system',
  })
}

beforeEach(async () => {
  await Promise.all([
    db.users.clear(),
    db.sessions.clear(),
    db.auditLogs.clear(),
  ])
  localStorage.removeItem(LS_LOCKOUT_KEY)
  localStorage.removeItem('meridian_session')
  useAuthStore.setState({ currentUser: null, sessionId: null, isLoading: false, error: null })
  await seedUser()
})

async function loginWrong() {
  await useAuthStore.getState().login(USERNAME, 'wrong-password')
}

async function loginCorrect() {
  await useAuthStore.getState().login(USERNAME, PASSWORD)
}

// ── Lockout after 5 failures ─────────────────────────────────────────────────

describe('authStore lockout — failure counting', () => {
  it('allows login attempts up to 4 failures without lockout', async () => {
    for (let i = 0; i < 4; i++) {
      await loginWrong()
      const { error } = useAuthStore.getState()
      expect(error).toMatch(/invalid username or password/i)
      expect(error).not.toMatch(/locked/i)
    }
  })

  it('locks the account after 5 consecutive failures', async () => {
    for (let i = 0; i < 5; i++) {
      await loginWrong()
    }
    const { error } = useAuthStore.getState()
    expect(error).toMatch(/account locked/i)
  })

  it('rejects login while lockout is active, even with correct password', async () => {
    for (let i = 0; i < 5; i++) {
      await loginWrong()
    }
    // Now try correct credentials
    await loginCorrect()
    const { error, currentUser } = useAuthStore.getState()
    expect(error).toMatch(/account locked/i)
    expect(currentUser).toBeNull()
  })
})

// ── Recovery ─────────────────────────────────────────────────────────────────

describe('authStore lockout — recovery', () => {
  it('clears failure counter on successful login', async () => {
    // Accumulate 3 failures
    for (let i = 0; i < 3; i++) {
      await loginWrong()
    }

    // Successful login should clear the counter
    await loginCorrect()
    expect(useAuthStore.getState().currentUser).not.toBeNull()

    // Reset store and log out
    useAuthStore.setState({ currentUser: null, sessionId: null, error: null })

    // 4 more wrong attempts should not trigger lockout (counter was cleared)
    for (let i = 0; i < 4; i++) {
      await loginWrong()
    }
    const { error } = useAuthStore.getState()
    expect(error).toMatch(/invalid username or password/i)
    expect(error).not.toMatch(/locked/i)
  })

  it('allows login after lockout duration expires', async () => {
    // Trigger lockout
    for (let i = 0; i < 5; i++) {
      await loginWrong()
    }
    expect(useAuthStore.getState().error).toMatch(/account locked/i)

    // Simulate lockout expiry by setting lockedUntil to the past
    const rec = JSON.parse(localStorage.getItem(LS_LOCKOUT_KEY)!)
    rec.lockedUntil = Date.now() - 1000
    localStorage.setItem(LS_LOCKOUT_KEY, JSON.stringify(rec))

    // Correct credentials should now work
    await loginCorrect()
    expect(useAuthStore.getState().currentUser).not.toBeNull()
    expect(useAuthStore.getState().error).toBeNull()
  })
})
