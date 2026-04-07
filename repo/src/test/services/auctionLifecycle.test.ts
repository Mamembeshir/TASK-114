/**
 * Integration tests for the auction lifecycle.
 * Tests the full state machine: Draft → Active → Ended → Awarded | NoSale
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { createAuction, publishAuction, cancelAuction } from '@/services/auctionService'
import { closeAuction } from '@/services/auctionLifecycle' // used via endAndClose helper
import { placeBid } from '@/services/biddingEngine'
import { ensureWallet, creditWallet, getWallet } from '@/services/walletService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function endAndClose(auctionId: string): Promise<void> {
  await db.auctions.update(auctionId, { status: 'Ended' })
  const ended = await db.auctions.get(auctionId)
  if (!ended) throw new Error('Auction not found')
  await closeAuction(ended)
}

async function seedWallet(userId: string, balance = 10_000): Promise<void> {
  await ensureWallet(userId)
  if (balance > 0) await creditWallet(userId, balance, 'Test seed')
}

function auctionPayload(overrides = {}) {
  return {
    title: 'Integration Auction',
    description: 'Test',
    categoryId: 'cat-1',
    imageUrls: [] as string[],
    startPrice: 100,
    minimumIncrement: 10,
    depositAmount: 50,
    startTime: Date.now() - 1000,
    endTime: Date.now() + 60_000,
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.auctions.clear(),
    db.bids.clear(),
    db.proxyBids.clear(),
    db.wallets.clear(),
    db.walletTransactions.clear(),
    db.notifications.clear(),
    db.auditLogs.clear(),
  ])
  // Services derive actor identity from the auth store.
  // Set admin-1 as the authenticated user so auction creator id is predictable.
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('auction lifecycle — Draft → Active', () => {
  it('creates an auction in Draft status', async () => {
    const auction = await createAuction(auctionPayload())
    expect(auction.status).toBe('Draft')
  })

  it('transitions Draft → Active on publish', async () => {
    const auction = await createAuction(auctionPayload())
    await publishAuction(auction.id)
    const updated = await db.auctions.get(auction.id)
    expect(updated?.status).toBe('Active')
  })

  it('rejects publishing when not in Draft', async () => {
    const auction = await createAuction(auctionPayload())
    await publishAuction(auction.id)
    await expect(publishAuction(auction.id)).rejects.toThrow()
  })

  it('can cancel an Active auction', async () => {
    const auction = await createAuction(auctionPayload())
    await publishAuction(auction.id)
    await cancelAuction(auction.id)
    const updated = await db.auctions.get(auction.id)
    expect(updated?.status).toBe('Cancelled')
  })
})

describe('auction lifecycle — closeAuction with bids → Awarded', () => {
  it('marks auction as Awarded and assigns winner', async () => {
    const auction = await createAuction(auctionPayload())
    await publishAuction(auction.id)
    await seedWallet('bidder-1')
    await seedWallet('bidder-2')

    await placeBid(auction.id, 'bidder-1', 'Alice', 110, 'k1', 50, 0)
    await placeBid(auction.id, 'bidder-2', 'Bob', 130, 'k2', 50, 0)
    await endAndClose(auction.id)

    const closed = await db.auctions.get(auction.id)
    expect(closed?.status).toBe('Awarded')
    expect(closed?.winnerId).toBe('bidder-2')
  })

  it('deducts deposit from winner wallet on close', async () => {
    const auction = await createAuction(auctionPayload({ depositAmount: 200 }))
    await publishAuction(auction.id)
    await seedWallet('bidder-1', 10_000)

    await placeBid(auction.id, 'bidder-1', 'Alice', 110, 'k1', 200, 0)
    await endAndClose(auction.id)

    const wallet = await getWallet('bidder-1')
    // Balance reduced by deposit amount (200)
    expect(wallet?.balance).toBe(10_000 - 200)
  })

  it('releases deposit hold for losing bidders', async () => {
    const auction = await createAuction(auctionPayload({ depositAmount: 100 }))
    await publishAuction(auction.id)
    await seedWallet('bidder-1', 5_000)
    await seedWallet('bidder-2', 5_000)

    await placeBid(auction.id, 'bidder-1', 'Alice', 110, 'k1', 100, 0)
    await placeBid(auction.id, 'bidder-2', 'Bob', 130, 'k2', 100, 0)
    await endAndClose(auction.id)

    // Loser (bidder-1) should have reservedAmount = 0
    const loserWallet = await getWallet('bidder-1')
    expect(loserWallet?.reservedAmount).toBe(0)
  })

  it('notifies winner and losers', async () => {
    const auction = await createAuction(auctionPayload())
    await publishAuction(auction.id)
    await seedWallet('bidder-1')
    await seedWallet('bidder-2')

    await placeBid(auction.id, 'bidder-1', 'Alice', 110, 'k1', 50, 0)
    await placeBid(auction.id, 'bidder-2', 'Bob', 130, 'k2', 50, 0)
    await endAndClose(auction.id)

    const winnerNotif = await db.notifications
      .where('userId')
      .equals('bidder-2')
      .filter((n) => n.type === 'AuctionWon')
      .first()
    expect(winnerNotif).toBeDefined()

    const loserNotif = await db.notifications
      .where('userId')
      .equals('bidder-1')
      .filter((n) => n.type === 'BidOutbid')
      .first()
    expect(loserNotif).toBeDefined()
  })
})

describe('auction lifecycle — closeAuction with no bids → NoSale', () => {
  it('marks auction as NoSale when no bids', async () => {
    const auction = await createAuction(auctionPayload())
    await publishAuction(auction.id)
    await endAndClose(auction.id)

    const closed = await db.auctions.get(auction.id)
    expect(closed?.status).toBe('NoSale')
  })

  it('notifies seller on NoSale', async () => {
    const auction = await createAuction(auctionPayload())
    await publishAuction(auction.id)
    await endAndClose(auction.id)

    const notif = await db.notifications
      .where('userId')
      .equals('admin-1')
      .filter((n) => n.type === 'AuctionNoSale')
      .first()
    expect(notif).toBeDefined()
  })
})
