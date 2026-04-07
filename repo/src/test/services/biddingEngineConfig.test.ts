/**
 * Tests for config-driven anti-sniping behavior in the bidding engine.
 *
 * Verifies that:
 *   - When no systemConfig row exists, hardcoded defaults (30 s window / 2 min ext) are used
 *   - When systemConfig overrides antiSnipingWindowSeconds, the new window is respected
 *   - When systemConfig overrides antiSnipingExtensionMinutes, the new extension is applied
 *   - A bid outside a custom window does NOT trigger anti-sniping
 *   - A bid inside a custom window DOES trigger anti-sniping with the custom extension
 *
 * Evidence: src/services/biddingEngine.ts (getSnipeConfig),
 *           src/pages/admin/SystemSettingsPage.tsx:167,
 *           src/types/system.ts (SystemConfig)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { placeBid } from '@/services/biddingEngine'
import { ensureWallet, creditWallet } from '@/services/walletService'
import type { Auction, SystemConfig } from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeAuction(overrides: Partial<Auction> = {}): Auction {
  return {
    id: 'auction-cfg',
    title: 'Config Test Auction',
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
  await creditWallet(userId, 10_000, 'Seed', 'system')
}

function makeConfig(overrides: Partial<SystemConfig> = {}): SystemConfig {
  return {
    id: 'singleton',
    orgName: 'Test Org',
    documentNumberPrefix: 'ORG',
    documentNumberCounter: 0,
    defaultRetentionYears: 7,
    antiSnipingWindowSeconds: 30,
    antiSnipingExtensionMinutes: 2,
    defaultMinimumIncrement: 10,
    updatedAt: Date.now(),
    updatedBy: 'system',
    ...overrides,
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.auctions.clear(),
    db.bids.clear(),
    db.proxyBids.clear(),
    db.wallets.clear(),
    db.walletTransactions.clear(),
    db.notifications.clear(),
    db.auditLogs.clear(),
    db.systemConfig.clear(),
    db.auctionLocks.clear(),
  ])
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('anti-sniping — no systemConfig (uses defaults)', () => {
  it('extends by ~2 min when bid is within default 30-second window', async () => {
    // No systemConfig row — engine must fall back to defaults
    const nearEnd = Date.now() + 15_000 // 15 s left → inside 30 s window
    await seedAuction({ endTime: nearEnd })
    await seedWallet('bidder-1')

    const result = await placeBid('auction-cfg', 'bidder-1', 'Alice', 110, 'cfg-key-1', 50, 0)

    expect(result.success).toBe(true)
    expect(result.extended).toBe(true)

    const updated = await db.auctions.get('auction-cfg')
    // Default extension is 2 min (120_000 ms) from the ORIGINAL end time
    expect(updated?.endTime).toBeGreaterThanOrEqual(nearEnd + 119_000)
    expect(updated?.endTime).toBeLessThan(nearEnd + 121_000 + 5_000) // allow 5 s clock drift
  })

  it('does NOT extend when bid is outside default 30-second window', async () => {
    // 60 s left — outside the default 30 s snipe window
    await seedAuction({ endTime: Date.now() + 60_000 })
    await seedWallet('bidder-1')

    const result = await placeBid('auction-cfg', 'bidder-1', 'Alice', 110, 'cfg-key-2', 50, 0)

    expect(result.success).toBe(true)
    expect(result.extended).toBe(false)
  })
})

describe('anti-sniping — custom window from systemConfig', () => {
  it('uses a wider custom snipe window (60 s) when configured', async () => {
    await db.systemConfig.put(
      makeConfig({ antiSnipingWindowSeconds: 60, antiSnipingExtensionMinutes: 2 }),
    )
    // 45 s left — outside default 30 s window but INSIDE the custom 60 s window
    const nearEnd = Date.now() + 45_000
    await seedAuction({ endTime: nearEnd })
    await seedWallet('bidder-1')

    const result = await placeBid('auction-cfg', 'bidder-1', 'Alice', 110, 'cfg-key-3', 50, 0)

    expect(result.success).toBe(true)
    expect(result.extended).toBe(true)
  })

  it('does NOT extend when bid is outside the custom 60-second window', async () => {
    await db.systemConfig.put(
      makeConfig({ antiSnipingWindowSeconds: 60, antiSnipingExtensionMinutes: 2 }),
    )
    // 90 s left — outside even the custom 60 s window
    await seedAuction({ endTime: Date.now() + 90_000 })
    await seedWallet('bidder-1')

    const result = await placeBid('auction-cfg', 'bidder-1', 'Alice', 110, 'cfg-key-4', 50, 0)

    expect(result.success).toBe(true)
    expect(result.extended).toBe(false)
  })
})

describe('anti-sniping — custom extension duration from systemConfig', () => {
  it('applies a custom 5-minute extension when configured', async () => {
    await db.systemConfig.put(
      makeConfig({ antiSnipingWindowSeconds: 30, antiSnipingExtensionMinutes: 5 }),
    )
    const nearEnd = Date.now() + 15_000 // 15 s — inside 30 s window
    await seedAuction({ endTime: nearEnd })
    await seedWallet('bidder-1')

    const result = await placeBid('auction-cfg', 'bidder-1', 'Alice', 110, 'cfg-key-5', 50, 0)

    expect(result.extended).toBe(true)
    const updated = await db.auctions.get('auction-cfg')
    // 5-minute extension = 300_000 ms
    expect(updated?.endTime).toBeGreaterThanOrEqual(nearEnd + 299_000)
    expect(updated?.endTime).toBeLessThan(nearEnd + 301_000 + 5_000)
  })

  it('applies a custom 1-minute extension when configured', async () => {
    await db.systemConfig.put(
      makeConfig({ antiSnipingWindowSeconds: 30, antiSnipingExtensionMinutes: 1 }),
    )
    const nearEnd = Date.now() + 10_000
    await seedAuction({ endTime: nearEnd })
    await seedWallet('bidder-1')

    const result = await placeBid('auction-cfg', 'bidder-1', 'Alice', 110, 'cfg-key-6', 50, 0)

    expect(result.extended).toBe(true)
    const updated = await db.auctions.get('auction-cfg')
    // 1-minute extension = 60_000 ms
    expect(updated?.endTime).toBeGreaterThanOrEqual(nearEnd + 59_000)
    expect(updated?.endTime).toBeLessThan(nearEnd + 61_000 + 5_000)
  })
})
