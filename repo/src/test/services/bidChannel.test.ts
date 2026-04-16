/**
 * Unit tests for bidChannel.
 *
 * The service maintains an in-process subscriber set that is notified
 * synchronously on every broadcast() call. No BroadcastChannel mock is
 * needed — cross-tab delivery is tested by the browser environment itself.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { broadcast, subscribeToBidEvents } from '@/services/bidChannel'
import type { BidEvent } from '@/services/bidChannel'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collect all unsubs so we can clean up even if a test fails mid-way. */
const unsubs: Array<() => void> = []

function subscribe(handler: (e: BidEvent) => void): () => void {
  const unsub = subscribeToBidEvents(handler)
  unsubs.push(unsub)
  return unsub
}

beforeEach(() => {
  // Unsubscribe everything from the previous test to isolate handler state
  for (const u of unsubs.splice(0)) u()
})

// ── subscribeToBidEvents ──────────────────────────────────────────────────────

describe('subscribeToBidEvents', () => {
  it('invokes the handler when a BID_PLACED event is broadcast', () => {
    const received: BidEvent[] = []
    subscribe((evt) => received.push(evt))

    const event: BidEvent = {
      type: 'BID_PLACED',
      auctionId: 'auction-1',
      bid: {
        id: 'bid-1',
        auctionId: 'auction-1',
        bidderId: 'user-1',
        amount: 150,
        idempotencyKey: 'key-1',
        isProxyResolved: false,
        createdAt: Date.now(),
      },
      newPrice: 150,
    }

    broadcast(event)

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual(event)
  })

  it('invokes the handler for AUCTION_EXTENDED events', () => {
    const received: BidEvent[] = []
    subscribe((evt) => received.push(evt))

    const event: BidEvent = {
      type: 'AUCTION_EXTENDED',
      auctionId: 'auction-2',
      newEndTime: Date.now() + 120_000,
    }
    broadcast(event)

    expect(received.find((e) => e.type === 'AUCTION_EXTENDED')).toBeDefined()
  })

  it('invokes the handler for AUCTION_CLOSED events', () => {
    const received: BidEvent[] = []
    subscribe((evt) => received.push(evt))

    broadcast({ type: 'AUCTION_CLOSED', auctionId: 'auction-3' })

    expect(received.find((e) => e.type === 'AUCTION_CLOSED')).toBeDefined()
  })

  it('stops receiving events after unsubscribe', () => {
    const received: BidEvent[] = []
    const unsub = subscribe((evt) => received.push(evt))

    unsub()

    broadcast({ type: 'AUCTION_CLOSED', auctionId: 'auction-4' })

    expect(received).toHaveLength(0)
  })

  it('allows multiple independent subscribers', () => {
    const a: BidEvent[] = []
    const b: BidEvent[] = []
    subscribe((e) => a.push(e))
    subscribe((e) => b.push(e))

    broadcast({ type: 'AUCTION_CLOSED', auctionId: 'auction-5' })

    expect(a.length).toBeGreaterThanOrEqual(1)
    expect(b.length).toBeGreaterThanOrEqual(1)
  })

  it('delivers multiple events in order', () => {
    const received: BidEvent[] = []
    subscribe((e) => received.push(e))

    broadcast({ type: 'AUCTION_CLOSED', auctionId: 'a1' })
    broadcast({ type: 'AUCTION_EXTENDED', auctionId: 'a2', newEndTime: Date.now() + 1000 })
    broadcast({ type: 'AUCTION_CLOSED', auctionId: 'a3' })

    expect(received).toHaveLength(3)
    expect(received[0].auctionId).toBe('a1')
    expect(received[2].auctionId).toBe('a3')
  })

  it('returns a callable unsubscribe function', () => {
    const unsub = subscribe(() => {})
    expect(typeof unsub).toBe('function')
    expect(() => unsub()).not.toThrow()
  })

  it('unsubscribing one subscriber does not affect others', () => {
    const a: BidEvent[] = []
    const b: BidEvent[] = []
    const unsubA = subscribe((e) => a.push(e))
    subscribe((e) => b.push(e))

    broadcast({ type: 'AUCTION_CLOSED', auctionId: 'x1' })
    unsubA()
    broadcast({ type: 'AUCTION_CLOSED', auctionId: 'x2' })

    expect(a).toHaveLength(1) // only received the first event
    expect(b).toHaveLength(2) // received both events
  })
})

// ── broadcast ─────────────────────────────────────────────────────────────────

describe('broadcast', () => {
  it('does not throw when called without subscribers', () => {
    expect(() => {
      broadcast({ type: 'AUCTION_CLOSED', auctionId: 'auction-x' })
    }).not.toThrow()
  })

  it('is callable multiple times without error', () => {
    const events: BidEvent[] = [
      { type: 'AUCTION_CLOSED', auctionId: 'a1' },
      { type: 'AUCTION_EXTENDED', auctionId: 'a2', newEndTime: Date.now() + 1000 },
    ]
    expect(() => {
      events.forEach((e) => broadcast(e))
    }).not.toThrow()
  })
})
