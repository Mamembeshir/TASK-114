/**
 * Unit tests for document numbering and retention date calculation.
 *
 * Services now derive actor identity from useAuthStore — creator uses
 * ContentEditor role and approver uses ReviewerApprover role to satisfy
 * the self-review prevention constraint.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { createDocument, approveDocument } from '@/services/documentService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'

// ── Auth helpers ──────────────────────────────────────────────────────────────

function setAuthUser(id: string, role: Role, displayName = id) {
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

const setEditor   = () => setAuthUser('user-1',     Role.ContentEditor,    'User One')
const setReviewer = () => setAuthUser('reviewer-1', Role.ReviewerApprover, 'Reviewer One')

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.documents.clear(),
    db.documentVersions.clear(),
    db.systemConfig.clear(),
    db.auditLogs.clear(),
    db.notifications.clear(),
    db.users.clear(),
  ])
  setEditor()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('document numbering', () => {
  it('does not assign a document number on creation (Draft)', async () => {
    setEditor()
    const doc = await createDocument({
      title: 'Test Doc',
      type: 'Policy',
      categoryId: 'cat-1',
      body: 'Body text',
      attachmentUrls: [],
      retentionYears: 7,
      tags: [],
    })

    expect(doc.documentNumber).toBeUndefined()
    expect(doc.status).toBe('Draft')
  })

  it('assigns a formatted document number on approval', async () => {
    setEditor()
    const doc = await createDocument({
      title: 'Approval Test',
      type: 'Policy',
      categoryId: 'cat-1',
      body: 'Body text',
      attachmentUrls: [],
      retentionYears: 5,
      tags: [],
    })

    // Move to InReview first
    await db.documents.update(doc.id, { status: 'InReview' })

    setReviewer()
    await approveDocument(doc.id)

    const approved = await db.documents.get(doc.id)
    expect(approved?.status).toBe('Approved')
    expect(approved?.documentNumber).toMatch(/^ORG-\d{4}-\d{6}$/)
  })

  it('assigns sequential document numbers', async () => {
    const createAndApprove = async (title: string, creatorId: string, reviewerId: string): Promise<string> => {
      setAuthUser(creatorId, Role.ContentEditor, 'Creator')
      const doc = await createDocument({
        title,
        type: 'Policy',
        categoryId: 'c',
        body: 'b',
        attachmentUrls: [],
        retentionYears: 7,
        tags: [],
      })
      await db.documents.update(doc.id, { status: 'InReview' })
      setAuthUser(reviewerId, Role.ReviewerApprover, 'Reviewer')
      await approveDocument(doc.id)
      const approved = await db.documents.get(doc.id)
      return approved?.documentNumber ?? ''
    }

    const num1 = await createAndApprove('Doc A', 'u1', 'r1')
    const num2 = await createAndApprove('Doc B', 'u2', 'r2')

    // Extract the counter from the end of the document number
    const counter1 = Number(num1.split('-')[2])
    const counter2 = Number(num2.split('-')[2])
    expect(counter2).toBe(counter1 + 1)
  })
})

describe('retention date calculation', () => {
  it('sets retentionDueDate to approvalTime + retentionYears * 365.25 days', async () => {
    const retentionYears = 7
    setEditor()
    const doc = await createDocument({
      title: 'Retention Test',
      type: 'Policy',
      categoryId: 'cat-1',
      body: 'Body',
      attachmentUrls: [],
      retentionYears,
      tags: [],
    })

    await db.documents.update(doc.id, { status: 'InReview' })
    const beforeApproval = Date.now()
    setReviewer()
    await approveDocument(doc.id)
    const afterApproval = Date.now()

    const approved = await db.documents.get(doc.id)
    const expectedMs = retentionYears * 365.25 * 24 * 3600 * 1000

    expect(approved?.retentionDueDate).toBeGreaterThanOrEqual(beforeApproval + expectedMs - 100)
    expect(approved?.retentionDueDate).toBeLessThanOrEqual(afterApproval + expectedMs + 100)
  })
})
