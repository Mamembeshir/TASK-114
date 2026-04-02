/**
 * Integration tests for the publication approval workflow.
 * Tests: Draft → InReview → Approved | Rejected → Published
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  createPublication,
  submitForReview,
  approvePublication,
  rejectPublication,
  publishPublication,
} from '@/services/publicationService'

// ── Helpers ──────────────────────────────────────────────────────────────────

function pubPayload(overrides = {}) {
  return {
    title: 'Test Publication',
    type: 'Notice' as const,
    body: '<p>Content here</p>',
    attachmentUrls: [] as string[],
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.publications.clear(),
    db.publicationVersions.clear(),
    db.sensitiveWords.clear(),
    db.notifications.clear(),
    db.auditLogs.clear(),
    db.users.clear(),
  ])
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('publication workflow — Draft → InReview', () => {
  it('creates a publication in Draft status', async () => {
    const pub = await createPublication(pubPayload(), 'editor-1', 'Editor')
    expect(pub.status).toBe('Draft')
  })

  it('transitions to InReview on submitForReview', async () => {
    const pub = await createPublication(pubPayload(), 'editor-1', 'Editor')
    await submitForReview(pub.id, 'editor-1', 'Editor')
    const updated = await db.publications.get(pub.id)
    expect(updated?.status).toBe('InReview')
  })

  it('blocks submission if body contains flagged words', async () => {
    await db.sensitiveWords.add({
      id: 'sw-1',
      word: 'forbidden',
      createdBy: 'admin',
      createdAt: Date.now(),
    })
    const pub = await createPublication(
      pubPayload({ body: '<p>This is forbidden content</p>' }),
      'editor-1',
      'Editor',
    )
    await expect(submitForReview(pub.id, 'editor-1', 'Editor')).rejects.toThrow(
      /sensitive.*word|moderation/i,
    )
  })
})

describe('publication workflow — InReview → Approved / Rejected', () => {
  it('transitions to Approved on approvePublication', async () => {
    const pub = await createPublication(pubPayload(), 'editor-1', 'Editor')
    await submitForReview(pub.id, 'editor-1', 'Editor')
    await approvePublication(pub.id, 'reviewer-1', 'Reviewer', 'Looks good')
    const updated = await db.publications.get(pub.id)
    expect(updated?.status).toBe('Approved')
  })

  it('notifies author on approval', async () => {
    const pub = await createPublication(pubPayload(), 'editor-1', 'Editor')
    await submitForReview(pub.id, 'editor-1', 'Editor')
    await approvePublication(pub.id, 'reviewer-1', 'Reviewer')

    const notif = await db.notifications
      .where('userId')
      .equals('editor-1')
      .filter((n) => n.type === 'PublicationApproved')
      .first()
    expect(notif).toBeDefined()
  })

  it('transitions to Rejected on rejectPublication', async () => {
    const pub = await createPublication(pubPayload(), 'editor-1', 'Editor')
    await submitForReview(pub.id, 'editor-1', 'Editor')
    await rejectPublication(pub.id, 'reviewer-1', 'Reviewer', 'Needs revision')
    const updated = await db.publications.get(pub.id)
    expect(updated?.status).toBe('Rejected')
  })

  it('notifies author on rejection', async () => {
    const pub = await createPublication(pubPayload(), 'editor-1', 'Editor')
    await submitForReview(pub.id, 'editor-1', 'Editor')
    await rejectPublication(pub.id, 'reviewer-1', 'Reviewer', 'Needs revision')

    const notif = await db.notifications
      .where('userId')
      .equals('editor-1')
      .filter((n) => n.type === 'PublicationRejected')
      .first()
    expect(notif).toBeDefined()
  })

  it('rejects approval when not InReview', async () => {
    const pub = await createPublication(pubPayload(), 'editor-1', 'Editor')
    await expect(approvePublication(pub.id, 'reviewer-1', 'Reviewer')).rejects.toThrow()
  })
})

describe('publication workflow — Approved → Published', () => {
  it('transitions to Published on publishPublication', async () => {
    const pub = await createPublication(pubPayload(), 'editor-1', 'Editor')
    await submitForReview(pub.id, 'editor-1', 'Editor')
    await approvePublication(pub.id, 'reviewer-1', 'Reviewer')
    await publishPublication(pub.id, 'reviewer-1', 'Reviewer')

    const updated = await db.publications.get(pub.id)
    expect(updated?.status).toBe('Published')
    expect(updated?.publishedAt).toBeGreaterThan(0)
  })

  it('rejects publishing when not Approved', async () => {
    const pub = await createPublication(pubPayload(), 'editor-1', 'Editor')
    await submitForReview(pub.id, 'editor-1', 'Editor')
    await expect(publishPublication(pub.id, 'reviewer-1', 'Reviewer')).rejects.toThrow()
  })

  it('saves a version snapshot at each status transition', async () => {
    const pub = await createPublication(pubPayload(), 'editor-1', 'Editor')
    await submitForReview(pub.id, 'editor-1', 'Editor')
    await approvePublication(pub.id, 'reviewer-1', 'Reviewer')

    const versions = await db.publicationVersions.where('publicationId').equals(pub.id).toArray()
    // At least one version per transition (submit + approve)
    expect(versions.length).toBeGreaterThanOrEqual(2)
  })
})
