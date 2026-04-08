/**
 * Integration tests for document checkout/check-in locking.
 *
 * Services now derive actor identity from useAuthStore — each test step
 * sets the appropriate authenticated user before calling the service.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  createDocument,
  checkoutDocument,
  checkinDocument,
  listDocumentVersions,
} from '@/services/documentService'
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function docPayload(overrides = {}) {
  return {
    title: 'Lock Test Doc',
    type: 'Policy' as const,
    categoryId: 'cat-1',
    body: '<p>Body</p>',
    attachmentUrls: [] as string[],
    retentionYears: 7,
    tags: [] as string[],
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
  setAuthUser('user-1', Role.ContentEditor, 'User One')
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('document checkout locking', () => {
  it('allows a user to check out a document', async () => {
    setAuthUser('user-1', Role.ContentEditor, 'User One')
    const doc = await createDocument(docPayload())
    await checkoutDocument(doc.id)

    const updated = await db.documents.get(doc.id)
    expect(updated?.checkedOutBy).toBe('user-1')
    expect(updated?.checkoutExpiresAt).toBeGreaterThan(Date.now())
  })

  it('blocks a second user from checking out a locked document', async () => {
    setAuthUser('user-1', Role.ContentEditor, 'User One')
    const doc = await createDocument(docPayload())
    await checkoutDocument(doc.id)

    setAuthUser('user-2', Role.ContentEditor, 'User Two')
    await expect(checkoutDocument(doc.id)).rejects.toThrow(
      /checked out by another user/i,
    )
  })

  it('creates a checkout record in the audit trail', async () => {
    setAuthUser('user-1', Role.ContentEditor, 'User One')
    const doc = await createDocument(docPayload())
    await checkoutDocument(doc.id)

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
    setAuthUser('user-1', Role.ContentEditor, 'User One')
    const doc = await createDocument(docPayload())
    await checkoutDocument(doc.id)
    await checkinDocument(doc.id)

    const updated = await db.documents.get(doc.id)
    expect(updated?.checkedOutBy).toBeUndefined()
  })

  it('saves a version snapshot on check-in', async () => {
    setAuthUser('user-1', Role.ContentEditor, 'User One')
    const doc = await createDocument(docPayload())
    await checkoutDocument(doc.id)
    await checkinDocument(doc.id)

    const versions = await listDocumentVersions(doc.id)
    expect(versions.length).toBeGreaterThanOrEqual(1)
    // Snapshot captures the document's body at check-in time
    const sorted = versions.sort((a, b) => b.createdAt - a.createdAt)
    expect(sorted.length).toBeGreaterThan(0)
    expect(sorted[0]?.body).toBe(docPayload().body)
  })

  it('allows a different user to check out after check-in', async () => {
    setAuthUser('user-1', Role.ContentEditor, 'User One')
    const doc = await createDocument(docPayload())
    await checkoutDocument(doc.id)
    await checkinDocument(doc.id)

    setAuthUser('user-2', Role.ContentEditor, 'User Two')
    await expect(checkoutDocument(doc.id)).resolves.not.toThrow()
  })
})

describe('expired checkout auto-release', () => {
  it('auto-releases an expired checkout when another user tries to check out', async () => {
    setAuthUser('user-1', Role.ContentEditor, 'User One')
    const doc = await createDocument(docPayload())
    await checkoutDocument(doc.id)

    // Simulate expiry by back-dating the checkout
    await db.documents.update(doc.id, {
      checkoutExpiresAt: Date.now() - 1000, // expired 1 second ago
    })

    // user-2 should be able to check out (auto-release fires)
    setAuthUser('user-2', Role.ContentEditor, 'User Two')
    await expect(checkoutDocument(doc.id)).resolves.not.toThrow()

    const updated = await db.documents.get(doc.id)
    expect(updated?.checkedOutBy).toBe('user-2')
  })
})
