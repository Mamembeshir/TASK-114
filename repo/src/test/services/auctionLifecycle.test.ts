/**
 * Integration tests for the auction lifecycle.
 * Tests the full state machine: Draft → Active → Ended → Awarded | NoSale
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { createAuction, publishAuction, cancelAuction } from '@/services/auctionService'
import { closeAuction } from '@/services/auctionLifecycle'
import { placeBid } from '@/services/biddingEngine'
import type { Auction } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function seedWallet(userId: string, balance = 10_000): Promise<void> {
  await db.wallets.put({
    id: `wallet-${userId}`,
    userId,
    balance,
    reservedAmount: 0,
    updatedAt: Date.now(),
  })
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
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('auction lifecycle — Draft → Active', () => {
  it('creates an auction in Draft status', async () => {
    const auction = await createAuction(auctionPayload(), 'admin-1', 'Admin')
    expect(auction.status).toBe('Draft')
  })

  it('transitions Draft → Active on publish', async () => {
    const auction = await createAuction(auctionPayload(), 'admin-1', 'Admin')
    await publishAuction(auction.id, 'admin-1', 'Admin')
    const updated = await db.auctions.get(auction.id)
    expect(updated?.status).toBe('Active')
  })

  it('rejects publishing when not in Draft', async () => {
    const auction = await createAuction(auctionPayload(), 'admin-1', 'Admin')
    await publishAuction(auction.id, 'admin-1', 'Admin')
    await expect(publishAuction(auction.id, 'admin-1', 'Admin')).rejects.toThrow()
  })

  it('can cancel an Active auction', async () => {
    const auction = await createAuction(auctionPayload(), 'admin-1', 'Admin')
    await publishAuction(auction.id, 'admin-1', 'Admin')
    await cancelAuction(auction.id, 'admin-1', 'Admin')
    const updated = await db.auctions.get(auction.id)
    expect(updated?.status).toBe('Cancelled')
  })
})

describe('auction lifecycle — closeAuction with bids → Awarded', () => {
  it('marks auction as Awarded and assigns winner', async () => {
    const auction = await createAuction(auctionPayload(), 'admin-1', 'Admin')
    await publishAuction(auction.id, 'admin-1', 'Admin')
    await seedWallet('bidder-1')
    await seedWallet('bidder-2')

    await placeBid(auction.id, 'bidder-1', 'Alice', 110, 'k1', 50, 0)
    await placeBid(auction.id, 'bidder-2', 'Bob', 130, 'k2', 50, 0)

    // Move to Ended status first (simulating timer)
    await db.auctions.update(auction.id, { status: 'Ended' })
    const ended = await db.auctions.get(auction.id)
    await closeAuction(ended as Auction)

    const closed = await db.auctions.get(auction.id)
    expect(closed?.status).toBe('Awarded')
    expect(closed?.winnerId).toBe('bidder-2')
  })

  it('deducts deposit from winner wallet on close', async () => {
    const auction = await createAuction(
      auctionPayload({ depositAmount: 200 }),
      'admin-1',
      'Admin',
    )
    await publishAuction(auction.id, 'admin-1', 'Admin')
    await seedWallet('bidder-1', 10_000)

    await placeBid(auction.id, 'bidder-1', 'Alice', 110, 'k1', 200, 0)

    await db.auctions.update(auction.id, { status: 'Ended' })
    const ended = await db.auctions.get(auction.id)
    await closeAuction(ended as Auction)

    const wallet = await db.wallets.get(`wallet-bidder-1`)
    // Balance reduced by deposit amount (200)
    expect(wallet?.balance).toBe(10_000 - 200)
  })

  it('releases deposit hold for losing bidders', async () => {
    const auction = await createAuction(
      auctionPayload({ depositAmount: 100 }),
      'admin-1',
      'Admin',
    )
    await publishAuction(auction.id, 'admin-1', 'Admin')
    await seedWallet('bidder-1', 5_000)
    await seedWallet('bidder-2', 5_000)

    await placeBid(auction.id, 'bidder-1', 'Alice', 110, 'k1', 100, 0)
    await placeBid(auction.id, 'bidder-2', 'Bob', 130, 'k2', 100, 0)

    await db.auctions.update(auction.id, { status: 'Ended' })
    const ended = await db.auctions.get(auction.id)
    await closeAuction(ended as Auction)

    // Loser (bidder-1) should have reservedAmount = 0
    const loserWallet = await db.wallets.get(`wallet-bidder-1`)
    expect(loserWallet?.reservedAmount).toBe(0)
  })

  it('notifies winner and losers', async () => {
    const auction = await createAuction(auctionPayload(), 'admin-1', 'Admin')
    await publishAuction(auction.id, 'admin-1', 'Admin')
    await seedWallet('bidder-1')
    await seedWallet('bidder-2')

    await placeBid(auction.id, 'bidder-1', 'Alice', 110, 'k1', 50, 0)
    await placeBid(auction.id, 'bidder-2', 'Bob', 130, 'k2', 50, 0)

    await db.auctions.update(auction.id, { status: 'Ended' })
    const ended = await db.auctions.get(auction.id)
    await closeAuction(ended as Auction)

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
    const auction = await createAuction(auctionPayload(), 'admin-1', 'Admin')
    await publishAuction(auction.id, 'admin-1', 'Admin')
    await db.auctions.update(auction.id, { status: 'Ended' })
    const ended = await db.auctions.get(auction.id)
    await closeAuction(ended as Auction)

    const closed = await db.auctions.get(auction.id)
    expect(closed?.status).toBe('NoSale')
  })

  it('notifies seller on NoSale', async () => {
    const auction = await createAuction(auctionPayload(), 'admin-1', 'Admin')
    await publishAuction(auction.id, 'admin-1', 'Admin')
    await db.auctions.update(auction.id, { status: 'Ended' })
    const ended = await db.auctions.get(auction.id)
    await closeAuction(ended as Auction)

    const notif = await db.notifications
      .where('userId')
      .equals('admin-1')
      .filter((n) => n.type === 'AuctionNoSale')
      .first()
    expect(notif).toBeDefined()
  })
})
