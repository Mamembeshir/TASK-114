/**
 * Unit tests for reviewService.
 *
 * Covers: submitReview (validation, moderation, update-existing),
 *         listItemReviews, getMyReview, removeReview
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  submitReview,
  listItemReviews,
  getMyReview,
  removeReview,
} from '@/services/reviewService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'
import type { CatalogItem, CatalogReview } from '@/types'

// ── Auth helpers ──────────────────────────────────────────────────────────────

function setUser(id: string, role: Role, displayName = id) {
  useAuthStore.setState({
    currentUser: {
      id,
      username: id,
      displayName,
      role,
      isActive: true,
      createdAt: Date.now(),
    },
  } as Parameters<typeof useAuthStore.setState>[0])
}

const setAdmin       = (id = 'admin-1')   => setUser(id, Role.Administrator, 'Admin')
const setReviewer    = (id = 'rev-1')     => setUser(id, Role.ReviewerApprover, 'Reviewer')
const setParticipant = (id = 'p-1')       => setUser(id, Role.Participant, 'Participant')
const setEditor      = (id = 'editor-1')  => setUser(id, Role.ContentEditor, 'Editor')

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function seedItem(overrides: Partial<CatalogItem> = {}): Promise<CatalogItem> {
  const item: CatalogItem = {
    id: 'item-seed',
    title: 'Test Item',
    description: 'A test catalog item',
    categoryId: 'cat-1',
    tags: [],
    price: 99,
    stock: 10,
    imageUrls: [],
    status: 'Active',
    moderationFlags: [],
    moderationStatus: 'Pending',
    salesCount: 0,
    ratingScore: 0,
    ratingCount: 0,
    createdBy: 'admin-1',
    createdAt: Date.now() - 1000,
    updatedAt: Date.now() - 1000,
    ...overrides,
  }
  await db.catalogItems.add(item)
  return item
}

async function seedReview(overrides: Partial<CatalogReview> = {}): Promise<CatalogReview> {
  const review: CatalogReview = {
    id: 'review-seed',
    itemId: 'item-seed',
    userId: 'p-1',
    username: 'Participant',
    rating: 4,
    comment: 'Great item',
    moderationFlags: [],
    status: 'Approved',
    createdAt: Date.now() - 500,
    updatedAt: Date.now() - 500,
    ...overrides,
  }
  await db.catalogReviews.add(review)
  return review
}

// ── Teardown ──────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.catalogItems.clear()
  await db.catalogReviews.clear()
  await db.auditLogs.clear()
  await db.sensitiveWords.clear()
})

// ── submitReview ──────────────────────────────────────────────────────────────

describe('submitReview', () => {
  it('allows Participant to submit a review for an Active item', async () => {
    setParticipant('p-1')
    await seedItem()
    const review = await submitReview('item-seed', 5, 'Excellent!')
    expect(review.id).toBeTruthy()
    expect(review.rating).toBe(5)
    expect(review.comment).toBe('Excellent!')
    expect(review.userId).toBe('p-1')
    expect(review.status).toBe('Approved')
  })

  it('allows ReviewerApprover to submit a review', async () => {
    setReviewer('rev-1')
    await seedItem()
    const review = await submitReview('item-seed', 3, 'Decent')
    expect(review.userId).toBe('rev-1')
    expect(review.status).toBe('Approved')
  })

  it('allows ContentEditor to submit a review', async () => {
    setEditor('editor-1')
    await seedItem()
    const review = await submitReview('item-seed', 4, 'Good product')
    expect(review.userId).toBe('editor-1')
  })

  it('allows Admin to submit a review', async () => {
    setAdmin('admin-1')
    await seedItem()
    const review = await submitReview('item-seed', 2, 'Not great')
    expect(review.userId).toBe('admin-1')
  })

  it('throws for rating below 1', async () => {
    setParticipant('p-1')
    await seedItem()
    await expect(submitReview('item-seed', 0, 'Bad')).rejects.toThrow(
      'Rating must be an integer between 1 and 5',
    )
  })

  it('throws for rating above 5', async () => {
    setParticipant('p-1')
    await seedItem()
    await expect(submitReview('item-seed', 6, 'Too high')).rejects.toThrow(
      'Rating must be an integer between 1 and 5',
    )
  })

  it('throws for non-integer rating', async () => {
    setParticipant('p-1')
    await seedItem()
    await expect(submitReview('item-seed', 3.5, 'Half star')).rejects.toThrow(
      'Rating must be an integer between 1 and 5',
    )
  })

  it('throws when catalog item does not exist', async () => {
    setParticipant('p-1')
    await expect(submitReview('no-such-item', 5, 'Great')).rejects.toThrow(
      'Catalog item not found',
    )
  })

  it('throws when item is not Active (Draft)', async () => {
    setParticipant('p-1')
    await seedItem({ status: 'Draft' })
    await expect(submitReview('item-seed', 4, 'Good')).rejects.toThrow(
      'Reviews can only be submitted for active items',
    )
  })

  it('throws when item is Archived', async () => {
    setParticipant('p-1')
    await seedItem({ status: 'Archived' })
    await expect(submitReview('item-seed', 3, 'Okay')).rejects.toThrow(
      'Reviews can only be submitted for active items',
    )
  })

  it('updates existing review instead of creating a duplicate', async () => {
    setParticipant('p-1')
    await seedItem()
    await seedReview({ rating: 3, comment: 'Original' })
    const updated = await submitReview('item-seed', 5, 'Updated opinion')
    expect(updated.id).toBe('review-seed')
    expect(updated.rating).toBe(5)
    expect(updated.comment).toBe('Updated opinion')
    const all = await db.catalogReviews.toArray()
    expect(all).toHaveLength(1)
  })

  it('flags review when comment contains a sensitive word', async () => {
    await db.sensitiveWords.add({ id: 'sw-1', word: 'badword', createdAt: Date.now(), createdBy: 'admin-1' })
    setParticipant('p-1')
    await seedItem()
    const review = await submitReview('item-seed', 4, 'This is a badword comment')
    expect(review.status).toBe('Flagged')
    expect(review.moderationFlags).toContain('badword')
  })

  it('approves review with clean comment', async () => {
    await db.sensitiveWords.add({ id: 'sw-1', word: 'badword', createdAt: Date.now(), createdBy: 'admin-1' })
    setParticipant('p-1')
    await seedItem()
    const review = await submitReview('item-seed', 5, 'Clean comment here')
    expect(review.status).toBe('Approved')
    expect(review.moderationFlags).toHaveLength(0)
  })

  it('updates item ratingScore and ratingCount after first review', async () => {
    setParticipant('p-1')
    await seedItem({ ratingScore: 0, ratingCount: 0 })
    await submitReview('item-seed', 4, 'Nice')
    const item = await db.catalogItems.get('item-seed')
    expect(item!.ratingScore).toBe(4)
    expect(item!.ratingCount).toBe(1)
  })

  it('updates aggregated rating after a second reviewer submits', async () => {
    setParticipant('p-1')
    await seedItem()
    await submitReview('item-seed', 4, 'Good')
    setParticipant('p-2')
    await submitReview('item-seed', 2, 'Not great')
    const item = await db.catalogItems.get('item-seed')
    expect(item!.ratingCount).toBe(2)
    expect(item!.ratingScore).toBe(6) // 4 + 2
  })

  it('writes an audit log entry', async () => {
    setParticipant('p-1')
    await seedItem()
    const review = await submitReview('item-seed', 5, 'Perfect')
    const logs = await db.auditLogs.toArray()
    const entry = logs.find((l) => l.entityId === review.id)
    expect(entry).toBeDefined()
    expect(entry!.eventType).toBe('catalog.review_submitted')
  })

  it('writes update audit log when updating existing review', async () => {
    setParticipant('p-1')
    await seedItem()
    await seedReview()
    await submitReview('item-seed', 1, 'Changed my mind')
    const logs = await db.auditLogs.toArray()
    const entry = logs.find(
      (l) => l.entityId === 'review-seed' && l.eventType === 'catalog.review_submitted',
    )
    expect(entry).toBeDefined()
  })

  it('rejects unauthenticated user (no viewCatalog)', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await seedItem()
    await expect(submitReview('item-seed', 5, 'Great')).rejects.toThrow()
  })
})

// ── listItemReviews ───────────────────────────────────────────────────────────

describe('listItemReviews', () => {
  it('returns Approved reviews only', async () => {
    await seedItem()
    await seedReview({ id: 'r1', userId: 'p-1', status: 'Approved' })
    await seedReview({ id: 'r2', userId: 'p-2', status: 'Flagged' })
    await seedReview({ id: 'r3', userId: 'p-3', status: 'Removed' })
    const reviews = await listItemReviews('item-seed')
    expect(reviews).toHaveLength(1)
    expect(reviews[0].id).toBe('r1')
  })

  it('returns empty array when no reviews exist', async () => {
    await seedItem()
    const reviews = await listItemReviews('item-seed')
    expect(reviews).toHaveLength(0)
  })

  it('returns reviews sorted newest first', async () => {
    await seedItem()
    await seedReview({ id: 'r-old', userId: 'p-1', status: 'Approved', createdAt: 1000 })
    await seedReview({ id: 'r-new', userId: 'p-2', status: 'Approved', createdAt: 2000 })
    const reviews = await listItemReviews('item-seed')
    expect(reviews[0].id).toBe('r-new')
    expect(reviews[1].id).toBe('r-old')
  })

  it('does not return reviews for a different item', async () => {
    await seedItem()
    await seedReview({ id: 'r1', itemId: 'item-seed', userId: 'p-1', status: 'Approved' })
    await seedReview({ id: 'r2', itemId: 'other-item', userId: 'p-2', status: 'Approved' })
    const reviews = await listItemReviews('item-seed')
    expect(reviews).toHaveLength(1)
    expect(reviews[0].id).toBe('r1')
  })

  it('is callable without authentication (public endpoint)', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await seedItem()
    await seedReview()
    const reviews = await listItemReviews('item-seed')
    expect(reviews).toHaveLength(1)
  })
})

// ── getMyReview ───────────────────────────────────────────────────────────────

describe('getMyReview', () => {
  it('returns own review for an item', async () => {
    setParticipant('p-1')
    await seedItem()
    await seedReview()
    const review = await getMyReview('item-seed')
    expect(review).not.toBeNull()
    expect(review!.id).toBe('review-seed')
  })

  it('returns null when no review exists for the item', async () => {
    setParticipant('p-1')
    await seedItem()
    const review = await getMyReview('item-seed')
    expect(review).toBeNull()
  })

  it('returns flagged reviews (not just Approved)', async () => {
    setParticipant('p-1')
    await seedItem()
    await seedReview({ status: 'Flagged' })
    const review = await getMyReview('item-seed')
    expect(review).not.toBeNull()
    expect(review!.status).toBe('Flagged')
  })

  it('returns removed reviews (any status returned)', async () => {
    setParticipant('p-1')
    await seedItem()
    await seedReview({ status: 'Removed' })
    const review = await getMyReview('item-seed')
    expect(review).not.toBeNull()
    expect(review!.status).toBe('Removed')
  })

  it('does not return another user\'s review', async () => {
    setParticipant('p-1')
    await seedItem()
    await seedReview({ userId: 'other-user' })
    const review = await getMyReview('item-seed')
    expect(review).toBeNull()
  })
})

// ── removeReview ──────────────────────────────────────────────────────────────

describe('removeReview', () => {
  it('allows Admin to remove a review', async () => {
    setAdmin('admin-1')
    await seedItem()
    await seedReview()
    await removeReview('review-seed')
    const stored = await db.catalogReviews.get('review-seed')
    expect(stored!.status).toBe('Removed')
  })

  it('allows ReviewerApprover to remove a review', async () => {
    setReviewer('rev-1')
    await seedItem()
    await seedReview()
    await removeReview('review-seed')
    const stored = await db.catalogReviews.get('review-seed')
    expect(stored!.status).toBe('Removed')
  })

  it('rejects Participant (no moderateCatalogItem)', async () => {
    setParticipant('p-1')
    await seedItem()
    await seedReview()
    await expect(removeReview('review-seed')).rejects.toThrow(/Forbidden/)
  })

  it('rejects ContentEditor (no moderateCatalogItem)', async () => {
    setEditor('editor-1')
    await seedItem()
    await seedReview()
    await expect(removeReview('review-seed')).rejects.toThrow(/Forbidden/)
  })

  it('throws when review does not exist', async () => {
    setAdmin()
    await expect(removeReview('no-such-review')).rejects.toThrow('Review not found')
  })

  it('updates ratingScore/ratingCount after removal', async () => {
    setAdmin('admin-1')
    await seedItem({ ratingScore: 4, ratingCount: 1 })
    await seedReview({ rating: 4, status: 'Approved' })
    await removeReview('review-seed')
    const item = await db.catalogItems.get('item-seed')
    expect(item!.ratingCount).toBe(0)
    expect(item!.ratingScore).toBe(0)
  })

  it('does not reduce ratingCount for a Flagged review (not counted)', async () => {
    setAdmin('admin-1')
    await seedItem({ ratingScore: 0, ratingCount: 0 })
    await seedReview({ rating: 4, status: 'Flagged' })
    await removeReview('review-seed')
    const item = await db.catalogItems.get('item-seed')
    // Flagged reviews are not counted in aggregation, so count stays 0
    expect(item!.ratingCount).toBe(0)
  })

  it('writes an audit log entry', async () => {
    setAdmin('admin-1')
    await seedItem()
    await seedReview()
    await removeReview('review-seed')
    const logs = await db.auditLogs.toArray()
    const entry = logs.find((l) => l.eventType === 'catalog.review_removed')
    expect(entry).toBeDefined()
    expect(entry!.entityId).toBe('review-seed')
  })
})
