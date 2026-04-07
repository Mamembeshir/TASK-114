/**
 * Authorization gap tests — covers three Partial Pass findings:
 *
 * 1. Object-level authorization: markAllNotificationsRead requires actorUserId === userId
 * 2. Function-level authorization: adminConfigService enforces requirePermission('manageSystem')
 *    for addSensitiveWord, deleteSensitiveWord, and saveSystemConfig
 * 3. Tenant/user data isolation: notificationStore.refresh rejects cross-user queries
 *
 * Evidence:
 *   src/services/notificationService.ts (markAllNotificationsRead)
 *   src/services/adminConfigService.ts  (addSensitiveWord, deleteSensitiveWord, saveSystemConfig)
 *   src/store/notificationStore.ts      (refresh identity binding)
 *   src/utils/permissions.ts            (requirePermission)
 *   src/auth/permissions.ts             (manageSystem — Administrator only)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { markAllNotificationsRead } from '@/services/notificationService'
import {
  addSensitiveWord,
  deleteSensitiveWord,
  saveSystemConfig,
  type EditableSystemConfig,
} from '@/services/adminConfigService'
import { useNotificationStore } from '@/store/notificationStore'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'

// ── Role helpers ───────────────────────────────────────────────────────────────

function setRole(role: Role, id = `user-${role}`) {
  useAuthStore.setState({
    currentUser: {
      id,
      username: role.toLowerCase(),
      displayName: role,
      role,
      isActive: true,
      createdAt: Date.now(),
    },
  } as Parameters<typeof useAuthStore.setState>[0])
}

function clearAuth() {
  useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
}

const BASE_CONFIG: EditableSystemConfig = {
  orgName: 'Test Org',
  documentNumberPrefix: 'TST',
  defaultRetentionYears: 7,
  antiSnipingWindowSeconds: 30,
  antiSnipingExtensionMinutes: 2,
  defaultMinimumIncrement: 10,
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.notifications.clear(),
    db.sensitiveWords.clear(),
    db.systemConfig.clear(),
    db.auditLogs.clear(),
  ])
  setRole(Role.Administrator)
})

// ── 1. markAllNotificationsRead — ownership enforcement ────────────────────────

describe('markAllNotificationsRead — object-level authorization', () => {
  it('succeeds when authenticated user === userId', async () => {
    // Identity now derived from auth store — set it to alice before calling.
    useAuthStore.setState({
      currentUser: {
        id: 'alice',
        username: 'alice',
        displayName: 'Alice',
        role: Role.Participant,
        isActive: true,
        createdAt: Date.now(),
      },
    } as Parameters<typeof useAuthStore.setState>[0])

    await db.notifications.add({
      id: 'n1',
      userId: 'alice',
      type: 'System',
      title: 'Hello',
      message: 'Hi',
      isRead: false,
      createdAt: Date.now(),
    })

    await expect(markAllNotificationsRead('alice')).resolves.toBeUndefined()

    const updated = await db.notifications.get('n1')
    expect(updated?.isRead).toBe(true)
  })

  it('throws Forbidden when authenticated user !== userId', async () => {
    // beforeEach sets auth store to user-Administrator; 'alice' !== 'user-Administrator' → Forbidden
    await expect(markAllNotificationsRead('alice')).rejects.toThrow(/Forbidden/)
  })

  it('does not mutate any notification when ownership check fails', async () => {
    await db.notifications.add({
      id: 'n2',
      userId: 'alice',
      type: 'System',
      title: 'Hello',
      message: 'Hi',
      isRead: false,
      createdAt: Date.now(),
    })

    // Auth store is user-Administrator; 'alice' !== 'user-Administrator' → throws
    await expect(markAllNotificationsRead('alice')).rejects.toThrow()

    const unchanged = await db.notifications.get('n2')
    expect(unchanged?.isRead).toBe(false)
  })
})

// ── 2. adminConfigService — function-level authorization ──────────────────────

describe('addSensitiveWord — function-level authorization', () => {
  it('succeeds for Administrator (has manageSystem)', async () => {
    setRole(Role.Administrator)
    const result = await addSensitiveWord('badword')
    expect(result).toBe(true)
    const stored = await db.sensitiveWords.where('word').equals('badword').first()
    expect(stored).toBeDefined()
  })

  it('throws Forbidden for ContentEditor (lacks manageSystem)', async () => {
    setRole(Role.ContentEditor)
    await expect(
      addSensitiveWord('test'),
    ).rejects.toThrow(/Forbidden/)
  })

  it('throws Forbidden for ReviewerApprover (lacks manageSystem)', async () => {
    setRole(Role.ReviewerApprover)
    await expect(
      addSensitiveWord('test'),
    ).rejects.toThrow(/Forbidden/)
  })

  it('throws Forbidden for Participant (lacks manageSystem)', async () => {
    setRole(Role.Participant)
    await expect(
      addSensitiveWord('test'),
    ).rejects.toThrow(/Forbidden/)
  })

  it('returns false (idempotent) when word already exists', async () => {
    setRole(Role.Administrator)
    await addSensitiveWord('duplicate')
    const second = await addSensitiveWord('duplicate')
    expect(second).toBe(false)
  })

  it('normalises to lowercase before storing', async () => {
    setRole(Role.Administrator)
    await addSensitiveWord('UPPER')
    const stored = await db.sensitiveWords.where('word').equals('upper').first()
    expect(stored).toBeDefined()
  })
})

describe('deleteSensitiveWord — function-level authorization', () => {
  it('succeeds for Administrator', async () => {
    setRole(Role.Administrator)
    const added = await addSensitiveWord('todelete')
    expect(added).toBe(true)
    const sw = await db.sensitiveWords.where('word').equals('todelete').first()

    await expect(
      deleteSensitiveWord(sw!.id, sw!.word),
    ).resolves.toBeUndefined()

    const gone = await db.sensitiveWords.get(sw!.id)
    expect(gone).toBeUndefined()
  })

  it('throws Forbidden for ContentEditor', async () => {
    setRole(Role.ContentEditor)
    await expect(
      deleteSensitiveWord('fake-id', 'word'),
    ).rejects.toThrow(/Forbidden/)
  })
})

describe('saveSystemConfig — function-level authorization', () => {
  it('succeeds for Administrator (has manageSystem)', async () => {
    setRole(Role.Administrator)
    await expect(
      saveSystemConfig(BASE_CONFIG),
    ).resolves.toBeUndefined()

    const stored = await db.systemConfig.get('singleton')
    expect(stored?.orgName).toBe('Test Org')
    expect(stored?.documentNumberPrefix).toBe('TST')
  })

  it('throws Forbidden for ContentEditor (lacks manageSystem)', async () => {
    setRole(Role.ContentEditor)
    await expect(
      saveSystemConfig(BASE_CONFIG),
    ).rejects.toThrow(/Forbidden/)
  })

  it('throws Forbidden for ReviewerApprover (lacks manageSystem)', async () => {
    setRole(Role.ReviewerApprover)
    await expect(
      saveSystemConfig(BASE_CONFIG),
    ).rejects.toThrow(/Forbidden/)
  })

  it('normalises documentNumberPrefix to uppercase', async () => {
    setRole(Role.Administrator)
    await saveSystemConfig({ ...BASE_CONFIG, documentNumberPrefix: 'abc' })
    const stored = await db.systemConfig.get('singleton')
    expect(stored?.documentNumberPrefix).toBe('ABC')
  })

  it('creates the singleton row when it does not exist', async () => {
    setRole(Role.Administrator)
    const before = await db.systemConfig.get('singleton')
    expect(before).toBeUndefined()

    await saveSystemConfig(BASE_CONFIG)

    const after = await db.systemConfig.get('singleton')
    expect(after?.id).toBe('singleton')
    expect(after?.documentNumberCounter).toBe(0) // counter preserved
  })

  it('updates the existing singleton row without overwriting counter', async () => {
    setRole(Role.Administrator)
    await db.systemConfig.add({
      id: 'singleton',
      ...BASE_CONFIG,
      documentNumberCounter: 42,
      updatedAt: 0,
      updatedBy: 'system',
    })

    await saveSystemConfig({ ...BASE_CONFIG, orgName: 'Updated Org' })

    const updated = await db.systemConfig.get('singleton')
    expect(updated?.orgName).toBe('Updated Org')
    expect(updated?.documentNumberCounter).toBe(42) // not reset
  })
})

// ── 3. notificationStore.refresh — tenant isolation ───────────────────────────

describe('notificationStore.refresh — tenant isolation', () => {
  beforeEach(async () => {
    await db.notifications.bulkAdd([
      {
        id: 'alice-n1',
        userId: 'alice',
        type: 'System',
        title: 'Alice notif',
        message: 'Hi Alice',
        isRead: false,
        createdAt: 1,
      },
      {
        id: 'bob-n1',
        userId: 'bob',
        type: 'System',
        title: 'Bob notif',
        message: 'Hi Bob',
        isRead: false,
        createdAt: 2,
      },
    ])
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
    })
  })

  it('loads notifications for the currently-authenticated user', async () => {
    useAuthStore.setState({
      currentUser: {
        id: 'alice',
        username: 'alice',
        displayName: 'Alice',
        role: Role.Participant,
        isActive: true,
        createdAt: Date.now(),
      },
    } as Parameters<typeof useAuthStore.setState>[0])

    await useNotificationStore.getState().refresh('alice')

    const state = useNotificationStore.getState()
    expect(state.notifications.map((n) => n.id)).toEqual(['alice-n1'])
    expect(state.unreadCount).toBe(1)
  })

  it('returns empty when userId does not match the authenticated user (cross-user isolation)', async () => {
    // Authenticated as Alice, but caller passes Bob's userId
    useAuthStore.setState({
      currentUser: {
        id: 'alice',
        username: 'alice',
        displayName: 'Alice',
        role: Role.Participant,
        isActive: true,
        createdAt: Date.now(),
      },
    } as Parameters<typeof useAuthStore.setState>[0])

    await useNotificationStore.getState().refresh('bob')

    const state = useNotificationStore.getState()
    expect(state.notifications).toHaveLength(0)
    expect(state.unreadCount).toBe(0)
  })

  it('returns empty when no user is authenticated', async () => {
    clearAuth()

    await useNotificationStore.getState().refresh('alice')

    const state = useNotificationStore.getState()
    expect(state.notifications).toHaveLength(0)
  })
})
