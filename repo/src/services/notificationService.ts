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
import { RETRY_DELAYS_MS } from '@/types'

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
    attemptCount: 0,
    queuedAt: Date.now(),
  })
}

export async function markOutboundSent(id: string): Promise<void> {
  await db.outboundQueue.update(id, { status: 'Sent', sentAt: Date.now() })
}

/**
 * Mark an attempt as failed.  If retries remain, schedules the next attempt
 * at the configured delay (1 / 5 / 15 min).  On the 3rd failure transitions
 * to permanent `Failed`.
 */
export async function markOutboundFailed(id: string): Promise<void> {
  const item = await db.outboundQueue.get(id)
  if (!item) return
  const attempts = item.attemptCount + 1
  const now = Date.now()
  // Use attempts - 1 as index; beyond the retry schedule means terminal failure
  if (attempts <= RETRY_DELAYS_MS.length) {
    const nextDelay = RETRY_DELAYS_MS[attempts - 1]
    await db.outboundQueue.update(id, {
      status: 'Retrying',
      attemptCount: attempts,
      nextRetryAt: now + nextDelay,
      lastFailedAt: now,
    })
  } else {
    await db.outboundQueue.update(id, {
      status: 'Failed',
      attemptCount: attempts,
      lastFailedAt: now,
    })
  }
}

/** Manually re-queue a Failed item, resetting its attempt counter. */
export async function requeueOutbound(id: string): Promise<void> {
  await db.outboundQueue.update(id, {
    status: 'Queued',
    attemptCount: 0,
    sentAt: undefined,
    nextRetryAt: undefined,
    lastFailedAt: undefined,
  })
}

/**
 * Retry worker — moves Retrying items whose `nextRetryAt` has passed back to
 * Queued so the export/manual-process flow picks them up.
 *
 * Call `startOutboundRetryTimer()` once on app boot to run this every minute.
 */
export async function processRetryQueue(): Promise<void> {
  const now = Date.now()
  await db.outboundQueue
    .where('status')
    .equals('Retrying')
    .filter((item) => (item.nextRetryAt ?? 0) <= now)
    .modify({ status: 'Queued', nextRetryAt: undefined })
}

let retryTimerId: ReturnType<typeof setInterval> | null = null

/** Start the retry worker (idempotent — only one timer runs at a time). */
export function startOutboundRetryTimer(): void {
  if (retryTimerId !== null) return
  retryTimerId = setInterval(() => {
    void processRetryQueue()
  }, 60_000)
}

/** Stop the retry worker (used in tests / cleanup). */
export function stopOutboundRetryTimer(): void {
  if (retryTimerId !== null) {
    clearInterval(retryTimerId)
    retryTimerId = null
  }
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

// ── Subscription preferences ──────────────────────────────────────────────────

export interface SubscriptionUpdate {
  inApp?: boolean
  email?: boolean
  sms?: boolean
}

/** Get a user's subscription preference for a given notification type. */
export async function getSubscription(
  userId: string,
  notificationType: string,
): Promise<{ inApp: boolean; email: boolean; sms: boolean }> {
  const pref = await db.notificationSubscriptions
    .where('userId')
    .equals(userId)
    .filter((s) => s.notificationType === notificationType)
    .first()
  return pref ?? { inApp: true, email: false, sms: false }
}

/** Upsert a user's subscription preference for a notification type. */
export async function setSubscription(
  userId: string,
  notificationType: string,
  update: SubscriptionUpdate,
): Promise<void> {
  const existing = await db.notificationSubscriptions
    .where('userId')
    .equals(userId)
    .filter((s) => s.notificationType === notificationType)
    .first()
  if (existing) {
    await db.notificationSubscriptions.update(existing.id, { ...update, updatedAt: Date.now() })
  } else {
    await db.notificationSubscriptions.add({
      id: generateId(),
      userId,
      notificationType,
      inApp: update.inApp ?? true,
      email: update.email ?? false,
      sms: update.sms ?? false,
      updatedAt: Date.now(),
    })
  }
}

// ── Read receipts ──────────────────────────────────────────────────────────────

/** Record that a user has read a specific notification (idempotent). */
export async function recordReadReceipt(notificationId: string, userId: string): Promise<void> {
  const existing = await db.messageReadReceipts
    .where('notificationId')
    .equals(notificationId)
    .filter((r) => r.userId === userId)
    .first()
  if (!existing) {
    await db.messageReadReceipts.add({
      id: generateId(),
      notificationId,
      userId,
      readAt: Date.now(),
    })
  }
  // Also mark the in-app notification as read
  await markNotificationRead(notificationId)
}

/** Get the list of user IDs who have read a notification (for sent confirmations). */
export async function getReadReceipts(notificationId: string): Promise<string[]> {
  const receipts = await db.messageReadReceipts
    .where('notificationId')
    .equals(notificationId)
    .toArray()
  return receipts.map((r) => r.userId)
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
