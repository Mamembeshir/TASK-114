/**
 * Tests for Document.metadata encryption at rest.
 *
 * Verifies that metadata is:
 *   - stored as ciphertext (not plaintext) in IndexedDB
 *   - round-trips correctly through create / read
 *   - survives an update to metadata (partial update path)
 *
 * Evidence: src/types/document.ts:47, src/services/documentService.ts:42, :53
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  createDocument,
  getDocumentById,
  updateDocument,
  listDocuments,
} from '@/services/documentService'

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTOR_ID = 'test-actor'
const ACTOR_NAME = 'Test Actor'

function baseInput(metadata: Record<string, string> = {}) {
  return {
    title: 'Test Document',
    type: 'Policy',
    categoryId: 'cat-1',
    body: '<p>Body text</p>',
    attachmentUrls: [] as string[],
    retentionYears: 7,
    tags: [] as string[],
    metadata,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.documents.clear(),
    db.documentVersions.clear(),
    db.auditLogs.clear(),
    db.sensitiveWords.clear(),
    db.systemConfig.clear(),
  ])
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Document.metadata — encryption at rest', () => {
  it('stores metadata as ciphertext, not plaintext', async () => {
    const meta = { owner: 'alice', classification: 'CONFIDENTIAL', department: 'Legal' }
    const doc = await createDocument(baseInput(meta), ACTOR_ID, ACTOR_NAME)

    // Read the raw IndexedDB row directly (bypassing decryption)
    const rawRow = await db.documents.get(doc.id)
    const rawMeta = (rawRow as unknown as { metadata: unknown }).metadata

    // Raw value must be a string (ciphertext), not the plaintext object
    expect(typeof rawMeta).toBe('string')

    // It must not contain any of the plaintext values
    expect(rawMeta as string).not.toContain('alice')
    expect(rawMeta as string).not.toContain('CONFIDENTIAL')
    expect(rawMeta as string).not.toContain('Legal')
  })

  it('decrypts metadata correctly on read via getDocumentById', async () => {
    const meta = { owner: 'alice', classification: 'CONFIDENTIAL' }
    const created = await createDocument(baseInput(meta), ACTOR_ID, ACTOR_NAME)

    const fetched = await getDocumentById(created.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.metadata).toEqual(meta)
  })

  it('round-trips empty metadata object without error', async () => {
    const doc = await createDocument(baseInput({}), ACTOR_ID, ACTOR_NAME)
    const fetched = await getDocumentById(doc.id)
    expect(fetched!.metadata).toEqual({})
  })

  it('decrypts metadata correctly in listDocuments', async () => {
    const meta = { project: 'Alpha', sensitivity: 'HIGH' }
    const doc = await createDocument(baseInput(meta), ACTOR_ID, ACTOR_NAME)

    const list = await listDocuments()
    const found = list.find((d) => d.id === doc.id)
    expect(found).toBeDefined()
    expect(found!.metadata).toEqual(meta)
  })

  it('encrypts updated metadata on updateDocument', async () => {
    const original = { owner: 'alice' }
    const doc = await createDocument(baseInput(original), ACTOR_ID, ACTOR_NAME)

    const updated = { owner: 'bob', classification: 'PUBLIC' }
    await updateDocument(doc.id, { metadata: updated }, ACTOR_ID, ACTOR_NAME)

    // Raw stored value must still be ciphertext
    const rawRow = await db.documents.get(doc.id)
    const rawMeta = (rawRow as unknown as { metadata: unknown }).metadata
    expect(typeof rawMeta).toBe('string')
    expect(rawMeta as string).not.toContain('bob')

    // Decrypted value must reflect the update
    const fetched = await getDocumentById(doc.id)
    expect(fetched!.metadata).toEqual(updated)
  })

  it('title and body remain encrypted alongside metadata', async () => {
    const meta = { key: 'value' }
    const doc = await createDocument(baseInput(meta), ACTOR_ID, ACTOR_NAME)

    const rawRow = await db.documents.get(doc.id) as unknown as { title: string; body: string; metadata: string }
    expect(rawRow.title).not.toBe('Test Document')
    expect(rawRow.body).not.toContain('Body text')
    expect(typeof rawRow.metadata).toBe('string')
  })
})
