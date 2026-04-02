/**
 * Unit tests for document numbering and retention date calculation.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { createDocument, approveDocument } from '@/services/documentService'

beforeEach(async () => {
  await Promise.all([
    db.documents.clear(),
    db.documentVersions.clear(),
    db.systemConfig.clear(),
    db.auditLogs.clear(),
    db.notifications.clear(),
    db.users.clear(),
  ])
})

describe('document numbering', () => {
  it('does not assign a document number on creation (Draft)', async () => {
    const doc = await createDocument(
      {
        title: 'Test Doc',
        type: 'Policy',
        categoryId: 'cat-1',
        body: 'Body text',
        attachmentUrls: [],
        retentionYears: 7,
      },
      'user-1',
      'User One',
    )

    expect(doc.documentNumber).toBeUndefined()
    expect(doc.status).toBe('Draft')
  })

  it('assigns a formatted document number on approval', async () => {
    const doc = await createDocument(
      {
        title: 'Approval Test',
        type: 'Policy',
        categoryId: 'cat-1',
        body: 'Body text',
        attachmentUrls: [],
        retentionYears: 5,
      },
      'user-1',
      'User One',
    )

    // Move to InReview first
    await db.documents.update(doc.id, { status: 'InReview' })

    await approveDocument(doc.id, 'reviewer-1', 'Reviewer One')

    const approved = await db.documents.get(doc.id)
    expect(approved?.status).toBe('Approved')
    expect(approved?.documentNumber).toMatch(/^ORG-\d{4}-\d{6}$/)
  })

  it('assigns sequential document numbers', async () => {
    const createAndApprove = async (title: string): Promise<string> => {
      const doc = await createDocument(
        { title, type: 'Policy', categoryId: 'c', body: 'b', attachmentUrls: [], retentionYears: 7 },
        'u1',
        'User',
      )
      await db.documents.update(doc.id, { status: 'InReview' })
      await approveDocument(doc.id, 'r1', 'Reviewer')
      const approved = await db.documents.get(doc.id)
      return approved?.documentNumber ?? ''
    }

    const num1 = await createAndApprove('Doc A')
    const num2 = await createAndApprove('Doc B')

    // Extract the counter from the end of the document number
    const counter1 = Number(num1.split('-')[2])
    const counter2 = Number(num2.split('-')[2])
    expect(counter2).toBe(counter1 + 1)
  })
})

describe('retention date calculation', () => {
  it('sets retentionDueDate to approvalTime + retentionYears * 365.25 days', async () => {
    const retentionYears = 7
    const doc = await createDocument(
      {
        title: 'Retention Test',
        type: 'Policy',
        categoryId: 'cat-1',
        body: 'Body',
        attachmentUrls: [],
        retentionYears,
      },
      'user-1',
      'User One',
    )

    await db.documents.update(doc.id, { status: 'InReview' })
    const beforeApproval = Date.now()
    await approveDocument(doc.id, 'reviewer-1', 'Reviewer One')
    const afterApproval = Date.now()

    const approved = await db.documents.get(doc.id)
    const expectedMs = retentionYears * 365.25 * 24 * 3600 * 1000

    expect(approved?.retentionDueDate).toBeGreaterThanOrEqual(beforeApproval + expectedMs - 100)
    expect(approved?.retentionDueDate).toBeLessThanOrEqual(afterApproval + expectedMs + 100)
  })
})
