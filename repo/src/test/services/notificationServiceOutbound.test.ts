/**
 * Tests for NotificationService — outbound queue, subscriptions,
 * read receipts, and helper utilities.
 *
 * Covers: markOutboundSent, markOutboundFailed, requeueOutbound,
 *         deleteOutboundItem, bulkMarkOutboundSent, bulkDeleteOutbound,
 *         composeOutboundMessage, processRetryQueue, processScheduledQueue,
 *         getUnreadCount, getOwnSubscription, setSubscription,
 *         getReadReceipts, notifyMany
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  markOutboundSent,
  markOutboundFailed,
  requeueOutbound,
  deleteOutboundItem,
  bulkMarkOutboundSent,
  bulkDeleteOutbound,
  composeOutboundMessage,
  processRetryQueue,
  processScheduledQueue,
  getUnreadCount,
  getOwnSubscription,
  setSubscription,
  getReadReceipts,
  notifyMany,
  notify,
} from '@/services/notificationService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'
import type { OutboundQueueItem } from '@/types'
import { RETRY_DELAYS_MS } from '@/types'

// ── Auth helpers ──────────────────────────────────────────────────────────────

function setUser(id: string, role: Role) {
  useAuthStore.setState({
    currentUser: {
      id,
      username: id,
      displayName: id,
      role,
      isActive: true,
      createdAt: Date.now(),
    },
  } as Parameters<typeof useAuthStore.setState>[0])
}

const setAdmin       = (id = 'admin-1')  => setUser(id, Role.Administrator)
const setEditor      = (id = 'editor-1') => setUser(id, Role.ContentEditor)
const setParticipant = (id = 'user-1')   => setUser(id, Role.Participant)

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.notifications.clear(),
    db.outboundQueue.clear(),
    db.notificationSubscriptions.clear(),
    db.messageReadReceipts.clear(),
    db.notificationTemplates.clear(),
  ])
  setAdmin()
})

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedOutbound(overrides: Partial<OutboundQueueItem> = {}): Promise<OutboundQueueItem> {
  const item: OutboundQueueItem = {
    id: `oq-${Date.now()}-${Math.random()}`,
    channel: 'Email',
    recipientUserId: 'user-1',
    recipientAddress: 'user@example.com',
    subject: 'Test Subject',
    body: 'Test Body',
    status: 'Queued',
    attemptCount: 0,
    queuedAt: Date.now(),
    ...overrides,
  }
  await db.outboundQueue.add(item)
  return item
}

// ── markOutboundSent ──────────────────────────────────────────────────────────

describe('markOutboundSent', () => {
  it('sets status to Sent for Administrator', async () => {
    const item = await seedOutbound()
    setAdmin()
    await markOutboundSent(item.id)
    const updated = await db.outboundQueue.get(item.id)
    expect(updated?.status).toBe('Sent')
    expect(updated?.sentAt).toBeDefined()
  })

  it('throws Forbidden for ContentEditor (lacks manageMessages)', async () => {
    const item = await seedOutbound()
    setEditor()
    await expect(markOutboundSent(item.id)).rejects.toThrow(/Forbidden/)
  })
})

// ── markOutboundFailed ────────────────────────────────────────────────────────

describe('markOutboundFailed', () => {
  it('sets status to Retrying on first failure', async () => {
    const item = await seedOutbound({ attemptCount: 0 })
    setAdmin()
    await markOutboundFailed(item.id)
    const updated = await db.outboundQueue.get(item.id)
    expect(updated?.status).toBe('Retrying')
    expect(updated?.attemptCount).toBe(1)
    expect(updated?.nextRetryAt).toBeGreaterThan(Date.now())
  })

  it('sets status to Retrying on second failure', async () => {
    const item = await seedOutbound({ status: 'Retrying', attemptCount: 1 })
    setAdmin()
    await markOutboundFailed(item.id)
    const updated = await db.outboundQueue.get(item.id)
    expect(updated?.status).toBe('Retrying')
    expect(updated?.attemptCount).toBe(2)
  })

  it('sets status to Failed after max retries exhausted', async () => {
    // RETRY_DELAYS_MS has 3 entries (1min, 5min, 15min), so after 3 retries it's permanent
    const item = await seedOutbound({
      status: 'Retrying',
      attemptCount: RETRY_DELAYS_MS.length,
    })
    setAdmin()
    await markOutboundFailed(item.id)
    const updated = await db.outboundQueue.get(item.id)
    expect(updated?.status).toBe('Failed')
  })

  it('is a no-op when item does not exist', async () => {
    setAdmin()
    await expect(markOutboundFailed('nonexistent-id')).resolves.toBeUndefined()
  })

  it('throws Forbidden for Participant', async () => {
    const item = await seedOutbound()
    setParticipant()
    await expect(markOutboundFailed(item.id)).rejects.toThrow(/Forbidden/)
  })
})

// ── requeueOutbound ───────────────────────────────────────────────────────────

describe('requeueOutbound', () => {
  it('resets a Failed item back to Queued', async () => {
    const item = await seedOutbound({
      status: 'Failed',
      attemptCount: 4,
      lastFailedAt: Date.now(),
    })
    setAdmin()
    await requeueOutbound(item.id)
    const updated = await db.outboundQueue.get(item.id)
    expect(updated?.status).toBe('Queued')
    expect(updated?.attemptCount).toBe(0)
  })

  it('resets a Scheduled item back to Queued', async () => {
    const item = await seedOutbound({
      status: 'Scheduled',
      scheduledAt: Date.now() + 60_000,
    })
    setAdmin()
    await requeueOutbound(item.id)
    const updated = await db.outboundQueue.get(item.id)
    expect(updated?.status).toBe('Queued')
    expect(updated?.scheduledAt).toBeUndefined()
  })

  it('throws Forbidden for ContentEditor', async () => {
    const item = await seedOutbound({ status: 'Failed' })
    setEditor()
    await expect(requeueOutbound(item.id)).rejects.toThrow(/Forbidden/)
  })
})

// ── deleteOutboundItem ────────────────────────────────────────────────────────

describe('deleteOutboundItem', () => {
  it('deletes an outbound item for Administrator', async () => {
    const item = await seedOutbound()
    setAdmin()
    await deleteOutboundItem(item.id)
    expect(await db.outboundQueue.get(item.id)).toBeUndefined()
  })

  it('throws Forbidden for Participant', async () => {
    const item = await seedOutbound()
    setParticipant()
    await expect(deleteOutboundItem(item.id)).rejects.toThrow(/Forbidden/)
  })
})

// ── bulkMarkOutboundSent ──────────────────────────────────────────────────────

describe('bulkMarkOutboundSent', () => {
  it('marks multiple items as Sent', async () => {
    setAdmin()
    const a = await seedOutbound()
    const b = await seedOutbound()
    await bulkMarkOutboundSent([a.id, b.id])

    const updA = await db.outboundQueue.get(a.id)
    const updB = await db.outboundQueue.get(b.id)
    expect(updA?.status).toBe('Sent')
    expect(updB?.status).toBe('Sent')
  })

  it('throws Forbidden for ContentEditor', async () => {
    setEditor()
    await expect(bulkMarkOutboundSent(['id-1'])).rejects.toThrow(/Forbidden/)
  })
})

// ── bulkDeleteOutbound ────────────────────────────────────────────────────────

describe('bulkDeleteOutbound', () => {
  it('deletes multiple items', async () => {
    setAdmin()
    const a = await seedOutbound()
    const b = await seedOutbound()
    await bulkDeleteOutbound([a.id, b.id])

    expect(await db.outboundQueue.get(a.id)).toBeUndefined()
    expect(await db.outboundQueue.get(b.id)).toBeUndefined()
  })

  it('throws Forbidden for Participant', async () => {
    setParticipant()
    await expect(bulkDeleteOutbound(['id-1'])).rejects.toThrow(/Forbidden/)
  })
})

// ── composeOutboundMessage ────────────────────────────────────────────────────

describe('composeOutboundMessage', () => {
  it('enqueues an outbound message for user with sendMessage permission', async () => {
    setAdmin()
    await composeOutboundMessage({
      channel: 'Email',
      recipientUserId: 'user-1',
      recipientAddress: 'user@example.com',
      subject: 'Hello',
      body: 'World',
    })
    const items = await db.outboundQueue.toArray()
    expect(items).toHaveLength(1)
    expect(items[0].status).toBe('Queued')
  })

  it('allows ContentEditor (has sendMessage) to compose', async () => {
    setEditor()
    await composeOutboundMessage({
      channel: 'SMS',
      recipientUserId: 'user-1',
      recipientAddress: '+1234567890',
      body: 'Test SMS',
    })
    const items = await db.outboundQueue.toArray()
    expect(items).toHaveLength(1)
  })

  it('throws Forbidden for Participant (lacks sendMessage)', async () => {
    setParticipant()
    await expect(
      composeOutboundMessage({
        channel: 'Email',
        recipientUserId: 'user-1',
        recipientAddress: 'user@example.com',
        body: 'Cheat',
      }),
    ).rejects.toThrow(/Forbidden/)
  })

  it('schedules the message when scheduledAt is in the future', async () => {
    setAdmin()
    const futureTime = Date.now() + 60_000
    await composeOutboundMessage({
      channel: 'Email',
      recipientUserId: 'user-1',
      recipientAddress: 'user@example.com',
      body: 'Later',
      scheduledAt: futureTime,
    })
    const items = await db.outboundQueue.toArray()
    expect(items[0].status).toBe('Scheduled')
  })

  it('uses template when templateKey is provided and template exists', async () => {
    setAdmin()
    // Seed a template
    await db.notificationTemplates.add({
      id: 'tmpl-1',
      key: 'system.welcome',
      name: 'Welcome',
      subjectTemplate: 'Welcome {{name}}',
      bodyTemplate: 'Hello, {{name}}!',
      variables: ['name'],
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await composeOutboundMessage({
      channel: 'Email',
      recipientUserId: 'user-1',
      recipientAddress: 'user@example.com',
      templateKey: 'system.welcome',
      templateVariables: { name: 'Alice' },
    })
    const items = await db.outboundQueue.toArray()
    expect(items[0].subject).toBe('Welcome Alice')
    expect(items[0].body).toBe('Hello, Alice!')
  })
})

// ── processRetryQueue ─────────────────────────────────────────────────────────

describe('processRetryQueue', () => {
  it('moves Retrying items whose nextRetryAt has passed back to Queued', async () => {
    await seedOutbound({
      status: 'Retrying',
      nextRetryAt: Date.now() - 1000, // in the past
    })
    await seedOutbound({
      status: 'Retrying',
      nextRetryAt: Date.now() + 60_000, // still in the future
    })

    await processRetryQueue()

    const all = await db.outboundQueue.toArray()
    const past = all.find((i) => (i.nextRetryAt ?? 0) < Date.now() + 60_000)
    const future = all.find((i) => (i.nextRetryAt ?? 0) > Date.now())

    // Past-due item re-queued (no nextRetryAt), future item still Retrying
    expect(all.filter((i) => i.status === 'Queued')).toHaveLength(1)
    expect(all.filter((i) => i.status === 'Retrying')).toHaveLength(1)
    // Suppress unused variable warnings
    void past
    void future
  })
})

// ── processScheduledQueue ─────────────────────────────────────────────────────

describe('processScheduledQueue', () => {
  it('promotes Scheduled items whose scheduledAt has passed to Queued', async () => {
    await seedOutbound({
      status: 'Scheduled',
      scheduledAt: Date.now() - 1000, // past
    })
    await seedOutbound({
      status: 'Scheduled',
      scheduledAt: Date.now() + 60_000, // future
    })

    await processScheduledQueue()

    const all = await db.outboundQueue.toArray()
    expect(all.filter((i) => i.status === 'Queued')).toHaveLength(1)
    expect(all.filter((i) => i.status === 'Scheduled')).toHaveLength(1)
  })
})

// ── getUnreadCount ────────────────────────────────────────────────────────────

describe('getUnreadCount', () => {
  it('returns the count of unread notifications for the owner', async () => {
    setUser('user-1', Role.Participant)
    await db.notifications.bulkAdd([
      { id: 'n1', userId: 'user-1', type: 'System', title: 'A', message: 'A', isRead: false, createdAt: Date.now() },
      { id: 'n2', userId: 'user-1', type: 'System', title: 'B', message: 'B', isRead: true, createdAt: Date.now() },
      { id: 'n3', userId: 'user-1', type: 'System', title: 'C', message: 'C', isRead: false, createdAt: Date.now() },
    ])
    const count = await getUnreadCount('user-1')
    expect(count).toBe(2)
  })

  it('throws Forbidden when requesting count for a different user', async () => {
    setUser('user-1', Role.Participant)
    await expect(getUnreadCount('user-2')).rejects.toThrow(/Forbidden/)
  })
})

// ── getOwnSubscription ────────────────────────────────────────────────────────

describe('getOwnSubscription', () => {
  it('returns default preferences when no row exists', async () => {
    setUser('user-1', Role.Participant)
    const pref = await getOwnSubscription('user-1', 'System')
    expect(pref.inApp).toBe(true)
    expect(pref.email).toBe(false)
    expect(pref.sms).toBe(false)
  })

  it('returns stored preferences when a row exists', async () => {
    setUser('user-1', Role.Participant)
    await db.notificationSubscriptions.add({
      id: 'sub-1',
      userId: 'user-1',
      notificationType: 'System',
      inApp: false,
      email: true,
      sms: false,
      officialAccount: false,
      updatedAt: Date.now(),
    })
    const pref = await getOwnSubscription('user-1', 'System')
    expect(pref.inApp).toBe(false)
    expect(pref.email).toBe(true)
  })

  it('throws Forbidden when reading another user\'s prefs without manageMessages', async () => {
    setUser('user-1', Role.Participant)
    await expect(getOwnSubscription('user-2', 'System')).rejects.toThrow(/Forbidden/)
  })

  it('allows Administrator (manageMessages) to read any user\'s prefs', async () => {
    setAdmin()
    const pref = await getOwnSubscription('any-user', 'System')
    expect(pref).toBeDefined()
  })

  it('throws when not authenticated', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await expect(getOwnSubscription('user-1', 'System')).rejects.toThrow(/Forbidden/)
  })
})

// ── setSubscription ───────────────────────────────────────────────────────────

describe('setSubscription', () => {
  it('creates a new subscription preference', async () => {
    setUser('user-1', Role.Participant)
    await setSubscription('user-1', 'System', { inApp: false, email: true })
    const pref = await getOwnSubscription('user-1', 'System')
    expect(pref.inApp).toBe(false)
    expect(pref.email).toBe(true)
  })

  it('updates an existing subscription preference', async () => {
    setUser('user-1', Role.Participant)
    await setSubscription('user-1', 'System', { inApp: true })
    await setSubscription('user-1', 'System', { inApp: false, sms: true })

    const pref = await getOwnSubscription('user-1', 'System')
    expect(pref.inApp).toBe(false)
    expect(pref.sms).toBe(true)

    // Only one row should exist
    const rows = await db.notificationSubscriptions
      .where('userId').equals('user-1').toArray()
    expect(rows.filter((r) => r.notificationType === 'System')).toHaveLength(1)
  })

  it('throws Forbidden when updating another user\'s prefs without manageMessages', async () => {
    setUser('user-1', Role.Participant)
    await expect(setSubscription('user-2', 'System', { email: true })).rejects.toThrow(/Forbidden/)
  })

  it('allows Administrator to update any user\'s prefs', async () => {
    setAdmin()
    await expect(setSubscription('user-any', 'System', { email: true })).resolves.toBeUndefined()
  })

  it('throws when not authenticated', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await expect(setSubscription('user-1', 'System', {})).rejects.toThrow(/Forbidden/)
  })
})

// ── getReadReceipts ───────────────────────────────────────────────────────────

describe('getReadReceipts', () => {
  it('returns receipts for notification owner', async () => {
    setUser('user-1', Role.Participant)
    await db.notifications.add({
      id: 'n-rx',
      userId: 'user-1',
      type: 'System',
      title: 'Hi',
      message: 'Hi',
      isRead: false,
      createdAt: Date.now(),
    })
    await db.messageReadReceipts.add({ id: 'rr-1', notificationId: 'n-rx', userId: 'user-1', readAt: Date.now() })

    const receipts = await getReadReceipts('n-rx')
    expect(receipts).toContain('user-1')
  })

  it('throws Forbidden when non-owner without manageMessages tries to read receipts', async () => {
    setUser('user-1', Role.Participant)
    await db.notifications.add({
      id: 'n-rx2',
      userId: 'user-2',
      type: 'System',
      title: 'Hi',
      message: 'Hi',
      isRead: false,
      createdAt: Date.now(),
    })
    await expect(getReadReceipts('n-rx2')).rejects.toThrow(/Forbidden/)
  })

  it('allows Administrator (manageMessages) to read any receipts', async () => {
    setAdmin()
    await db.notifications.add({
      id: 'n-rx3',
      userId: 'other-user',
      type: 'System',
      title: 'Hi',
      message: 'Hi',
      isRead: false,
      createdAt: Date.now(),
    })
    const receipts = await getReadReceipts('n-rx3')
    expect(Array.isArray(receipts)).toBe(true)
  })

  it('throws when not authenticated', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await expect(getReadReceipts('any-notif')).rejects.toThrow(/Forbidden/)
  })
})

// ── notifyMany ────────────────────────────────────────────────────────────────

describe('notifyMany', () => {
  it('creates notifications for all provided user IDs', async () => {
    setAdmin()
    await notifyMany(['user-a', 'user-b', 'user-c'], {
      type: 'System',
      title: 'Broadcast',
      message: 'Hello everyone',
    })
    const notifs = await db.notifications.toArray()
    // Users with default inApp=true should all receive it
    expect(notifs.length).toBeGreaterThanOrEqual(3)
    const userIds = new Set(notifs.map((n) => n.userId))
    expect(userIds.has('user-a')).toBe(true)
    expect(userIds.has('user-b')).toBe(true)
    expect(userIds.has('user-c')).toBe(true)
  })

  it('throws when not authenticated', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await expect(notifyMany(['user-a'], { type: 'System', title: 'X', message: 'X' })).rejects.toThrow(
      'Not authenticated',
    )
  })

  it('skips users who have opted out of inApp for the notification type', async () => {
    setAdmin()
    // user-b opts out
    await db.notificationSubscriptions.add({
      id: 'sub-optout',
      userId: 'user-b',
      notificationType: 'System',
      inApp: false,
      email: false,
      sms: false,
      officialAccount: false,
      updatedAt: Date.now(),
    })
    await notifyMany(['user-a', 'user-b'], {
      type: 'System',
      title: 'Selective',
      message: 'Only opted-in',
    })
    const notifs = await db.notifications.toArray()
    const userIds = notifs.map((n) => n.userId)
    expect(userIds).toContain('user-a')
    expect(userIds).not.toContain('user-b')
  })
})

// ── notify — outbound channel routing ────────────────────────────────────────

describe('notify — outbound channel routing', () => {
  it('creates an in-app notification by default', async () => {
    setUser('user-1', Role.Participant)
    await notify({
      userId: 'user-1',
      type: 'System',
      title: 'Test',
      message: 'In-app message',
    })
    const notifs = await db.notifications.where('userId').equals('user-1').toArray()
    expect(notifs).toHaveLength(1)
  })

  it('does not enqueue outbound when user has not subscribed to email', async () => {
    setUser('user-1', Role.Participant)
    // Default pref: email=false
    await notify(
      { userId: 'user-1', type: 'System', title: 'T', message: 'M' },
      { channel: 'Email', address: 'user@test.com', body: 'Body' },
    )
    const outbound = await db.outboundQueue.toArray()
    expect(outbound).toHaveLength(0)
  })

  it('enqueues outbound when user is subscribed to email', async () => {
    setAdmin()
    await db.notificationSubscriptions.add({
      id: 'sub-email',
      userId: 'user-1',
      notificationType: 'System',
      inApp: true,
      email: true,
      sms: false,
      officialAccount: false,
      updatedAt: Date.now(),
    })
    await notify(
      { userId: 'user-1', type: 'System', title: 'T', message: 'M' },
      { channel: 'Email', address: 'user@test.com', subject: 'Subject', body: 'Body' },
    )
    const outbound = await db.outboundQueue.toArray()
    expect(outbound).toHaveLength(1)
    expect(outbound[0].channel).toBe('Email')
  })

  it('skips in-app notification when user has opted out', async () => {
    setAdmin()
    await db.notificationSubscriptions.add({
      id: 'sub-noapp',
      userId: 'user-1',
      notificationType: 'System',
      inApp: false,
      email: false,
      sms: false,
      officialAccount: false,
      updatedAt: Date.now(),
    })
    await notify({ userId: 'user-1', type: 'System', title: 'T', message: 'M' })
    const notifs = await db.notifications.where('userId').equals('user-1').toArray()
    expect(notifs).toHaveLength(0)
  })
})
