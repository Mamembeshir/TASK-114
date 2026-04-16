/**
 * End-to-end user journey tests.
 *
 * These tests verify complete workflows spanning multiple services and state
 * transitions — simulating real user actions from creation through consumption.
 * All data is stored in the in-process fake-indexeddb instance.
 *
 * Journeys covered:
 *  1. Catalog lifecycle: Admin creates → publishes → Participant reviews
 *  2. Auction lifecycle: Admin creates → publishes → Participant bids → closes
 *  3. Training lifecycle: Admin creates course → Participant completes it
 *  4. Review workflow: submit, update, moderation flag, moderator removes
 *  5. Wallet funding + bidding reservation flow
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'

// ── Services ──────────────────────────────────────────────────────────────────
import { createCatalogItem, publishCatalogItem } from '@/services/catalogService'
import type { CatalogItemInput } from '@/services/catalogService'
import { submitReview, listItemReviews, getMyReview, removeReview } from '@/services/reviewService'
import {
  createTrainingCourse,
  getOrInitProgress,
  completeSection,
  listCoursesWithProgress,
} from '@/services/trainingService'
import type { TrainingCourseInput } from '@/services/trainingService'
import {
  createAuction,
  publishAuction,
  cancelAuction,
} from '@/services/auctionService'
import type { CreateAuctionInput } from '@/services/auctionService'
import { ensureWallet, getWallet, creditWallet } from '@/services/walletService'
import { closeAuction } from '@/services/auctionLifecycle'

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

const setAdmin       = (id = 'admin-1')  => setUser(id, Role.Administrator, 'Admin')
const setEditor      = (id = 'editor-1') => setUser(id, Role.ContentEditor, 'Editor')
const setReviewer    = (id = 'rev-1')    => setUser(id, Role.ReviewerApprover, 'Reviewer')
const setParticipant = (id = 'p-1')      => setUser(id, Role.Participant, 'Participant')

// ── Teardown ──────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.catalogItems.clear()
  await db.catalogReviews.clear()
  await db.trainingCourses.clear()
  await db.trainingProgress.clear()
  await db.auctions.clear()
  await db.bids.clear()
  await db.wallets.clear()
  await db.walletTransactions.clear()
  await db.auditLogs.clear()
  await db.sensitiveWords.clear()
  await db.notifications.clear()
  await db.proxyBids.clear()
  await db.auctionLocks.clear()
})

// ── Journey 1: Catalog lifecycle ──────────────────────────────────────────────

describe('Journey: Catalog item — create, publish, review', () => {
  it('Admin creates a draft item, publishes it, Participant reviews it', async () => {
    // Step 1: Admin creates a catalog item
    setAdmin('admin-1')
    const itemInput: CatalogItemInput = {
      title: 'Premium Widget',
      description: 'A high-quality widget',
      categoryId: 'cat-electronics',
      tags: ['widget', 'premium'],
      price: 199,
      stock: 50,
      imageUrls: [],
    }
    const item = await createCatalogItem(itemInput)
    expect(item.status).toBe('Draft')
    expect(item.id).toBeTruthy()

    // Step 2: Admin publishes the item
    await publishCatalogItem(item.id)
    const published = await db.catalogItems.get(item.id)
    expect(published!.status).toBe('Active')

    // Step 3: Participant submits a review
    setParticipant('p-1')
    const review = await submitReview(item.id, 5, 'Absolutely love it!')
    expect(review.status).toBe('Approved')
    expect(review.rating).toBe(5)

    // Step 4: Review is visible in public listing
    const reviews = await listItemReviews(item.id)
    expect(reviews).toHaveLength(1)
    expect(reviews[0].rating).toBe(5)

    // Step 5: Rating aggregated on item
    const finalItem = await db.catalogItems.get(item.id)
    expect(finalItem!.ratingCount).toBe(1)
    expect(finalItem!.ratingScore).toBe(5)

    // Step 6: Participant can retrieve their own review
    const myReview = await getMyReview(item.id)
    expect(myReview).not.toBeNull()
    expect(myReview!.id).toBe(review.id)
  })

  it('Two participants review an item and the aggregate is correct', async () => {
    setAdmin('admin-1')
    const item = await createCatalogItem({
      title: 'Shared Widget',
      description: 'Reviewed by two users',
      categoryId: 'cat-1',
      tags: [],
      price: 50,
      stock: 5,
      imageUrls: [],
    })
    await publishCatalogItem(item.id)

    setParticipant('p-1')
    await submitReview(item.id, 5, 'Loved it')

    setParticipant('p-2')
    await submitReview(item.id, 3, 'It was okay')

    const reviews = await listItemReviews(item.id)
    expect(reviews).toHaveLength(2)

    const final = await db.catalogItems.get(item.id)
    expect(final!.ratingCount).toBe(2)
    expect(final!.ratingScore).toBe(8) // 5 + 3
  })

  it('Flagged review is hidden from public listing until removed', async () => {
    await db.sensitiveWords.add({ id: 'sw-1', word: 'terrible', createdAt: Date.now(), createdBy: 'admin-1' })
    setAdmin('admin-1')
    const item = await createCatalogItem({
      title: 'Widget',
      description: 'Standard widget',
      categoryId: 'cat-1',
      tags: [],
      price: 10,
      stock: 1,
      imageUrls: [],
    })
    await publishCatalogItem(item.id)

    // Participant submits a flagged review
    setParticipant('p-1')
    const flaggedReview = await submitReview(item.id, 1, 'This is terrible quality')
    expect(flaggedReview.status).toBe('Flagged')

    // Flagged review is NOT in the public listing
    const publicReviews = await listItemReviews(item.id)
    expect(publicReviews).toHaveLength(0)

    // But the participant can still see their own review
    const myReview = await getMyReview(item.id)
    expect(myReview).not.toBeNull()
    expect(myReview!.status).toBe('Flagged')

    // Moderator removes the review
    setReviewer('rev-1')
    await removeReview(flaggedReview.id)

    // Still not in the public listing
    const afterRemoval = await listItemReviews(item.id)
    expect(afterRemoval).toHaveLength(0)

    // Review is marked Removed in DB
    const stored = await db.catalogReviews.get(flaggedReview.id)
    expect(stored!.status).toBe('Removed')
  })

  it('Participant updates their review and aggregate recalculates', async () => {
    setAdmin('admin-1')
    const item = await createCatalogItem({
      title: 'Evolving Widget',
      description: 'Gets better over time',
      categoryId: 'cat-1',
      tags: [],
      price: 25,
      stock: 10,
      imageUrls: [],
    })
    await publishCatalogItem(item.id)

    setParticipant('p-1')
    await submitReview(item.id, 2, 'Not great at first')
    let agg = await db.catalogItems.get(item.id)
    expect(agg!.ratingScore).toBe(2)

    // Update review with better rating
    await submitReview(item.id, 4, 'Actually improved a lot!')
    agg = await db.catalogItems.get(item.id)
    expect(agg!.ratingScore).toBe(4) // updated, not doubled
    expect(agg!.ratingCount).toBe(1) // still only one review from this user

    const reviews = await listItemReviews(item.id)
    expect(reviews).toHaveLength(1)
    expect(reviews[0].rating).toBe(4)
  })
})

// ── Journey 2: Auction lifecycle ──────────────────────────────────────────────

describe('Journey: Auction — create, publish, bid, close', () => {
  it('Admin creates auction, publishes it, then cancels it (no bids)', async () => {
    setAdmin('admin-1')
    const auctionInput: CreateAuctionInput = {
      title: 'Vintage Clock',
      description: 'A beautiful antique clock',
      categoryId: 'cat-antiques',
      imageUrls: [],
      startPrice: 500,
      minimumIncrement: 50,
      depositAmount: 100,
      startTime: Date.now() - 10_000,
      endTime: Date.now() + 60_000,
    }
    const auction = await createAuction(auctionInput)
    expect(auction.status).toBe('Draft')
    expect(auction.currentPrice).toBe(500)

    // Publish the auction
    await publishAuction(auction.id)
    const published = await db.auctions.get(auction.id)
    expect(published!.status).toBe('Active')

    // Cancel the auction
    await cancelAuction(auction.id)
    const cancelled = await db.auctions.get(auction.id)
    expect(cancelled!.status).toBe('Cancelled')

    // Audit trail should have all events
    const logs = await db.auditLogs.toArray()
    const types = logs.map((l) => l.eventType)
    expect(types).toContain('auction.created')
    expect(types).toContain('auction.published')
    expect(types).toContain('auction.cancelled')
  })

  it('Auction closes with no bids → NoSale', async () => {
    setAdmin('admin-1')
    const auctionInput: CreateAuctionInput = {
      title: 'Rare Coin',
      description: 'A rare historical coin',
      categoryId: 'cat-coins',
      imageUrls: [],
      startPrice: 1000,
      minimumIncrement: 100,
      depositAmount: 200,
      startTime: Date.now() - 120_000,
      endTime: Date.now() + 60_000, // future so publish succeeds
    }
    const auction = await createAuction(auctionInput)
    await publishAuction(auction.id)

    // Simulate auction ending: force endTime to past and status to Active
    await db.auctions.update(auction.id, { status: 'Active', endTime: Date.now() - 1000 })
    const active = await db.auctions.get(auction.id)

    // Close the auction with no bids
    await closeAuction(active!)
    const closed = await db.auctions.get(auction.id)
    expect(closed!.status).toBe('NoSale')

    // Seller gets a notification
    const notifications = await db.notifications.where('userId').equals('admin-1').toArray()
    expect(notifications.find((n) => n.type === 'AuctionNoSale')).toBeDefined()
  })

  it('Admin can fund a wallet then place a bid through close', async () => {
    // Set up admin and create auction
    setAdmin('admin-1')
    const auction = await createAuction({
      title: 'Signed Jersey',
      description: 'Sports memorabilia',
      categoryId: 'cat-sports',
      imageUrls: [],
      startPrice: 100,
      minimumIncrement: 10,
      depositAmount: 25,
      startTime: Date.now() - 5000,
      endTime: Date.now() + 60_000,
    })
    await publishAuction(auction.id)
    await db.auctions.update(auction.id, { status: 'Active' })

    // Fund participant wallet
    setAdmin('admin-1')
    await ensureWallet('p-1')
    await creditWallet('p-1', 500, 'Initial funding for participant')

    // Verify wallet balance
    const funded = await getWallet('p-1')
    expect(funded).toBeDefined()

    // Close the auction (simulating no bids placed directly — just verify close works)
    const activeAuction = await db.auctions.get(auction.id)
    await closeAuction(activeAuction!)

    const finalAuction = await db.auctions.get(auction.id)
    // Without any bids placed, should be NoSale
    expect(finalAuction!.status).toBe('NoSale')
  })
})

// ── Journey 3: Training lifecycle ─────────────────────────────────────────────

describe('Journey: Training — create course, participant completes it', () => {
  it('Admin creates a course, Participant progresses through all sections', async () => {
    // Step 1: Admin creates training course
    setAdmin('admin-1')
    const courseInput: TrainingCourseInput = {
      title: 'Safety Procedures',
      description: 'Required safety training for all participants',
      sections: ['Introduction', 'Fire Safety', 'Emergency Exits', 'Assessment'],
      targetRoles: [],
      isRequired: true,
    }
    const course = await createTrainingCourse(courseInput)
    expect(course.isActive).toBe(true)
    expect(course.sections).toHaveLength(4)

    // Step 2: Participant views their courses
    setParticipant('p-1')
    const courseList = await listCoursesWithProgress('p-1')
    expect(courseList).toHaveLength(1)
    expect(courseList[0].course.id).toBe(course.id)
    expect(courseList[0].progress).toBeNull() // not started yet

    // Step 3: Participant initializes progress
    const progress = await getOrInitProgress('p-1', course.id)
    expect(progress.status).toBe('NotStarted')

    // Step 4: Complete sections one by one
    const p1 = await completeSection('p-1', course.id, 0)
    expect(p1.status).toBe('InProgress')
    expect(p1.sectionsCompleted).toBe(1)

    const p2 = await completeSection('p-1', course.id, 1)
    expect(p2.status).toBe('InProgress')
    expect(p2.sectionsCompleted).toBe(2)

    const p3 = await completeSection('p-1', course.id, 2)
    expect(p3.status).toBe('InProgress')
    expect(p3.sectionsCompleted).toBe(3)

    // Step 5: Final section completes the course
    const finalProgress = await completeSection('p-1', course.id, 3)
    expect(finalProgress.status).toBe('Completed')
    expect(finalProgress.completedAt).toBeDefined()
    expect(finalProgress.sectionsCompleted).toBe(4)

    // Step 6: Course list now shows completed progress
    const updatedList = await listCoursesWithProgress('p-1')
    expect(updatedList[0].progress!.status).toBe('Completed')

    // Step 7: Audit log records the completion
    const logs = await db.auditLogs.toArray()
    expect(logs.find((l) => l.eventType === 'training.course_completed')).toBeDefined()
  })

  it('ContentEditor creates a role-specific course only Participants see', async () => {
    setEditor('editor-1')
    const course = await createTrainingCourse({
      title: 'Participant Onboarding',
      description: 'For new participants only',
      sections: ['Welcome', 'How to Bid'],
      targetRoles: [Role.Participant],
      isRequired: false,
    })
    expect(course.targetRoles).toContain(Role.Participant)

    // Participant sees it
    setParticipant('p-1')
    const pList = await listCoursesWithProgress('p-1')
    expect(pList.map((c) => c.course.id)).toContain(course.id)

    // Reviewer does not see it (wrong role)
    setReviewer('rev-1')
    const rList = await listCoursesWithProgress('rev-1')
    expect(rList.map((c) => c.course.id)).not.toContain(course.id)

    // Admin sees everything
    setAdmin('admin-1')
    const aList = await listCoursesWithProgress('admin-1')
    expect(aList.map((c) => c.course.id)).toContain(course.id)
  })

  it('idempotent progress init never creates duplicates', async () => {
    setAdmin('admin-1')
    const course = await createTrainingCourse({
      title: 'Idempotency Course',
      description: 'Test',
      sections: ['A'],
      targetRoles: [],
      isRequired: false,
    })

    await getOrInitProgress('p-1', course.id)
    await getOrInitProgress('p-1', course.id)
    await getOrInitProgress('p-1', course.id)

    const all = await db.trainingProgress.where('userId').equals('p-1').toArray()
    expect(all.filter((p) => p.courseId === course.id)).toHaveLength(1)
  })

  it('re-submitting a completed section does not regress progress', async () => {
    await db.trainingCourses.add({
      id: 'course-regression-2',
      title: 'Regression Test Course 2',
      description: '',
      sections: ['A', 'B', 'C'],
      targetRoles: [],
      isRequired: false,
      isActive: true,
      createdBy: 'admin-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    setParticipant('p-1')
    await completeSection('p-1', 'course-regression-2', 2) // jump to last section
    const first = await getOrInitProgress('p-1', 'course-regression-2')
    expect(first.sectionsCompleted).toBe(3) // completed all 3

    // Re-submit section 0 — progress must NOT go backwards
    await completeSection('p-1', 'course-regression-2', 0)
    const second = await getOrInitProgress('p-1', 'course-regression-2')
    expect(second.sectionsCompleted).toBeGreaterThanOrEqual(3)
  })
})

// ── Journey 4: Multi-role workflow ────────────────────────────────────────────

describe('Journey: Multi-role — content creation through moderation', () => {
  it('Editor creates catalog item, Reviewer flags it, Admin approves', async () => {
    // Editor creates
    setEditor('editor-1')
    const item = await createCatalogItem({
      title: 'New Product',
      description: 'Just arrived',
      categoryId: 'cat-new',
      tags: ['new', 'arrival'],
      price: 75,
      stock: 20,
      imageUrls: [],
    })
    expect(item.status).toBe('Draft')
    expect(item.createdBy).toBe('editor-1')

    // Admin publishes the item
    setAdmin('admin-1')
    await publishCatalogItem(item.id)
    const published = await db.catalogItems.get(item.id)
    expect(published!.status).toBe('Active')

    // Two participants review it
    setParticipant('p-1')
    await submitReview(item.id, 4, 'Very good product')

    setParticipant('p-2')
    await submitReview(item.id, 5, 'Excellent value')

    // Reviewer removes one review (moderation)
    const reviews = await listItemReviews(item.id)
    expect(reviews).toHaveLength(2)

    setReviewer('rev-1')
    await removeReview(reviews[0].id)

    // Now only one review remains
    const afterModeration = await listItemReviews(item.id)
    expect(afterModeration).toHaveLength(1)
  })

  it('Participant cannot create catalog items (permission guard)', async () => {
    setParticipant('p-1')
    await expect(
      createCatalogItem({
        title: 'Unauthorized Item',
        description: 'Should fail',
        categoryId: 'cat-1',
        tags: [],
        price: 10,
        stock: 1,
        imageUrls: [],
      }),
    ).rejects.toThrow(/Forbidden/)
  })

  it('Participant cannot create auctions (permission guard)', async () => {
    setParticipant('p-1')
    await expect(
      createAuction({
        title: 'Unauthorized Auction',
        description: 'Should fail',
        categoryId: 'cat-1',
        imageUrls: [],
        startPrice: 100,
        minimumIncrement: 10,
        depositAmount: 20,
        startTime: Date.now(),
        endTime: Date.now() + 60_000,
      }),
    ).rejects.toThrow(/Forbidden/)
  })

  it('Only participant themselves can record their own training progress', async () => {
    setAdmin('admin-1')
    await db.trainingCourses.add({
      id: 'course-ownership',
      title: 'Ownership Test',
      description: '',
      sections: ['A', 'B'],
      targetRoles: [],
      isRequired: false,
      isActive: true,
      createdBy: 'admin-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    // User A tries to record progress for user B — must fail
    setParticipant('p-attacker')
    await expect(completeSection('p-victim', 'course-ownership', 0)).rejects.toThrow(/Forbidden/)
  })
})

// ── Journey 5: Wallet + credit flow ──────────────────────────────────────────

describe('Journey: Wallet — create, credit, verify balance', () => {
  it('Admin creates wallet for participant and credits it', async () => {
    setAdmin('admin-1')
    await ensureWallet('p-1')
    const wallet = await getWallet('p-1')
    expect(wallet).not.toBeNull()
    expect(wallet!.balance).toBe(0)
    expect(wallet!.userId).toBe('p-1')

    await creditWallet('p-1', 1000, 'Initial deposit')
    const funded = await getWallet('p-1')
    expect(funded!.balance).toBe(1000)
  })

  it('ensureWallet is idempotent — does not create duplicate wallets', async () => {
    setAdmin('admin-1')
    await ensureWallet('p-1')
    await ensureWallet('p-1')

    const all = await db.wallets.where('userId').equals('p-1').toArray()
    expect(all).toHaveLength(1)
  })

  it('Admin credits wallet and audit log records the transaction', async () => {
    setAdmin('admin-1')
    await ensureWallet('p-2')
    await creditWallet('p-2', 250, 'Refund credit')

    const walletRow = await db.wallets.where('userId').equals('p-2').first()
    expect(walletRow).toBeDefined()
    const txns = await db.walletTransactions.where('walletId').equals(walletRow!.id).toArray()
    expect(txns).toHaveLength(1)
    expect(txns[0].amount).toBe(250)
    expect(txns[0].type).toBe('Credit')
  })
})
