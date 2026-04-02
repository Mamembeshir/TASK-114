/**
 * NotificationService — in-app notifications + offline outbound queue.
 *
 * Design decisions (CLAUDE.md #11):
 *   - Outbound queue is offline-only; no real email/SMS is sent.
 *   - Queue exported as CSV/JSON for manual processing.
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import type { NotificationType, OutboundChannel } from '@/types'

// ── In-app notifications ───────────────────────────────────────────────────────

export interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  message: string
  relatedEntityType?: string
  relatedEntityId?: string
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await db.notifications.add({
    id: generateId(),
    ...input,
    isRead: false,
    createdAt: Date.now(),
  })
}

/** Create the same notification for multiple users at once. */
export async function createNotificationForMany(
  userIds: string[],
  fields: Omit<CreateNotificationInput, 'userId'>,
): Promise<void> {
  const now = Date.now()
  await db.notifications.bulkAdd(
    userIds.map((userId) => ({
      id: generateId(),
      userId,
      ...fields,
      isRead: false,
      createdAt: now,
    })),
  )
}

export async function markNotificationRead(id: string): Promise<void> {
  await db.notifications.update(id, { isRead: true })
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db.notifications
    .where('userId')
    .equals(userId)
    .filter((n) => !n.isRead)
    .modify({ isRead: true })
}

export async function deleteNotification(id: string): Promise<void> {
  await db.notifications.delete(id)
}

export async function getUnreadCount(userId: string): Promise<number> {
  return db.notifications
    .where('userId')
    .equals(userId)
    .filter((n) => !n.isRead)
    .count()
}

// ── Outbound queue ─────────────────────────────────────────────────────────────

export interface QueueOutboundInput {
  channel: OutboundChannel
  recipientUserId: string
  recipientAddress: string
  subject?: string
  body: string
  relatedEntityType?: string
  relatedEntityId?: string
}

export async function queueOutboundMessage(input: QueueOutboundInput): Promise<void> {
  await db.outboundQueue.add({
    id: generateId(),
    ...input,
    status: 'Queued',
    queuedAt: Date.now(),
  })
}

export async function markOutboundSent(id: string): Promise<void> {
  await db.outboundQueue.update(id, { status: 'Sent', sentAt: Date.now() })
}

export async function markOutboundFailed(id: string): Promise<void> {
  await db.outboundQueue.update(id, { status: 'Failed' })
}

export async function requeueOutbound(id: string): Promise<void> {
  await db.outboundQueue.update(id, { status: 'Queued', sentAt: undefined })
}

export async function deleteOutboundItem(id: string): Promise<void> {
  await db.outboundQueue.delete(id)
}

export async function bulkMarkOutboundSent(ids: string[]): Promise<void> {
  const now = Date.now()
  await db.outboundQueue.where('id').anyOf(ids).modify({ status: 'Sent', sentAt: now })
}

export async function bulkDeleteOutbound(ids: string[]): Promise<void> {
  await db.outboundQueue.where('id').anyOf(ids).delete()
}

// ── Convenience helpers (called from other services) ──────────────────────────

/** Notify a user and optionally enqueue an outbound message. */
export async function notify(
  input: CreateNotificationInput,
  outbound?: {
    channel: OutboundChannel
    address: string
    subject?: string
    body: string
  },
): Promise<void> {
  await createNotification(input)
  if (outbound) {
    await queueOutboundMessage({
      channel: outbound.channel,
      recipientUserId: input.userId,
      recipientAddress: outbound.address,
      subject: outbound.subject,
      body: outbound.body,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
    })
  }
}
