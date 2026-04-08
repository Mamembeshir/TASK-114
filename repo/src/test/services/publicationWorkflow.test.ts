/**
 * Integration tests for the publication approval workflow.
 * Tests: Draft → InReview → Approved | Rejected → Published
 *
 * Services now derive actor identity from useAuthStore — each test step
 * sets the appropriate authenticated user before calling the service.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  createPublication,
  updatePublication,
  submitForReview,
  approvePublication,
  rejectPublication,
  publishPublication,
} from '@/services/publicationService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'

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

const setEditor   = (id = 'editor-1')   => setUser(id, Role.ContentEditor, 'Editor')
const setReviewer = (id = 'reviewer-1') => setUser(id, Role.ReviewerApprover, 'Reviewer')
const setAdmin    = (id = 'admin-1')    => setUser(id, Role.Administrator, 'Admin')

// ── Helpers ──────────────────────────────────────────────────────────────────

function pubPayload(overrides = {}) {
  return {
    title: 'Test Publication',
    type: 'Notice' as const,
    body: '<p>Content here</p>',
    attachmentUrls: [] as string[],
    audienceRoles: [] as Role[],
    audienceOrgs: [] as string[],
    audienceTags: [] as string[],
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
  setEditor()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('publication workflow — Draft → InReview', () => {
  it('creates a publication in Draft status', async () => {
    setEditor()
    const pub = await createPublication(pubPayload())
    expect(pub.status).toBe('Draft')
  })

  it('transitions to InReview on submitForReview', async () => {
    setEditor()
    const pub = await createPublication(pubPayload())
    await submitForReview(pub.id)
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
    setEditor()
    const pub = await createPublication(
      pubPayload({ body: '<p>This is forbidden content</p>' }),
    )
    await expect(submitForReview(pub.id)).rejects.toThrow(
      /sensitive.*word|moderation/i,
    )
  })
})

describe('publication workflow — updatePublication audit trail', () => {
  it('writes publication.updated (not publication.created) to the audit log', async () => {
    setEditor()
    const pub = await createPublication(pubPayload())
    await updatePublication(pub.id, { title: 'Updated Title' })

    const logs = await db.auditLogs
      .where('entityId')
      .equals(pub.id)
      .toArray()
    const updateLog = logs.find((l) => l.description.includes('updated'))
    expect(updateLog).toBeDefined()
    expect(updateLog!.eventType).toBe('publication.updated')
  })
})

describe('publication workflow — InReview → Approved / Rejected', () => {
  it('transitions to Approved on approvePublication', async () => {
    setEditor()
    const pub = await createPublication(pubPayload())
    await submitForReview(pub.id)
    setReviewer()
    await approvePublication(pub.id, 'Looks good')
    const updated = await db.publications.get(pub.id)
    expect(updated?.status).toBe('Approved')
  })

  it('notifies author on approval', async () => {
    setEditor()
    const pub = await createPublication(pubPayload())
    await submitForReview(pub.id)
    setReviewer()
    await approvePublication(pub.id)

    const notif = await db.notifications
      .where('userId')
      .equals('editor-1')
      .filter((n) => n.type === 'PublicationApproved')
      .first()
    expect(notif).toBeDefined()
  })

  it('transitions to Rejected on rejectPublication', async () => {
    setEditor()
    const pub = await createPublication(pubPayload())
    await submitForReview(pub.id)
    setReviewer()
    await rejectPublication(pub.id, 'Needs revision')
    const updated = await db.publications.get(pub.id)
    expect(updated?.status).toBe('Rejected')
  })

  it('notifies author on rejection', async () => {
    setEditor()
    const pub = await createPublication(pubPayload())
    await submitForReview(pub.id)
    setReviewer()
    await rejectPublication(pub.id, 'Needs revision')

    const notif = await db.notifications
      .where('userId')
      .equals('editor-1')
      .filter((n) => n.type === 'PublicationRejected')
      .first()
    expect(notif).toBeDefined()
  })

  it('rejects approval when not InReview', async () => {
    setEditor()
    const pub = await createPublication(pubPayload())
    setReviewer()
    await expect(approvePublication(pub.id)).rejects.toThrow()
  })
})

describe('publication workflow — Approved → Published', () => {
  it('transitions to Published on publishPublication', async () => {
    setEditor()
    const pub = await createPublication(pubPayload())
    await submitForReview(pub.id)
    setReviewer()
    await approvePublication(pub.id)
    setAdmin()
    await publishPublication(pub.id)

    const updated = await db.publications.get(pub.id)
    expect(updated?.status).toBe('Published')
    expect(updated?.publishedAt).toBeGreaterThan(0)
  })

  it('rejects publishing when not Approved', async () => {
    setEditor()
    const pub = await createPublication(pubPayload())
    await submitForReview(pub.id)
    setAdmin()
    await expect(publishPublication(pub.id)).rejects.toThrow()
  })

  it('saves a version snapshot at each status transition', async () => {
    setEditor()
    const pub = await createPublication(pubPayload())
    await submitForReview(pub.id)
    setReviewer()
    await approvePublication(pub.id)

    const versions = await db.publicationVersions.where('publicationId').equals(pub.id).toArray()
    // At least one version per transition (submit + approve)
    expect(versions.length).toBeGreaterThanOrEqual(2)
  })
})
