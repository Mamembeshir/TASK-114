/**
 * Tests for the BidLockManager — explicit per-auction lock for cross-tab
 * bid exclusivity.
 *
 * Covers:
 *   - Successful lock acquisition when no lock exists
 *   - Lock rejection when a fresh lock is already held
 *   - Stale-lock recovery (lock past its TTL is stolen)
 *   - Release only removes lock owned by the caller (holderId check)
 *   - Post-release re-acquisition succeeds
 *   - Concurrent bid serialization via the lock (sequential attempts)
 *   - Lock record is absent after release (clean state)
 *
 * Evidence: src/services/bidLockManager.ts,
 *           src/db/database.ts version 7 (auctionLocks: &auctionId),
 *           CLAUDE.md decision #10 (BroadcastChannel + IndexedDB transaction
 *           locks + idempotency keys)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { acquireBidLock, releaseBidLock, LOCK_TTL_MS } from '@/services/bidLockManager'

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.auctionLocks.clear()
})

// ── Acquisition ────────────────────────────────────────────────────────────────

describe('acquireBidLock', () => {
  it('returns a holderId when no lock exists', async () => {
    const holderId = await acquireBidLock('auction-1')
    expect(holderId).not.toBeNull()
    expect(typeof holderId).toBe('string')
    expect(holderId!.length).toBeGreaterThan(0)
  })

  it('persists the lock record in auctionLocks', async () => {
    await acquireBidLock('auction-1')
    const lock = await db.auctionLocks.where('auctionId').equals('auction-1').first()
    expect(lock).toBeDefined()
    expect(lock!.auctionId).toBe('auction-1')
    expect(lock!.expiresAt).toBeGreaterThan(Date.now())
  })

  it('returns null when a fresh lock is already held', async () => {
    const first = await acquireBidLock('auction-1')
    expect(first).not.toBeNull()

    const second = await acquireBidLock('auction-1')
    expect(second).toBeNull()
  })

  it('does not affect locks for different auctions', async () => {
    const h1 = await acquireBidLock('auction-A')
    const h2 = await acquireBidLock('auction-B')
    expect(h1).not.toBeNull()
    expect(h2).not.toBeNull()

    const locks = await db.auctionLocks.toArray()
    expect(locks).toHaveLength(2)
  })
})

// ── Stale-lock recovery ────────────────────────────────────────────────────────

describe('acquireBidLock — stale lock recovery', () => {
  it('steals a lock whose expiresAt has passed', async () => {
    // Insert a lock that expired in the past
    await db.auctionLocks.add({
      id: 'stale-lock',
      auctionId: 'auction-1',
      heldBy: 'old-holder',
      acquiredAt: Date.now() - LOCK_TTL_MS - 5_000,
      expiresAt: Date.now() - 1_000, // already expired
    })

    const holderId = await acquireBidLock('auction-1')
    expect(holderId).not.toBeNull()

    // Old stale lock should be gone; new lock with our holderId should exist
    const lock = await db.auctionLocks.where('auctionId').equals('auction-1').first()
    expect(lock!.heldBy).toBe(holderId!)
    expect(lock!.heldBy).not.toBe('old-holder')
  })

  it('does NOT steal a lock that is still within its TTL', async () => {
    await db.auctionLocks.add({
      id: 'fresh-lock',
      auctionId: 'auction-1',
      heldBy: 'current-holder',
      acquiredAt: Date.now() - 1_000,
      expiresAt: Date.now() + LOCK_TTL_MS, // still valid
    })

    const holderId = await acquireBidLock('auction-1')
    expect(holderId).toBeNull()
  })
})

// ── Release ────────────────────────────────────────────────────────────────────

describe('releaseBidLock', () => {
  it('removes the lock record after release', async () => {
    const holderId = await acquireBidLock('auction-1')
    expect(holderId).not.toBeNull()

    await releaseBidLock('auction-1', holderId!)

    const lock = await db.auctionLocks.where('auctionId').equals('auction-1').first()
    expect(lock).toBeUndefined()
  })

  it('allows re-acquisition after release', async () => {
    const first = await acquireBidLock('auction-1')
    await releaseBidLock('auction-1', first!)

    const second = await acquireBidLock('auction-1')
    expect(second).not.toBeNull()
  })

  it('does NOT remove a lock held by a different holderId', async () => {
    const holderId = await acquireBidLock('auction-1')
    expect(holderId).not.toBeNull()

    // Attempt to release with a wrong holderId — should be a no-op
    await releaseBidLock('auction-1', 'wrong-holder-id')

    // Lock should still be present with the original holder
    const lock = await db.auctionLocks.where('auctionId').equals('auction-1').first()
    expect(lock).toBeDefined()
    expect(lock!.heldBy).toBe(holderId!)
  })

  it('is a no-op when the lock does not exist', async () => {
    // Should not throw even if there is nothing to release
    await expect(releaseBidLock('auction-nonexistent', 'any-holder')).resolves.toBeUndefined()
  })
})

// ── Serialization via sequential acquire/release ───────────────────────────────

describe('cross-tab exclusivity — sequential lock contention', () => {
  it('serializes two concurrent lock attempts: one wins, one is queued', async () => {
    // Simulate two tabs attempting to acquire simultaneously (sequentially in test)
    const results: Array<string | null> = await Promise.all([
      acquireBidLock('auction-race'),
      acquireBidLock('auction-race'),
    ])

    const successes = results.filter((r) => r !== null)
    const failures = results.filter((r) => r === null)

    // Exactly one should have acquired the lock; the other should have been rejected
    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(1)
  })

  it('three concurrent attempts yield exactly one winner', async () => {
    const results = await Promise.all([
      acquireBidLock('auction-triple'),
      acquireBidLock('auction-triple'),
      acquireBidLock('auction-triple'),
    ])

    const successes = results.filter((r) => r !== null)
    expect(successes).toHaveLength(1)
  })

  it('sequential acquire-release-acquire allows orderly progress', async () => {
    const h1 = await acquireBidLock('auction-seq')
    expect(h1).not.toBeNull()

    // While h1 holds the lock, h2 cannot acquire
    const h2_attempt1 = await acquireBidLock('auction-seq')
    expect(h2_attempt1).toBeNull()

    // h1 releases; now h2 can acquire
    await releaseBidLock('auction-seq', h1!)
    const h2_attempt2 = await acquireBidLock('auction-seq')
    expect(h2_attempt2).not.toBeNull()
  })
})
