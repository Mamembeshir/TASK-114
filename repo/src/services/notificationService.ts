/**
 * NotificationService — in-app notifications + offline outbound queue.
 *
 * Design decisions (CLAUDE.md #11):
 *   - Outbound queue is offline-only; no real email/SMS is sent.
 *   - Queue exported as CSV/JSON for manual processing.
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import { useAuthStore } from '@/store/authStore'
import { requirePermission } from '@/utils/permissions'
import { hasPermission } from '@/auth/permissions'
import type { NotificationType, OutboundChannel, NotificationTemplate } from '@/types'
import { RETRY_DELAYS_MS } from '@/types'

// ── Auth guard for internal primitives ────────────────────────────────────────

/**
 * Ensures a valid authenticated session exists. Internal notification/queue
 * primitives call this so they cannot be invoked from unauthenticated contexts.
 */
function requireAuthenticated(): void {
  if (!useAuthStore.getState().currentUser) {
    throw new Error('Not authenticated')
  }
}

// ── In-app notifications ───────────────────────────────────────────────────────

export interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  message: string
  relatedEntityType?: string
  relatedEntityId?: string
}

async function createNotification(input: CreateNotificationInput): Promise<void> {
  requireAuthenticated()
  await db.notifications.add({
    id: generateId(),
    ...input,
    isRead: false,
    createdAt: Date.now(),
  })
}

/** Create the same notification for multiple users at once.
 *  Respects each user's inApp subscription preference — users who have opted
 *  out of inApp for this notification type will not receive it.
 */
async function createNotificationForMany(
  userIds: string[],
  fields: Omit<CreateNotificationInput, 'userId'>,
): Promise<void> {
  requireAuthenticated()
  // Filter to users who have inApp enabled for this type (default: true)
  const eligible = await Promise.all(
    userIds.map(async (userId) => {
      const pref = await getSubscription(userId, fields.type)
      return pref.inApp ? userId : null
    }),
  )
  const filtered = eligible.filter((id): id is string => id !== null)
  if (filtered.length === 0) return

  const now = Date.now()
  await db.notifications.bulkAdd(
    filtered.map((userId) => ({
      id: generateId(),
      userId,
      ...fields,
      isRead: false,
      createdAt: now,
    })),
  )
}

/**
 * Mark a notification as read.
 * Derives actor identity from the auth store; rejects cross-user operations.
 */
export async function markNotificationRead(id: string): Promise<void> {
  const actorUserId = useAuthStore.getState().currentUser?.id
  if (!actorUserId) throw new Error('Not authenticated')
  const notif = await db.notifications.get(id)
  if (!notif) return // idempotent — already deleted
  if (notif.userId !== actorUserId)
    throw new Error('Forbidden: you can only mark your own notifications as read')
  await db.notifications.update(id, { isRead: true })
}

/**
 * Mark all of a user's notifications as read.
 * Derives the caller identity from the auth store; throws if the authenticated
 * user does not own the notifications.
 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const actorUserId = useAuthStore.getState().currentUser?.id
  if (actorUserId !== userId)
    throw new Error('Forbidden: you can only mark your own notifications as read')
  await db.notifications
    .where('userId')
    .equals(userId)
    .filter((n) => !n.isRead)
    .modify({ isRead: true })
}

/**
 * Delete a notification.
 * Derives actor identity from the auth store; rejects cross-user operations.
 */
export async function deleteNotification(id: string): Promise<void> {
  const actorUserId = useAuthStore.getState().currentUser?.id
  if (!actorUserId) throw new Error('Not authenticated')
  const notif = await db.notifications.get(id)
  if (!notif) return // idempotent — already deleted
  if (notif.userId !== actorUserId)
    throw new Error('Forbidden: you can only delete your own notifications')
  await db.notifications.delete(id)
}

export async function getUnreadCount(userId: string): Promise<number> {
  const callerId = useAuthStore.getState().currentUser?.id
  if (callerId !== userId)
    throw new Error('Forbidden: you can only query your own notification count')
  return db.notifications
    .where('userId')
    .equals(userId)
    .filter((n) => !n.isRead)
    .count()
}

// ── Template rendering ────────────────────────────────────────────────────────

/**
 * Render a NotificationTemplate by substituting `{{variableName}}` placeholders
 * with the provided values.  Unmatched placeholders are left as-is so errors
 * in variable names are visible in the rendered output.
 */
export function renderTemplate(
  template: NotificationTemplate,
  variables: Record<string, string>,
): { subject: string; body: string } {
  const render = (tpl: string) =>
    tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`)
  return {
    subject: render(template.subjectTemplate),
    body: render(template.bodyTemplate),
  }
}

// ── Outbound queue ─────────────────────────────────────────────────────────────

export interface QueueOutboundInput {
  channel: OutboundChannel
  recipientUserId: string
  recipientAddress: string
  subject?: string
  /** Message body. May be omitted when templateKey + templateVariables are provided. */
  body?: string
  relatedEntityType?: string
  relatedEntityId?: string
  /**
   * Template key to use for rendering subject/body.
   * When provided the template is fetched from DB, rendered with
   * `templateVariables`, and its output overrides any `subject`/`body` fields.
   */
  templateKey?: string
  /** Variable values for template rendering (required when templateKey is set). */
  templateVariables?: Record<string, string>
  /**
   * Optional epoch-ms delivery timestamp.
   * If set and in the future, the item is created with `status: 'Scheduled'`
   * and held until `processScheduledQueue()` releases it.
   */
  scheduledAt?: number
}

async function queueOutboundMessage(input: QueueOutboundInput): Promise<void> {
  requireAuthenticated()
  let subject = input.subject
  let body = input.body ?? ''

  // Render template when a key is provided
  if (input.templateKey) {
    const template = await db.notificationTemplates
      .where('key')
      .equals(input.templateKey)
      .filter((t) => t.isActive)
      .first()
    if (template) {
      const rendered = renderTemplate(template, input.templateVariables ?? {})
      subject = rendered.subject
      body = rendered.body
    }
  }

  const now = Date.now()
  const isScheduled = input.scheduledAt !== undefined && input.scheduledAt > now

  await db.outboundQueue.add({
    id: generateId(),
    channel: input.channel,
    recipientUserId: input.recipientUserId,
    recipientAddress: input.recipientAddress,
    subject,
    body,
    templateKey: input.templateKey,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId,
    status: isScheduled ? 'Scheduled' : 'Queued',
    scheduledAt: input.scheduledAt,
    attemptCount: 0,
    queuedAt: now,
  })
}

export async function markOutboundSent(id: string): Promise<void> {
  requirePermission('manageMessages')
  await db.outboundQueue.update(id, { status: 'Sent', sentAt: Date.now() })
}

/**
 * Mark an attempt as failed.  If retries remain, schedules the next attempt
 * at the configured delay (1 / 5 / 15 min).  On the 3rd failure transitions
 * to permanent `Failed`.
 */
export async function markOutboundFailed(id: string): Promise<void> {
  requirePermission('manageMessages')
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

/** Manually re-queue a Failed or Scheduled item, resetting its attempt counter. */
export async function requeueOutbound(id: string): Promise<void> {
  requirePermission('manageMessages')
  await db.outboundQueue.update(id, {
    status: 'Queued',
    attemptCount: 0,
    scheduledAt: undefined,
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

/**
 * Scheduled-delivery worker — promotes `Scheduled` items to `Queued` once
 * their `scheduledAt` timestamp has passed.
 * Called by the outbound retry timer every minute.
 */
export async function processScheduledQueue(): Promise<void> {
  const now = Date.now()
  await db.outboundQueue
    .where('status')
    .equals('Scheduled')
    .filter((item) => (item.scheduledAt ?? 0) <= now)
    .modify({ status: 'Queued', scheduledAt: undefined })
}

let retryTimerId: ReturnType<typeof setInterval> | null = null

/** Start the retry + scheduled-delivery workers (idempotent — only one timer runs at a time). */
export function startOutboundRetryTimer(): void {
  if (retryTimerId !== null) return
  retryTimerId = setInterval(() => {
    void processRetryQueue()
    void processScheduledQueue()
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
  requirePermission('manageMessages')
  await db.outboundQueue.delete(id)
}

export async function bulkMarkOutboundSent(ids: string[]): Promise<void> {
  requirePermission('manageMessages')
  const now = Date.now()
  await db.outboundQueue.where('id').anyOf(ids).modify({ status: 'Sent', sentAt: now })
}

export async function bulkDeleteOutbound(ids: string[]): Promise<void> {
  requirePermission('manageMessages')
  await db.outboundQueue.where('id').anyOf(ids).delete()
}

/**
 * Compose and enqueue an outbound message from a user-initiated action
 * (e.g., the Outbound Queue compose form).
 * Requires the 'sendMessage' permission — use this instead of calling
 * `queueOutboundMessage` directly from UI code.
 */
export async function composeOutboundMessage(input: QueueOutboundInput): Promise<void> {
  requirePermission('sendMessage')
  await queueOutboundMessage(input)
}

// ── Subscription preferences ──────────────────────────────────────────────────

export interface SubscriptionUpdate {
  inApp?: boolean
  email?: boolean
  sms?: boolean
  officialAccount?: boolean
}

/** Get a user's subscription preference for a given notification type (internal — no auth check). */
async function getSubscription(
  userId: string,
  notificationType: string,
): Promise<{ inApp: boolean; email: boolean; sms: boolean; officialAccount: boolean }> {
  const pref = await db.notificationSubscriptions
    .where('userId')
    .equals(userId)
    .filter((s) => s.notificationType === notificationType)
    .first()
  return pref ?? { inApp: true, email: false, sms: false, officialAccount: false }
}

/**
 * Public API to read a user's subscription preference.
 * Enforces actor identity: callers may only read their own preferences
 * unless they hold the `manageMessages` permission.
 */
export async function getOwnSubscription(
  userId: string,
  notificationType: string,
): Promise<{ inApp: boolean; email: boolean; sms: boolean; officialAccount: boolean }> {
  const currentUser = useAuthStore.getState().currentUser
  if (!currentUser) throw new Error('Forbidden: not authenticated')
  if (currentUser.id !== userId && !hasPermission(currentUser.role, 'manageMessages'))
    throw new Error('Forbidden: you can only read your own subscription preferences')
  return getSubscription(userId, notificationType)
}

/** Upsert a user's subscription preference for a notification type. */
export async function setSubscription(
  userId: string,
  notificationType: string,
  update: SubscriptionUpdate,
): Promise<void> {
  const currentUser = useAuthStore.getState().currentUser
  if (!currentUser) throw new Error('Forbidden: not authenticated')
  if (currentUser.id !== userId && !hasPermission(currentUser.role, 'manageMessages'))
    throw new Error('Forbidden: you can only update your own notification preferences')
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
      officialAccount: update.officialAccount ?? false,
      updatedAt: Date.now(),
    })
  }
}

// ── Read receipts ──────────────────────────────────────────────────────────────

/**
 * Record that the current user has read a specific notification (idempotent).
 * Derives actor identity from the auth store; rejects cross-user operations.
 */
export async function recordReadReceipt(notificationId: string): Promise<void> {
  const userId = useAuthStore.getState().currentUser?.id
  if (!userId) throw new Error('Not authenticated')
  const notif = await db.notifications.get(notificationId)
  if (notif && notif.userId !== userId)
    throw new Error('Forbidden: you can only record a read receipt for your own notifications')

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
  // Also mark the in-app notification as read — ownership already verified above
  await markNotificationRead(notificationId)
}

/**
 * Get the list of user IDs who have read a notification (for sent confirmations).
 * Only the notification owner or users with `manageMessages` may view read receipts.
 */
export async function getReadReceipts(notificationId: string): Promise<string[]> {
  const currentUser = useAuthStore.getState().currentUser
  if (!currentUser) throw new Error('Forbidden: not authenticated')
  const notif = await db.notifications.get(notificationId)
  if (notif && notif.userId !== currentUser.id && !hasPermission(currentUser.role, 'manageMessages'))
    throw new Error('Forbidden: you can only view read receipts for your own notifications')
  const receipts = await db.messageReadReceipts
    .where('notificationId')
    .equals(notificationId)
    .toArray()
  return receipts.map((r) => r.userId)
}

// ── Convenience helpers (called from other services) ──────────────────────────

/**
 * Maps OutboundChannel values to their corresponding NotificationSubscription field names.
 * An explicit map avoids the fragile `.toLowerCase()` approach which would break for
 * multi-word channel names like 'OfficialAccount' → 'officialaccount' (wrong).
 */
const CHANNEL_PREF_KEY: Record<OutboundChannel, 'email' | 'sms' | 'officialAccount'> = {
  Email: 'email',
  SMS: 'sms',
  OfficialAccount: 'officialAccount',
} as const

/**
 * Notify a user and optionally enqueue an outbound message.
 * Both in-app delivery and each outbound channel are gated on the user's
 * subscription preferences for the given notification type.
 * Defaults (when no preference row exists): inApp=true, email=false, sms=false,
 * officialAccount=false.
 */
export async function notify(
  input: CreateNotificationInput,
  outbound?: {
    channel: OutboundChannel
    address: string
    subject?: string
    body: string
  },
): Promise<void> {
  const pref = await getSubscription(input.userId, input.type)

  if (pref.inApp) {
    await createNotification(input)
  }

  if (outbound) {
    const prefKey = CHANNEL_PREF_KEY[outbound.channel]
    const wantsOutbound = pref[prefKey] === true
    if (wantsOutbound) {
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
}

/**
 * Notify multiple users at once (in-app only).
 * Respects each user's inApp subscription preference.
 * This is the public batch API — internal `createNotificationForMany` is not exported.
 */
export async function notifyMany(
  userIds: string[],
  fields: Omit<CreateNotificationInput, 'userId'>,
): Promise<void> {
  requireAuthenticated()
  await createNotificationForMany(userIds, fields)
}
