/**
 * Unit tests for the bidding engine.
 *
 * Covers: minimum increment enforcement, proxy bid resolution,
 * anti-sniping extension (once per auction), idempotency key deduplication.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/db'
import { placeBid, setProxyBid } from '@/services/biddingEngine'
import { ensureWallet, creditWallet } from '@/services/walletService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'
import type { Auction } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAuction(overrides: Partial<Auction> = {}): Auction {
  return {
    id: 'auction-1',
    title: 'Test Auction',
    description: '',
    categoryId: 'cat-1',
    imageUrls: [],
    startPrice: 100,
    currentPrice: 100,
    minimumIncrement: 10,
    depositAmount: 50,
    startTime: Date.now() - 1000,
    endTime: Date.now() + 60_000,
    status: 'Active',
    createdBy: 'admin-1',
    createdAt: Date.now() - 2000,
    updatedAt: Date.now() - 2000,
    antiSnipingTriggered: false,
    ...overrides,
  }
}

async function seedAuction(overrides: Partial<Auction> = {}): Promise<Auction> {
  const auction = makeAuction(overrides)
  await db.auctions.put(auction)
  return auction
}

async function seedWallet(userId: string): Promise<void> {
  await ensureWallet(userId)
  await creditWallet(userId, 10_000, 'Test seed', 'system')
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // Clear all relevant tables between tests — safer than db.delete()+db.open()
  await Promise.all([
    db.auctions.clear(),
    db.bids.clear(),
    db.proxyBids.clear(),
    db.wallets.clear(),
    db.walletTransactions.clear(),
    db.notifications.clear(),
    db.auditLogs.clear(),
  ])
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('placeBid — minimum increment validation', () => {
  it('rejects a bid below the minimum required amount', async () => {
    await seedAuction()
    await seedWallet('bidder-1')

    const result = await placeBid('auction-1', 'bidder-1', 'Alice', 105, 'key-1', 50, 0)

    expect(result.success).toBe(false)
    expect(result.message).toContain('Minimum bid is')
  })

  it('accepts a bid exactly at the minimum required amount', async () => {
    await seedAuction() // currentPrice=100, minimumIncrement=10 → min=110
    await seedWallet('bidder-1')

    const result = await placeBid('auction-1', 'bidder-1', 'Alice', 110, 'key-1', 50, 0)

    expect(result.success).toBe(true)
    expect(result.newPrice).toBe(110)
  })
})

describe('placeBid — auction state guards', () => {
  it('rejects bids on a non-existent auction', async () => {
    const result = await placeBid('no-such-auction', 'bidder-1', 'Alice', 200, 'key-x', 50, 0)
    expect(result.success).toBe(false)
    expect(result.message).toBe('Auction not found')
  })

  it('rejects bids on an Ended auction', async () => {
    await seedAuction({ status: 'Ended' })
    await seedWallet('bidder-1')

    const result = await placeBid('auction-1', 'bidder-1', 'Alice', 200, 'key-2', 50, 0)
    expect(result.success).toBe(false)
    expect(result.message).toBe('Auction is not accepting bids')
  })

  it('rejects bids after the end time has passed', async () => {
    await seedAuction({ endTime: Date.now() - 1000 }) // already ended
    await seedWallet('bidder-1')

    const result = await placeBid('auction-1', 'bidder-1', 'Alice', 200, 'key-3', 50, 0)
    expect(result.success).toBe(false)
    expect(result.message).toBe('Auction has ended')
  })
})

describe('placeBid — idempotency', () => {
  it('returns "Already placed" when the same idempotency key is resubmitted', async () => {
    await seedAuction() // currentPrice=100
    await seedWallet('bidder-1')

    // First call — succeeds, price moves to 110
    const first = await placeBid('auction-1', 'bidder-1', 'Alice', 110, 'idem-key', 50, 0)
    expect(first.success).toBe(true)

    // Reset price so min check passes on second call (simulates cross-tab retry
    // before the UI has refreshed its local snapshot)
    await db.auctions.update('auction-1', { currentPrice: 100 })

    // Second call with same idempotency key — hits the idempotency guard
    const second = await placeBid('auction-1', 'bidder-1', 'Alice', 110, 'idem-key', 50, 50)
    expect(second.success).toBe(true)
    expect(second.message).toBe('Already placed')

    // Only one bid record should exist
    const bids = await db.bids.where('auctionId').equals('auction-1').toArray()
    expect(bids).toHaveLength(1)
  })
})

describe('placeBid — anti-sniping', () => {
  it('extends auction end time by 2 minutes when a bid lands in the final 30 s', async () => {
    const nearEnd = Date.now() + 15_000 // 15 s left — inside snipe window
    await seedAuction({ endTime: nearEnd })
    await seedWallet('bidder-1')

    const result = await placeBid('auction-1', 'bidder-1', 'Alice', 110, 'key-snipe', 50, 0)

    expect(result.success).toBe(true)
    expect(result.extended).toBe(true)

    const updated = await db.auctions.get('auction-1')
    expect(updated?.status).toBe('Extended')
    expect(updated?.antiSnipingTriggered).toBe(true)
    // End time should be ~2 minutes (120 s) beyond the original end time
    expect(updated?.endTime).toBeGreaterThan(nearEnd + 100_000)
  })

  it('extends again even when antiSnipingTriggered is already true (no cap)', async () => {
    // Auction already extended once — antiSnipingTriggered:true — but still in snipe window
    const nearEnd = Date.now() + 15_000
    await seedAuction({ endTime: nearEnd, antiSnipingTriggered: true, status: 'Extended' })
    await seedWallet('bidder-1')

    const result = await placeBid('auction-1', 'bidder-1', 'Alice', 110, 'key-a', 50, 0)

    expect(result.extended).toBe(true)
    const updated = await db.auctions.get('auction-1')
    expect(updated?.endTime).toBeGreaterThan(nearEnd + 100_000)
  })

  it('does NOT extend when bid is outside the 30-second snipe window', async () => {
    await seedAuction({ endTime: Date.now() + 60_000 }) // 60 s left — outside window
    await seedWallet('bidder-1')

    const result = await placeBid('auction-1', 'bidder-1', 'Alice', 110, 'key-no-snipe', 50, 0)

    expect(result.extended).toBe(false)
    const updated = await db.auctions.get('auction-1')
    expect(updated?.antiSnipingTriggered).toBe(false)
  })
})

describe('proxy bid resolution', () => {
  it('auto-counters a manual bid when a proxy can outbid it', async () => {
    await seedAuction({ currentPrice: 100 })
    await seedWallet('proxy-user')
    await seedWallet('manual-user')

    // Set a proxy max of 200 for proxy-user
    await setProxyBid('auction-1', 'proxy-user', 'Proxy User', 200, 50, 0)

    // Manual bidder bids 120 — proxy should counter to 130 (120 + increment of 10)
    const result = await placeBid('auction-1', 'manual-user', 'Manual', 120, 'key-m', 50, 0)

    expect(result.success).toBe(true)
    expect(result.newPrice).toBe(130)
    expect(result.message).toBe('You were outbid by a proxy bid')
  })

  it('manual bidder wins when their bid exceeds all proxy maximums', async () => {
    await seedAuction({ currentPrice: 100 })
    await seedWallet('proxy-user')
    await seedWallet('manual-user')

    // Proxy max is 150
    await setProxyBid('auction-1', 'proxy-user', 'Proxy User', 150, 50, 0)

    // After setProxyBid, current price may have moved — get the fresh auction
    const fresh = await db.auctions.get('auction-1')
    const freshPrice = fresh?.currentPrice ?? 100
    const minBid = freshPrice + 10

    // Manual bidder bids above proxy max
    const winAmount = Math.max(minBid, 160)
    const result = await placeBid('auction-1', 'manual-user', 'Manual', winAmount, 'key-win', 50, 0)

    expect(result.success).toBe(true)
    expect(result.newPrice).toBe(winAmount)
    expect(result.message).toBe('Bid placed successfully!')
  })
})

// ── Permission guard — setProxyBid ─────────────────────────────────────────────

describe('setProxyBid — permission guard', () => {
  function makeUser(role: Role) {
    return {
      id: `user-${role}`,
      username: role.toLowerCase(),
      displayName: role,
      email: `${role.toLowerCase()}@test`,
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

  afterEach(() => {
    // Restore the default admin user used by other tests
    useAuthStore.setState({ currentUser: makeUser(Role.Administrator), isLoading: false })
  })

  it('allows Participant to call setProxyBid', async () => {
    useAuthStore.setState({ currentUser: makeUser(Role.Participant) })
    await seedAuction()
    await seedWallet(`user-${Role.Participant}`)

    const result = await setProxyBid('auction-1', `user-${Role.Participant}`, 'Participant', 200, 50, 0)
    expect(result.success).toBe(true)
  })

  it('throws Forbidden when ContentEditor calls setProxyBid', async () => {
    useAuthStore.setState({ currentUser: makeUser(Role.ContentEditor) })
    await seedAuction()

    await expect(
      setProxyBid('auction-1', `user-${Role.ContentEditor}`, 'Editor', 200, 50, 0),
    ).rejects.toThrow(/Forbidden/)
  })

  it('throws Forbidden when ReviewerApprover calls setProxyBid', async () => {
    useAuthStore.setState({ currentUser: makeUser(Role.ReviewerApprover) })
    await seedAuction()

    await expect(
      setProxyBid('auction-1', `user-${Role.ReviewerApprover}`, 'Reviewer', 200, 50, 0),
    ).rejects.toThrow(/Forbidden/)
  })
})
