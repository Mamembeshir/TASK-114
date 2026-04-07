/**
 * reviewService — submit, list, and moderate catalog item reviews.
 *
 * Rules:
 *  - One review per user per item (enforced at service level).
 *  - Comment is run through the sensitive-word moderation engine; flagged
 *    reviews land in status 'Flagged' and are excluded from public listing
 *    until a moderator explicitly approves them (via remove/re-submit flow).
 *    Clean comments get status 'Approved' immediately.
 *  - Removing a review requires `moderateCatalogItem` permission.
 *  - After every submit/remove the item's ratingScore + ratingCount are
 *    recomputed from all Approved reviews (aggregate update).
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import { writeAuditLog } from '@/utils/audit'
import { moderateContent } from '@/utils/moderation'
import { requirePermission } from '@/utils/permissions'
import { useAuthStore } from '@/store/authStore'
import type { CatalogReview } from '@/types'

// ── Aggregation helper ─────────────────────────────────────────────────────────

async function reAggregateRatings(itemId: string): Promise<void> {
  const approved = await db.catalogReviews
    .where('[itemId+userId]')
    .between([itemId, Dexie.minKey], [itemId, Dexie.maxKey])
    .filter((r) => r.status === 'Approved')
    .toArray()

  const ratingCount = approved.length
  const ratingScore = approved.reduce((sum, r) => sum + r.rating, 0)
  await db.catalogItems.update(itemId, { ratingScore, ratingCount, updatedAt: Date.now() })
}

// Import Dexie for key helpers — using the same instance imported via db avoids
// a second Dexie instance; we just need the static key sentinels.
import Dexie from 'dexie'

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Submit (or update) a review for a catalog item.
 * Replaces an existing review from the same user if one already exists.
 */
export async function submitReview(
  itemId: string,
  rating: number,
  comment: string,
): Promise<CatalogReview> {
  requirePermission('viewCatalog')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName

  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    throw new Error('Rating must be an integer between 1 and 5')
  }
  const item = await db.catalogItems.get(itemId)
  if (!item) throw new Error('Catalog item not found')
  if (item.status !== 'Active') throw new Error('Reviews can only be submitted for active items')

  // Enforce one-review-per-user per item (update existing if found)
  const existing = await db.catalogReviews
    .where('[itemId+userId]')
    .equals([itemId, actorId])
    .first()

  const moderationFlags = await moderateContent([comment])
  const status = moderationFlags.length > 0 ? 'Flagged' : 'Approved'

  if (existing) {
    const updated: CatalogReview = {
      ...existing,
      rating,
      comment,
      moderationFlags,
      status,
      updatedAt: Date.now(),
    }
    await db.catalogReviews.put(updated)
    await reAggregateRatings(itemId)
    await writeAuditLog({
      eventType: 'catalog.review_submitted',
      actorId,
      actorName,
      entityType: 'CatalogReview',
      entityId: existing.id,
      description: `${actorName} updated their review for "${item.title}" (rating: ${String(rating)}/5)`,
      metadata: { itemId, rating, status, moderationFlags },
    })
    return updated
  }

  const review: CatalogReview = {
    id: generateId(),
    itemId,
    userId: actorId,
    username: actorName,
    rating,
    comment,
    moderationFlags,
    status,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.catalogReviews.add(review)
  await reAggregateRatings(itemId)
  await writeAuditLog({
    eventType: 'catalog.review_submitted',
    actorId,
    actorName,
    entityType: 'CatalogReview',
    entityId: review.id,
    description: `${actorName} submitted a review for "${item.title}" (rating: ${String(rating)}/5)`,
    metadata: { itemId, rating, status, moderationFlags },
  })
  return review
}

/** Returns all Approved reviews for a given item, newest first. */
export async function listItemReviews(itemId: string): Promise<CatalogReview[]> {
  const all = await db.catalogReviews
    .where('[itemId+userId]')
    .between([itemId, Dexie.minKey], [itemId, Dexie.maxKey])
    .toArray()
  return all.filter((r) => r.status === 'Approved').sort((a, b) => b.createdAt - a.createdAt)
}

/** Returns the current user's own review for an item, if any (any status). */
export async function getMyReview(itemId: string, userId: string): Promise<CatalogReview | null> {
  const found = await db.catalogReviews
    .where('[itemId+userId]')
    .equals([itemId, userId])
    .first()
  return found ?? null
}

/**
 * Moderator removes a review (sets status to Removed, excluded from listing).
 * Requires `moderateCatalogItem` permission.
 */
export async function removeReview(
  reviewId: string,
): Promise<void> {
  requirePermission('moderateCatalogItem')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const review = await db.catalogReviews.get(reviewId)
  if (!review) throw new Error('Review not found')
  await db.catalogReviews.update(reviewId, { status: 'Removed', updatedAt: Date.now() })
  await reAggregateRatings(review.itemId)
  const item = await db.catalogItems.get(review.itemId)
  await writeAuditLog({
    eventType: 'catalog.review_removed',
    actorId,
    actorName,
    entityType: 'CatalogReview',
    entityId: reviewId,
    description: `${actorName} removed a review by ${review.username} on "${item?.title ?? review.itemId}"`,
    metadata: { itemId: review.itemId, reviewUserId: review.userId },
  })
}
