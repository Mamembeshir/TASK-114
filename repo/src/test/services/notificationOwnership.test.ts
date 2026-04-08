/**
 * Notification ownership tests.
 *
 * Verifies that markNotificationRead, deleteNotification, and recordReadReceipt
 * all derive actor identity from useAuthStore and reject cross-user operations.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { useAuthStore } from '@/store/authStore'
import {
  notify,
  markNotificationRead,
  deleteNotification,
  recordReadReceipt,
} from '@/services/notificationService'
import { Role } from '@/types'
import type { User } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(id: string): User {
  return {
    id,
    username: id,
    displayName: id,
    role: Role.ContentEditor,
    email: `${id}@test`,
    passwordHash: '',
    passwordSalt: '',
    isActive: true,
    isTemporaryPassword: false,
    createdAt: 0,
    updatedAt: 0,
    createdBy: 'system',
  }
}

function setAuth(userId: string) {
  useAuthStore.setState({ currentUser: makeUser(userId), isLoading: false })
}

async function seedNotification(userId: string): Promise<string> {
  // Ensure auth context exists for the guarded notify call
  setAuth(userId)
  await notify({
    userId,
    type: 'PublicationPublished',
    title: 'Test',
    message: 'Test notification',
  })
  const notif = await db.notifications.where('userId').equals(userId).first()
  if (!notif) throw new Error('Notification not seeded')
  return notif.id
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.notifications.clear(),
    db.messageReadReceipts.clear(),
  ])
})

// ── markNotificationRead ─────────────────────────────────────────────────────

describe('markNotificationRead — ownership guard', () => {
  it('allows the notification owner to mark it read', async () => {
    const id = await seedNotification('alice')
    setAuth('alice')
    await expect(markNotificationRead(id)).resolves.toBeUndefined()
    const updated = await db.notifications.get(id)
    expect(updated?.isRead).toBe(true)
  })

  it('throws Forbidden when a different user tries to mark it read', async () => {
    const id = await seedNotification('alice')
    setAuth('bob')
    await expect(markNotificationRead(id)).rejects.toThrow(/Forbidden/)
    // Notification remains unread
    const unchanged = await db.notifications.get(id)
    expect(unchanged?.isRead).toBe(false)
  })

  it('is idempotent when the notification has already been deleted', async () => {
    setAuth('alice')
    await expect(markNotificationRead('nonexistent-id')).resolves.toBeUndefined()
  })
})

// ── deleteNotification ───────────────────────────────────────────────────────

describe('deleteNotification — ownership guard', () => {
  it('allows the notification owner to delete their notification', async () => {
    const id = await seedNotification('alice')
    setAuth('alice')
    await expect(deleteNotification(id)).resolves.toBeUndefined()
    expect(await db.notifications.get(id)).toBeUndefined()
  })

  it('throws Forbidden when a different user tries to delete', async () => {
    const id = await seedNotification('alice')
    setAuth('carol')
    await expect(deleteNotification(id)).rejects.toThrow(/Forbidden/)
    // Notification still exists
    expect(await db.notifications.get(id)).toBeDefined()
  })

  it('is idempotent when the notification has already been deleted', async () => {
    setAuth('alice')
    await expect(deleteNotification('nonexistent-id')).resolves.toBeUndefined()
  })
})

// ── recordReadReceipt ────────────────────────────────────────────────────────

describe('recordReadReceipt — ownership guard', () => {
  it('allows the notification owner to record a read receipt', async () => {
    const id = await seedNotification('alice')
    setAuth('alice')
    await expect(recordReadReceipt(id)).resolves.toBeUndefined()

    const receipt = await db.messageReadReceipts
      .where('notificationId')
      .equals(id)
      .filter((r) => r.userId === 'alice')
      .first()
    expect(receipt).toBeDefined()

    const notif = await db.notifications.get(id)
    expect(notif?.isRead).toBe(true)
  })

  it('throws Forbidden when a different user tries to record a read receipt', async () => {
    const id = await seedNotification('alice')
    setAuth('eve')
    await expect(recordReadReceipt(id)).rejects.toThrow(/Forbidden/)

    // No receipt written
    const receipt = await db.messageReadReceipts
      .where('notificationId')
      .equals(id)
      .filter((r) => r.userId === 'eve')
      .first()
    expect(receipt).toBeUndefined()

    // Notification still unread
    const notif = await db.notifications.get(id)
    expect(notif?.isRead).toBe(false)
  })

  it('is idempotent — a second receipt call for the same user does not duplicate', async () => {
    const id = await seedNotification('alice')
    setAuth('alice')
    await recordReadReceipt(id)
    await recordReadReceipt(id)

    const receipts = await db.messageReadReceipts
      .where('notificationId')
      .equals(id)
      .filter((r) => r.userId === 'alice')
      .toArray()
    expect(receipts).toHaveLength(1)
  })
})
