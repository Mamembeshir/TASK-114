/**
 * Integration tests for document checkout/check-in locking.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  createDocument,
  checkoutDocument,
  checkinDocument,
} from '@/services/documentService'

// ── Helpers ──────────────────────────────────────────────────────────────────

function docPayload(overrides = {}) {
  return {
    title: 'Lock Test Doc',
    type: 'Policy' as const,
    categoryId: 'cat-1',
    body: '<p>Body</p>',
    attachmentUrls: [] as string[],
    retentionYears: 7,
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.documents.clear(),
    db.documentVersions.clear(),
    db.checkoutRecords.clear(),
    db.notifications.clear(),
    db.auditLogs.clear(),
  ])
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('document checkout locking', () => {
  it('allows a user to check out a document', async () => {
    const doc = await createDocument(docPayload(), 'user-1', 'User One')
    await checkoutDocument(doc.id, 'user-1', 'User One')

    const updated = await db.documents.get(doc.id)
    expect(updated?.checkedOutBy).toBe('user-1')
    expect(updated?.checkoutExpiresAt).toBeGreaterThan(Date.now())
  })

  it('blocks a second user from checking out a locked document', async () => {
    const doc = await createDocument(docPayload(), 'user-1', 'User One')
    await checkoutDocument(doc.id, 'user-1', 'User One')

    await expect(checkoutDocument(doc.id, 'user-2', 'User Two')).rejects.toThrow(
      /checked out by another user/i,
    )
  })

  it('creates a checkout record in the audit trail', async () => {
    const doc = await createDocument(docPayload(), 'user-1', 'User One')
    await checkoutDocument(doc.id, 'user-1', 'User One')

    const record = await db.checkoutRecords
      .where('documentId')
      .equals(doc.id)
      .filter((r) => r.isActive)
      .first()
    expect(record).toBeDefined()
    expect(record?.userId).toBe('user-1')
  })
})

describe('document check-in', () => {
  it('releases the lock on check-in', async () => {
    const doc = await createDocument(docPayload(), 'user-1', 'User One')
    await checkoutDocument(doc.id, 'user-1', 'User One')
    await checkinDocument(doc.id, 'user-1', 'User One')

    const updated = await db.documents.get(doc.id)
    expect(updated?.checkedOutBy).toBeUndefined()
  })

  it('saves a version snapshot on check-in', async () => {
    const doc = await createDocument(docPayload(), 'user-1', 'User One')
    await checkoutDocument(doc.id, 'user-1', 'User One')
    await checkinDocument(doc.id, 'user-1', 'User One')

    const versions = await db.documentVersions.where('documentId').equals(doc.id).toArray()
    expect(versions.length).toBeGreaterThanOrEqual(1)
    // Snapshot captures the document's body at check-in time
    const latest = versions.sort((a, b) => b.createdAt - a.createdAt)[0]
    expect(latest?.body).toBe(docPayload().body)
  })

  it('allows a different user to check out after check-in', async () => {
    const doc = await createDocument(docPayload(), 'user-1', 'User One')
    await checkoutDocument(doc.id, 'user-1', 'User One')
    await checkinDocument(doc.id, 'user-1', 'User One')

    await expect(checkoutDocument(doc.id, 'user-2', 'User Two')).resolves.not.toThrow()
  })
})

describe('expired checkout auto-release', () => {
  it('auto-releases an expired checkout when another user tries to check out', async () => {
    const doc = await createDocument(docPayload(), 'user-1', 'User One')
    await checkoutDocument(doc.id, 'user-1', 'User One')

    // Simulate expiry by back-dating the checkout
    await db.documents.update(doc.id, {
      checkoutExpiresAt: Date.now() - 1000, // expired 1 second ago
    })

    // user-2 should be able to check out (auto-release fires)
    await expect(checkoutDocument(doc.id, 'user-2', 'User Two')).resolves.not.toThrow()

    const updated = await db.documents.get(doc.id)
    expect(updated?.checkedOutBy).toBe('user-2')
  })
})
