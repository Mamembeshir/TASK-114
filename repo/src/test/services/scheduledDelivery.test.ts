/**
 * Tests for the scheduled delivery workflow.
 *
 * Verifies:
 *   - Future scheduledAt creates a Scheduled item (not Queued)
 *   - Past / now scheduledAt creates a Queued item immediately
 *   - processScheduledQueue promotes Scheduled → Queued once time has passed
 *   - processScheduledQueue does NOT promote items still in the future
 *   - requeueOutbound resets a Scheduled item to Queued with cleared scheduledAt
 *
 * Evidence: src/services/notificationService.ts:150–186, :251–258
 *           src/types/notification.ts:39, :72
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  composeOutboundMessage,
  processScheduledQueue,
  requeueOutbound,
} from '@/services/notificationService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.outboundQueue.clear()
  // requeueOutbound and other management mutators require manageMessages — set Administrator
  useAuthStore.setState({
    currentUser: {
      id: 'admin-1',
      username: 'admin',
      displayName: 'Admin',
      role: Role.Administrator,
      isActive: true,
      createdAt: Date.now(),
    },
  } as Parameters<typeof useAuthStore.setState>[0])
})

// ── Scheduling on queue creation ──────────────────────────────────────────────

describe('composeOutboundMessage — scheduled delivery', () => {
  it('creates a Scheduled item when scheduledAt is in the future', async () => {
    const future = Date.now() + 60_000 // 1 minute from now
    await composeOutboundMessage({
      channel: 'Email',
      recipientUserId: 'u1',
      recipientAddress: 'u1@example.com',
      body: 'Hello',
      scheduledAt: future,
    })

    const [item] = await db.outboundQueue.toArray()
    expect(item.status).toBe('Scheduled')
    expect(item.scheduledAt).toBe(future)
  })

  it('creates a Queued item when scheduledAt is in the past', async () => {
    const past = Date.now() - 60_000
    await composeOutboundMessage({
      channel: 'Email',
      recipientUserId: 'u2',
      recipientAddress: 'u2@example.com',
      body: 'Hello',
      scheduledAt: past,
    })

    const [item] = await db.outboundQueue.toArray()
    expect(item.status).toBe('Queued')
  })

  it('creates a Queued item when no scheduledAt is provided', async () => {
    await composeOutboundMessage({
      channel: 'SMS',
      recipientUserId: 'u3',
      recipientAddress: '+15550000000',
      body: 'Hi',
    })

    const [item] = await db.outboundQueue.toArray()
    expect(item.status).toBe('Queued')
    expect(item.scheduledAt).toBeUndefined()
  })
})

// ── processScheduledQueue ─────────────────────────────────────────────────────

describe('processScheduledQueue', () => {
  it('promotes a Scheduled item to Queued when scheduledAt has passed', async () => {
    const past = Date.now() - 5_000
    await composeOutboundMessage({
      channel: 'Email',
      recipientUserId: 'u4',
      recipientAddress: 'u4@example.com',
      body: 'Release me',
      scheduledAt: past,
    })

    // Manually set it to Scheduled so we can test the transition
    const [item] = await db.outboundQueue.toArray()
    await db.outboundQueue.update(item.id, { status: 'Scheduled', scheduledAt: past })

    await processScheduledQueue()

    const updated = await db.outboundQueue.get(item.id)
    expect(updated?.status).toBe('Queued')
    expect(updated?.scheduledAt).toBeUndefined()
  })

  it('does NOT promote a Scheduled item whose scheduledAt is still in the future', async () => {
    const future = Date.now() + 300_000 // 5 minutes away
    await composeOutboundMessage({
      channel: 'Email',
      recipientUserId: 'u5',
      recipientAddress: 'u5@example.com',
      body: 'Not yet',
      scheduledAt: future,
    })

    // Force status to Scheduled
    const [item] = await db.outboundQueue.toArray()
    await db.outboundQueue.update(item.id, { status: 'Scheduled' })

    await processScheduledQueue()

    const unchanged = await db.outboundQueue.get(item.id)
    expect(unchanged?.status).toBe('Scheduled')
    expect(unchanged?.scheduledAt).toBe(future)
  })

  it('promotes only past-due items when multiple Scheduled items exist', async () => {
    const past = Date.now() - 1_000
    const future = Date.now() + 300_000

    await db.outboundQueue.bulkAdd([
      {
        id: 'past-item',
        channel: 'Email',
        recipientUserId: 'u6',
        recipientAddress: 'u6@example.com',
        body: 'Due now',
        status: 'Scheduled',
        scheduledAt: past,
        attemptCount: 0,
        queuedAt: Date.now(),
      },
      {
        id: 'future-item',
        channel: 'Email',
        recipientUserId: 'u7',
        recipientAddress: 'u7@example.com',
        body: 'Not yet',
        status: 'Scheduled',
        scheduledAt: future,
        attemptCount: 0,
        queuedAt: Date.now(),
      },
    ])

    await processScheduledQueue()

    const pastItem = await db.outboundQueue.get('past-item')
    const futureItem = await db.outboundQueue.get('future-item')

    expect(pastItem?.status).toBe('Queued')
    expect(pastItem?.scheduledAt).toBeUndefined()
    expect(futureItem?.status).toBe('Scheduled')
    expect(futureItem?.scheduledAt).toBe(future)
  })

  it('is a no-op when there are no Scheduled items', async () => {
    await composeOutboundMessage({
      channel: 'Email',
      recipientUserId: 'u8',
      recipientAddress: 'u8@example.com',
      body: 'Already queued',
    })

    await processScheduledQueue()

    const [item] = await db.outboundQueue.toArray()
    expect(item.status).toBe('Queued')
  })
})

// ── requeueOutbound on Scheduled items ────────────────────────────────────────

describe('requeueOutbound — release Scheduled item early', () => {
  it('transitions a Scheduled item to Queued and clears scheduledAt', async () => {
    const future = Date.now() + 60_000
    await db.outboundQueue.add({
      id: 'sched-1',
      channel: 'Email',
      recipientUserId: 'u9',
      recipientAddress: 'u9@example.com',
      body: 'Scheduled',
      status: 'Scheduled',
      scheduledAt: future,
      attemptCount: 0,
      queuedAt: Date.now(),
    })

    await requeueOutbound('sched-1')

    const item = await db.outboundQueue.get('sched-1')
    expect(item?.status).toBe('Queued')
    expect(item?.scheduledAt).toBeUndefined()
    expect(item?.attemptCount).toBe(0)
  })
})
