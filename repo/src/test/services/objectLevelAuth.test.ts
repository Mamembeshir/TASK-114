/**
 * Object-level and function-level authorization tests.
 *
 * Verifies that:
 *  1. Editors cannot mutate resources they do not own (cross-user edit blocked)
 *  2. Authors cannot self-approve or self-reject their own submissions
 *  3. Only the resource author can submit for review
 *
 * Evidence addressed:
 *  - documentService.ts:284  (updateDocument ownership)
 *  - publicationService.ts:137 (updatePublication ownership)
 *  - catalogService.ts:66    (updateCatalogItem ownership)
 *  - publicationService.ts:204 (submitForReview author-only)
 *  - documentService.ts:490  (submitDocumentForReview author-only)
 *  - biddingEngine.ts:282    (setProxyBid permission guard — covered in biddingEngine.test.ts)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  createCatalogItem,
  updateCatalogItem,
} from '@/services/catalogService'
import {
  createPublication,
  updatePublication,
  submitForReview,
  approvePublication,
  rejectPublication,
} from '@/services/publicationService'
import {
  createDocument,
  updateDocument,
  submitDocumentForReview,
  approveDocument,
  rejectDocument,
} from '@/services/documentService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'
import type { User } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(id: string, role: Role): User {
  return {
    id,
    username: id,
    displayName: id,
    email: `${id}@test`,
    passwordHash: '',
    passwordSalt: '',
    role,
    isActive: true,
    isTemporaryPassword: false,
    createdAt: 0,
    updatedAt: 0,
    createdBy: 'system',
  }
}

const EDITOR_A = makeUser('editor-a', Role.ContentEditor)
const EDITOR_B = makeUser('editor-b', Role.ContentEditor)
const REVIEWER = makeUser('reviewer-1', Role.ReviewerApprover)
const ADMIN = makeUser('admin-1', Role.Administrator)

function setAuth(user: User) {
  useAuthStore.setState({ currentUser: user, isLoading: false })
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.catalogItems.clear(),
    db.categories.clear(),
    db.publications.clear(),
    db.publicationVersions.clear(),
    db.documents.clear(),
    db.documentVersions.clear(),
    db.checkoutRecords.clear(),
    db.sensitiveWords.clear(),
    db.notifications.clear(),
    db.auditLogs.clear(),
    db.users.clear(),
  ])
  await db.users.bulkPut([EDITOR_A, EDITOR_B, REVIEWER, ADMIN])
  // Default to admin so helper calls (createXxx) succeed without permission errors
  setAuth(ADMIN)
})

// ── Catalog — object-level ────────────────────────────────────────────────────

describe('catalogService — object-level authorization', () => {
  it('blocks a ContentEditor from updating a catalog item they did not create', async () => {
    // Editor A creates the item
    setAuth(EDITOR_A)
    const item = await createCatalogItem(
      { title: 'My Item', description: 'Desc', categoryId: 'cat-1', tags: [], price: 100, stock: 5, imageUrls: [] },
      EDITOR_A.id,
      EDITOR_A.displayName,
    )

    // Editor B tries to update it
    setAuth(EDITOR_B)
    await expect(
      updateCatalogItem(item.id, { title: 'Hijacked' }, EDITOR_B.id, EDITOR_B.displayName),
    ).rejects.toThrow(/Forbidden/)
  })

  it('allows a ContentEditor to update a catalog item they created', async () => {
    setAuth(EDITOR_A)
    const item = await createCatalogItem(
      { title: 'My Item', description: 'Desc', categoryId: 'cat-1', tags: [], price: 100, stock: 5, imageUrls: [] },
      EDITOR_A.id,
      EDITOR_A.displayName,
    )

    await expect(
      updateCatalogItem(item.id, { title: 'Updated' }, EDITOR_A.id, EDITOR_A.displayName),
    ).resolves.not.toThrow()
  })

  it('allows an Administrator to update any catalog item regardless of ownership', async () => {
    setAuth(EDITOR_A)
    const item = await createCatalogItem(
      { title: 'Their Item', description: 'Desc', categoryId: 'cat-1', tags: [], price: 100, stock: 5, imageUrls: [] },
      EDITOR_A.id,
      EDITOR_A.displayName,
    )

    setAuth(ADMIN)
    await expect(
      updateCatalogItem(item.id, { title: 'Admin Override' }, ADMIN.id, ADMIN.displayName),
    ).resolves.not.toThrow()
  })
})

// ── Publication — object-level ────────────────────────────────────────────────

const pubPayload = () => ({
  title: 'Test Pub',
  type: 'Notice' as const,
  body: '<p>Content</p>',
  attachmentUrls: [] as string[],
  audienceRoles: [] as Role[],
  audienceOrgs: [] as string[],
  audienceTags: [] as string[],
})

describe('publicationService — updatePublication ownership', () => {
  it('blocks editor from updating another editor\'s publication', async () => {
    setAuth(EDITOR_A)
    const pub = await createPublication(pubPayload(), EDITOR_A.id, EDITOR_A.displayName)

    setAuth(EDITOR_B)
    await expect(
      updatePublication(pub.id, { title: 'Hijacked' }, EDITOR_B.id, EDITOR_B.displayName),
    ).rejects.toThrow(/Forbidden/)
  })

  it('allows editor to update their own publication', async () => {
    setAuth(EDITOR_A)
    const pub = await createPublication(pubPayload(), EDITOR_A.id, EDITOR_A.displayName)

    await expect(
      updatePublication(pub.id, { title: 'My Update' }, EDITOR_A.id, EDITOR_A.displayName),
    ).resolves.not.toThrow()
  })
})

describe('publicationService — submitForReview author-only', () => {
  it('blocks a non-author from submitting another user\'s publication for review', async () => {
    setAuth(EDITOR_A)
    const pub = await createPublication(pubPayload(), EDITOR_A.id, EDITOR_A.displayName)

    setAuth(EDITOR_B)
    await expect(
      submitForReview(pub.id, EDITOR_B.id, EDITOR_B.displayName),
    ).rejects.toThrow(/Forbidden/)
  })
})

describe('publicationService — self-review prevention', () => {
  it('blocks the author from approving their own publication', async () => {
    setAuth(EDITOR_A)
    const pub = await createPublication(pubPayload(), EDITOR_A.id, EDITOR_A.displayName)
    await submitForReview(pub.id, EDITOR_A.id, EDITOR_A.displayName)

    // Editor A (author) attempts self-approval — auth store must have approvePublication
    setAuth(ADMIN) // admin has approvePublication but is also the "author" here? No — pub was created by EDITOR_A
    // Re-attempt with the actual author ID
    setAuth({ ...EDITOR_A, role: Role.ReviewerApprover }) // temporarily elevate role to have approvePublication
    await expect(
      approvePublication(pub.id, EDITOR_A.id, EDITOR_A.displayName),
    ).rejects.toThrow(/Forbidden/)
  })

  it('blocks the author from rejecting their own publication', async () => {
    setAuth(EDITOR_A)
    const pub = await createPublication(pubPayload(), EDITOR_A.id, EDITOR_A.displayName)
    await submitForReview(pub.id, EDITOR_A.id, EDITOR_A.displayName)

    setAuth({ ...EDITOR_A, role: Role.ReviewerApprover })
    await expect(
      rejectPublication(pub.id, EDITOR_A.id, EDITOR_A.displayName, 'Self rejection attempt'),
    ).rejects.toThrow(/Forbidden/)
  })

  it('allows a different reviewer to approve the publication', async () => {
    setAuth(EDITOR_A)
    const pub = await createPublication(pubPayload(), EDITOR_A.id, EDITOR_A.displayName)
    await submitForReview(pub.id, EDITOR_A.id, EDITOR_A.displayName)

    setAuth(REVIEWER)
    await expect(
      approvePublication(pub.id, REVIEWER.id, REVIEWER.displayName),
    ).resolves.not.toThrow()
  })
})

// ── Document — object-level ───────────────────────────────────────────────────

const docPayload = () => ({
  title: 'Test Doc',
  type: 'Policy' as const,
  categoryId: 'cat-1',
  body: '<p>Content</p>',
  attachmentUrls: [] as string[],
  retentionYears: 5,
  tags: [] as string[],
  metadata: {} as Record<string, string>,
})

describe('documentService — updateDocument ownership', () => {
  it('blocks editor from updating a document they did not create', async () => {
    setAuth(EDITOR_A)
    const doc = await createDocument(docPayload(), EDITOR_A.id, EDITOR_A.displayName)

    setAuth(EDITOR_B)
    await expect(
      updateDocument(doc.id, { title: 'Hijacked' }, EDITOR_B.id, EDITOR_B.displayName),
    ).rejects.toThrow(/Forbidden/)
  })

  it('allows editor to update their own document', async () => {
    setAuth(EDITOR_A)
    const doc = await createDocument(docPayload(), EDITOR_A.id, EDITOR_A.displayName)

    await expect(
      updateDocument(doc.id, { title: 'My Update' }, EDITOR_A.id, EDITOR_A.displayName),
    ).resolves.not.toThrow()
  })
})

describe('documentService — submitDocumentForReview author-only', () => {
  it('blocks a non-author from submitting another user\'s document for review', async () => {
    setAuth(EDITOR_A)
    const doc = await createDocument(docPayload(), EDITOR_A.id, EDITOR_A.displayName)

    setAuth(EDITOR_B)
    await expect(
      submitDocumentForReview(doc.id, EDITOR_B.id, EDITOR_B.displayName),
    ).rejects.toThrow(/Forbidden/)
  })
})

describe('documentService — self-review prevention', () => {
  it('blocks the author from approving their own document', async () => {
    setAuth(EDITOR_A)
    const doc = await createDocument(docPayload(), EDITOR_A.id, EDITOR_A.displayName)
    await submitDocumentForReview(doc.id, EDITOR_A.id, EDITOR_A.displayName)

    // Give editor-a the reviewer role in auth store to have approveDocument permission
    setAuth({ ...EDITOR_A, role: Role.ReviewerApprover })
    await expect(
      approveDocument(doc.id, EDITOR_A.id, EDITOR_A.displayName),
    ).rejects.toThrow(/Forbidden/)
  })

  it('blocks the author from rejecting their own document', async () => {
    setAuth(EDITOR_A)
    const doc = await createDocument(docPayload(), EDITOR_A.id, EDITOR_A.displayName)
    await submitDocumentForReview(doc.id, EDITOR_A.id, EDITOR_A.displayName)

    setAuth({ ...EDITOR_A, role: Role.ReviewerApprover })
    await expect(
      rejectDocument(doc.id, EDITOR_A.id, EDITOR_A.displayName, 'Self rejection attempt'),
    ).rejects.toThrow(/Forbidden/)
  })

  it('allows a different reviewer to approve the document', async () => {
    setAuth(EDITOR_A)
    const doc = await createDocument(docPayload(), EDITOR_A.id, EDITOR_A.displayName)
    await submitDocumentForReview(doc.id, EDITOR_A.id, EDITOR_A.displayName)

    setAuth(REVIEWER)
    await expect(
      approveDocument(doc.id, REVIEWER.id, REVIEWER.displayName),
    ).resolves.not.toThrow()
  })
})
