/**
 * BidLockManager — explicit per-auction lock for cross-tab bid exclusivity.
 *
 * Design (CLAUDE.md #10):
 *   Implements the "IndexedDB transaction locks" requirement by maintaining an
 *   `auctionLocks` table with a unique constraint on `auctionId`.  Only one
 *   tab can hold the lock for a given auction at a time.
 *
 * Mechanism:
 *   1. acquireBidLock(auctionId) — runs a Dexie rw-transaction on auctionLocks:
 *        a. If no lock exists → insert a new lock record; return holderId.
 *        b. If a fresh lock exists (expiresAt > now) → throw LOCK_HELD → return null.
 *        c. If a stale lock exists (expiresAt ≤ now) → delete it, then insert;
 *           this handles tab-crash scenarios without a manual cleanup step.
 *      The unique &auctionId index makes the insert atomic: if two tabs reach
 *      step (a) simultaneously, exactly one add() succeeds and the other receives
 *      a ConstraintError, returning null.
 *
 *   2. releaseBidLock(auctionId, holderId) — deletes the lock record only when
 *      the stored heldBy matches holderId, preventing accidental releases after
 *      a stale-lock steal.
 *
 * Lock TTL: LOCK_TTL_MS (10 s).  Must comfortably exceed the maximum expected
 * bid transaction time (~100–500 ms) to avoid false stale-detection on slow
 * devices, while staying short enough to recover quickly after a tab crash.
 */

import { db } from '@/db'
import { generateId } from '@/crypto'

/** Milliseconds a lock lives before it is considered stale (default: 10 s). */
export const LOCK_TTL_MS = 10_000

/**
 * Attempt to acquire the per-auction bid lock.
 *
 * @returns The `holderId` string on success (use it in releaseBidLock).
 *          Returns `null` when the auction is already locked by another tab.
 */
export async function acquireBidLock(auctionId: string): Promise<string | null> {
  const holderId = generateId()
  const now = Date.now()

  try {
    await db.transaction('rw', db.auctionLocks, async () => {
      const existing = await db.auctionLocks
        .where('auctionId')
        .equals(auctionId)
        .first()

      if (existing) {
        if (existing.expiresAt > now) {
          // Active lock held by another tab
          throw new Error('LOCK_HELD')
        }
        // Stale lock — reclaim it before inserting ours
        await db.auctionLocks.delete(existing.id)
      }

      await db.auctionLocks.add({
        id: holderId,
        auctionId,
        heldBy: holderId,
        acquiredAt: now,
        expiresAt: now + LOCK_TTL_MS,
      })
    })
    return holderId
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message === 'LOCK_HELD' || err.name === 'ConstraintError')
    ) {
      return null
    }
    throw err
  }
}

/**
 * Release the per-auction bid lock.
 *
 * No-ops silently when the lock no longer exists or belongs to a different
 * holder (which can happen if a stale-lock steal occurred mid-flight).
 */
export async function releaseBidLock(auctionId: string, holderId: string): Promise<void> {
  const lock = await db.auctionLocks
    .where('auctionId')
    .equals(auctionId)
    .first()
  if (lock && lock.heldBy === holderId) {
    await db.auctionLocks.delete(lock.id)
  }
}
