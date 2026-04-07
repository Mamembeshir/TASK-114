/**
 * Notification ownership tests.
 *
 * Verifies that markNotificationRead, deleteNotification, and recordReadReceipt
 * all reject cross-user operations (object-level authorization).
 *
 * Evidence: src/services/notificationService.ts:64, :76, :249, :264
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  createNotification,
  markNotificationRead,
  deleteNotification,
  recordReadReceipt,
} from '@/services/notificationService'

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.notifications.clear(),
    db.messageReadReceipts.clear(),
  ])
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedNotification(userId: string): Promise<string> {
  await createNotification({
    userId,
    type: 'PublicationPublished',
    title: 'Test',
    message: 'Test notification',
  })
  const notif = await db.notifications.where('userId').equals(userId).first()
  if (!notif) throw new Error('Notification not seeded')
  return notif.id
}

// ── markNotificationRead ──────────────────────────────────────────────────────

describe('markNotificationRead — ownership guard', () => {
  it('allows the notification owner to mark it read', async () => {
    const id = await seedNotification('alice')
    await expect(markNotificationRead(id, 'alice')).resolves.toBeUndefined()
    const updated = await db.notifications.get(id)
    expect(updated?.isRead).toBe(true)
  })

  it('throws Forbidden when a different user tries to mark it read', async () => {
    const id = await seedNotification('alice')
    await expect(markNotificationRead(id, 'bob')).rejects.toThrow(/Forbidden/)
    // Notification remains unread
    const unchanged = await db.notifications.get(id)
    expect(unchanged?.isRead).toBe(false)
  })

  it('is idempotent when the notification has already been deleted', async () => {
    await expect(markNotificationRead('nonexistent-id', 'alice')).resolves.toBeUndefined()
  })
})

// ── deleteNotification ────────────────────────────────────────────────────────

describe('deleteNotification — ownership guard', () => {
  it('allows the notification owner to delete their notification', async () => {
    const id = await seedNotification('alice')
    await expect(deleteNotification(id, 'alice')).resolves.toBeUndefined()
    expect(await db.notifications.get(id)).toBeUndefined()
  })

  it('throws Forbidden when a different user tries to delete', async () => {
    const id = await seedNotification('alice')
    await expect(deleteNotification(id, 'carol')).rejects.toThrow(/Forbidden/)
    // Notification still exists
    expect(await db.notifications.get(id)).toBeDefined()
  })

  it('is idempotent when the notification has already been deleted', async () => {
    await expect(deleteNotification('nonexistent-id', 'alice')).resolves.toBeUndefined()
  })
})

// ── recordReadReceipt ─────────────────────────────────────────────────────────

describe('recordReadReceipt — ownership guard', () => {
  it('allows the notification owner to record a read receipt', async () => {
    const id = await seedNotification('alice')
    await expect(recordReadReceipt(id, 'alice')).resolves.toBeUndefined()

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
    await expect(recordReadReceipt(id, 'eve')).rejects.toThrow(/Forbidden/)

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
    await recordReadReceipt(id, 'alice')
    await recordReadReceipt(id, 'alice')

    const receipts = await db.messageReadReceipts
      .where('notificationId')
      .equals(id)
      .filter((r) => r.userId === 'alice')
      .toArray()
    expect(receipts).toHaveLength(1)
  })
})
