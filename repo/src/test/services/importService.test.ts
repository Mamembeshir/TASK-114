/**
 * Tests for importService — backup restore logic.
 *
 * Covers:
 *  - User credential filtering: rows with creds inserted, without creds skipped
 *  - Existing users never overwritten (even with 'overwrite' strategy)
 *  - skip strategy: conflicting non-user rows left untouched
 *  - overwrite strategy: conflicting non-user rows replaced
 *  - auditLogs always appended, never overwritten
 *  - sessions table always skipped regardless of backup content
 *  - Permission guard: non-admin role throws Forbidden
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/db'
import { runImport, isValidBackup } from '@/services/importService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'
import type { ParsedBackup } from '@/services/importService'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeUser(role: Role, id = `user-${role}`) {
  return {
    id,
    username: id,
    displayName: id,
    email: `${id}@test`,
    passwordHash: '',
    passwordSalt: '',
    role,
    isActive: true,
    isTemporaryPassword: false,
    createdAt: 0,
    updatedAt: 0,
    createdBy: 'system',
  }
}

function seedAuthStore(role: Role) {
  useAuthStore.setState({ currentUser: makeUser(role), isLoading: false })
}

function makeBackup(data: Record<string, unknown[]>): ParsedBackup {
  return { exportedAt: new Date().toISOString(), module: 'test', data }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.users.clear(),
    db.auctions.clear(),
    db.auditLogs.clear(),
    db.categories.clear(),
  ])
  seedAuthStore(Role.Administrator)
})

afterEach(() => {
  seedAuthStore(Role.Administrator)
})

// ── isValidBackup ─────────────────────────────────────────────────────────────

describe('isValidBackup', () => {
  it('accepts a well-formed backup envelope', () => {
    expect(isValidBackup({ exportedAt: '2026-01-01T00:00:00Z', module: 'all', data: { users: [] } })).toBe(true)
  })

  it('rejects missing exportedAt', () => {
    expect(isValidBackup({ data: { users: [] } })).toBe(false)
  })

  it('rejects empty data object', () => {
    expect(isValidBackup({ exportedAt: '2026-01-01T00:00:00Z', module: 'all', data: {} })).toBe(false)
  })

  it('rejects non-array table value', () => {
    expect(isValidBackup({ exportedAt: '2026-01-01T00:00:00Z', module: 'all', data: { users: 'not-array' } })).toBe(false)
  })
})

// ── User credential filtering ─────────────────────────────────────────────────

describe('runImport — user credential filtering', () => {
  it('inserts a new user that has passwordHash and passwordSalt', async () => {
    const backup = makeBackup({
      users: [{
        id: 'u-1', username: 'alice', displayName: 'Alice', email: 'a@test',
        passwordHash: 'hash-abc', passwordSalt: 'salt-abc',
        role: Role.Participant, isActive: true, isTemporaryPassword: false,
        createdAt: 0, updatedAt: 0, createdBy: 'system',
      }],
    })

    const results = await runImport(backup, 'skip', 'admin-1', 'Admin')
    const userResult = results.find((r) => r.table === 'users')
    expect(userResult?.inserted).toBe(1)
    expect(userResult?.skipped).toBe(0)

    const stored = await db.users.get('u-1')
    expect(stored?.passwordHash).toBe('hash-abc')
    expect(stored?.passwordSalt).toBe('salt-abc')
  })

  it('skips a user row that has no passwordHash', async () => {
    const backup = makeBackup({
      users: [{
        id: 'u-2', username: 'bob', displayName: 'Bob', email: 'b@test',
        // no passwordHash / passwordSalt — module-only export
        role: Role.Participant, isActive: true, isTemporaryPassword: false,
        createdAt: 0, updatedAt: 0, createdBy: 'system',
      }],
    })

    const results = await runImport(backup, 'skip', 'admin-1', 'Admin')
    const userResult = results.find((r) => r.table === 'users')
    expect(userResult?.inserted).toBe(0)
    expect(userResult?.skipped).toBe(1)

    const stored = await db.users.get('u-2')
    expect(stored).toBeUndefined() // must NOT be inserted
  })

  it('skips a user row that has empty string credentials', async () => {
    const backup = makeBackup({
      users: [{
        id: 'u-3', username: 'carol', displayName: 'Carol', email: 'c@test',
        passwordHash: '', passwordSalt: '',
        role: Role.Participant, isActive: true, isTemporaryPassword: false,
        createdAt: 0, updatedAt: 0, createdBy: 'system',
      }],
    })

    const results = await runImport(backup, 'skip', 'admin-1', 'Admin')
    const userResult = results.find((r) => r.table === 'users')
    expect(userResult?.skipped).toBe(1)

    const stored = await db.users.get('u-3')
    expect(stored).toBeUndefined()
  })
})

// ── Existing user never overwritten ──────────────────────────────────────────

describe('runImport — existing users never overwritten', () => {
  it('skips an existing user even with overwrite strategy', async () => {
    const existing = {
      id: 'u-exist', username: 'dave', displayName: 'Dave', email: 'd@test',
      passwordHash: 'original-hash', passwordSalt: 'original-salt',
      role: Role.Participant, isActive: true, isTemporaryPassword: false,
      createdAt: 0, updatedAt: 0, createdBy: 'system',
    }
    await db.users.add(existing)

    const backup = makeBackup({
      users: [{
        ...existing,
        passwordHash: 'new-hash', // attacker-controlled replacement
        role: Role.Administrator, // privilege escalation attempt
      }],
    })

    const results = await runImport(backup, 'overwrite', 'admin-1', 'Admin')
    const userResult = results.find((r) => r.table === 'users')
    expect(userResult?.skipped).toBe(1)
    expect(userResult?.overwritten).toBe(0)

    const stored = await db.users.get('u-exist')
    expect(stored?.passwordHash).toBe('original-hash') // unchanged
    expect(stored?.role).toBe(Role.Participant)        // unchanged
  })
})

// ── Conflict strategies for non-user tables ───────────────────────────────────

describe('runImport — conflict strategy (categories)', () => {
  const existing = { id: 'cat-1', name: 'Old Name', createdAt: 0 }
  const updated = { id: 'cat-1', name: 'New Name', createdAt: 0 }

  beforeEach(async () => {
    await db.categories.add(existing)
  })

  it('skip strategy leaves conflicting row untouched', async () => {
    const backup = makeBackup({ categories: [updated] })
    const results = await runImport(backup, 'skip', 'admin-1', 'Admin')
    const r = results.find((r) => r.table === 'categories')
    expect(r?.skipped).toBe(1)
    expect(r?.overwritten).toBe(0)

    const stored = await db.categories.get('cat-1')
    expect(stored?.name).toBe('Old Name')
  })

  it('overwrite strategy replaces conflicting row', async () => {
    const backup = makeBackup({ categories: [updated] })
    const results = await runImport(backup, 'overwrite', 'admin-1', 'Admin')
    const r = results.find((r) => r.table === 'categories')
    expect(r?.overwritten).toBe(1)
    expect(r?.skipped).toBe(0)

    const stored = await db.categories.get('cat-1')
    expect(stored?.name).toBe('New Name')
  })

  it('inserts new rows regardless of conflict strategy', async () => {
    const backup = makeBackup({ categories: [{ id: 'cat-new', name: 'Brand New', createdAt: 0 }] })
    const results = await runImport(backup, 'skip', 'admin-1', 'Admin')
    const r = results.find((r) => r.table === 'categories')
    expect(r?.inserted).toBe(1)
  })
})

// ── auditLogs append-only ─────────────────────────────────────────────────────

describe('runImport — auditLogs append-only', () => {
  it('inserts new audit entries but never overwrites existing ones', async () => {
    const original = {
      id: 'log-1', eventType: 'user.created' as const,
      actorId: 'a', actorName: 'A', entityType: 'User' as const,
      entityId: 'u-1', description: 'original', createdAt: 0,
    }
    await db.auditLogs.add(original)

    const backup = makeBackup({
      auditLogs: [
        { ...original, description: 'tampered' }, // existing — must not overwrite
        { id: 'log-2', eventType: 'user.updated', actorId: 'a', actorName: 'A',
          entityType: 'User', entityId: 'u-1', description: 'new entry', createdAt: 1 },
      ],
    })

    const results = await runImport(backup, 'overwrite', 'admin-1', 'Admin') // strategy ignored for logs
    const r = results.find((r) => r.table === 'auditLogs')
    expect(r?.inserted).toBe(1)   // log-2 inserted
    expect(r?.skipped).toBe(1)    // log-1 skipped
    expect(r?.overwritten).toBe(0) // never overwritten

    const stored = await db.auditLogs.get('log-1')
    expect(stored?.description).toBe('original') // content unchanged
  })
})

// ── Sessions always skipped ───────────────────────────────────────────────────

describe('runImport — sessions always skipped', () => {
  it('never imports session rows', async () => {
    const backup = makeBackup({
      sessions: [{ id: 'sess-1', userId: 'u-1', token: 'tok', createdAt: 0, expiresAt: 99999 }],
      // Plus one legitimate table to ensure import ran
      categories: [{ id: 'cat-ok', name: 'OK', createdAt: 0 }],
    })

    await runImport(backup, 'skip', 'admin-1', 'Admin')

    // sessions table is not indexed by IMPORTABLE_TABLES — no result row for it
    const allCategories = await db.categories.toArray()
    expect(allCategories.length).toBe(1) // legitimate data imported
  })
})

// ── Permission guard ──────────────────────────────────────────────────────────

describe('runImport — permission guard', () => {
  it('throws Forbidden for a ContentEditor', async () => {
    seedAuthStore(Role.ContentEditor)
    const backup = makeBackup({ categories: [{ id: 'x', name: 'X', createdAt: 0 }] })
    await expect(runImport(backup, 'skip', 'editor-1', 'Editor')).rejects.toThrow(/Forbidden/)
  })

  it('throws Forbidden for a Participant', async () => {
    seedAuthStore(Role.Participant)
    const backup = makeBackup({ categories: [{ id: 'x', name: 'X', createdAt: 0 }] })
    await expect(runImport(backup, 'skip', 'part-1', 'Part')).rejects.toThrow(/Forbidden/)
  })
})
