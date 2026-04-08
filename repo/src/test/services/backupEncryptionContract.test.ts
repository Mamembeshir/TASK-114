/**
 * Regression tests — backup/restore encryption contract.
 *
 * Verifies that the export → import cycle preserves the AES-GCM-256
 * encrypted-at-rest contract for documents and document versions.
 *
 * Root cause that prompted these tests:
 *   DataExportPage previously called listDocuments() / listAllDocumentVersions()
 *   which return DECRYPTED Document[] — the backup JSON contained plaintext.
 *   importService.runImport wrote those plaintext rows back to db.documents,
 *   causing decryptDocument() to fail (ciphertext expected, plaintext found).
 *
 * Fix:
 *   DataExportPage now calls db.documents.toArray() / db.documentVersions.toArray()
 *   — raw StoredDocument rows (ciphertext) — ensuring the import round-trips
 *   correctly through decryptDocument() on next read.
 *
 * Evidence:
 *   src/pages/admin/DataExportPage.tsx  (export — case 'all' + case 'documents')
 *   src/services/importService.ts       (import — table.add / table.put)
 *   src/services/documentService.ts     (getDocumentById → decryptDocument)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { createDocument, getDocumentById } from '@/services/documentService'
import { runImport } from '@/services/importService'
import { wrapAppKey, unwrapAppKey } from '@/crypto/appKey'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'
import type { ParsedBackup } from '@/services/importService'

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTOR_ID = 'actor-1'
const ACTOR_NAME = 'Test Actor'

function setAdmin() {
  useAuthStore.setState({
    currentUser: {
      id: ACTOR_ID,
      username: 'admin',
      displayName: ACTOR_NAME,
      role: Role.Administrator,
      isActive: true,
      createdAt: Date.now(),
    },
  } as Parameters<typeof useAuthStore.setState>[0])
}

function baseInput() {
  return {
    title: 'Confidential Policy',
    type: 'Policy',
    categoryId: 'cat-1',
    body: '<p>Secret body content</p>',
    attachmentUrls: [] as string[],
    retentionYears: 7,
    tags: [] as string[],
    metadata: { classification: 'CONFIDENTIAL' },
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
  setAdmin()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('backup export — documents use raw DB rows (ciphertext)', () => {
  it('db.documents.toArray() returns ciphertext, not plaintext title', async () => {
    await createDocument(baseInput())

    const rawRows = await db.documents.toArray()
    expect(rawRows).toHaveLength(1)

    const rawTitle = (rawRows[0] as unknown as { title: string }).title
    // The raw title must be a ciphertext string — not the plaintext value
    expect(rawTitle).not.toBe('Confidential Policy')
    // Ciphertext is base64-encoded by our encrypt() helper — it should be a
    // non-empty string but not human-readable prose
    expect(typeof rawTitle).toBe('string')
    expect(rawTitle.length).toBeGreaterThan(10)
  })

  it('db.documents.toArray() body is ciphertext, not plaintext', async () => {
    await createDocument(baseInput())

    const rawRows = await db.documents.toArray()
    const rawBody = (rawRows[0] as unknown as { body: string }).body
    expect(rawBody).not.toBe('<p>Secret body content</p>')
    expect(typeof rawBody).toBe('string')
    expect(rawBody.length).toBeGreaterThan(10)
  })

  it('db.documents.toArray() metadata is a ciphertext string, not a plain object', async () => {
    await createDocument(baseInput())

    const rawRows = await db.documents.toArray()
    const rawMeta = (rawRows[0] as unknown as { metadata: unknown }).metadata
    // metadata must be stored as an encrypted string, not as the original object
    expect(typeof rawMeta).toBe('string')
    expect(rawMeta).not.toEqual({ classification: 'CONFIDENTIAL' })
  })
})

describe('backup import — restoring raw ciphertext rows round-trips correctly', () => {
  it('document created → raw export → clear DB → import → getDocumentById returns plaintext', async () => {
    // 1. Create a document (encrypted at rest)
    const original = await createDocument(baseInput())

    // 2. Simulate what DataExportPage now does: read raw StoredDocument rows
    const rawDocRows = await db.documents.toArray()

    // Verify export contains ciphertext, not plaintext
    const exportedTitle = (rawDocRows[0] as unknown as { title: string }).title
    expect(exportedTitle).not.toBe('Confidential Policy')

    // 3. Clear DB (simulate restore to fresh state)
    await db.documents.clear()

    // Confirm the doc is gone
    expect(await getDocumentById(original.id)).toBeNull()

    // 4. Import the raw ciphertext rows via runImport (as DataImportPage does)
    const backup: ParsedBackup = {
      exportedAt: new Date().toISOString(),
      module: 'documents',
      data: {
        documents: rawDocRows as unknown[],
      },
    }
    const results = await runImport(backup, 'skip')
    expect(results.find((r) => r.table === 'documents')?.inserted).toBe(1)

    // 5. Read via service layer — decryptDocument() must succeed and return plaintext
    const restored = await getDocumentById(original.id)
    expect(restored).not.toBeNull()
    expect(restored!.title).toBe('Confidential Policy')
    expect(restored!.body).toBe('<p>Secret body content</p>')
    expect(restored!.metadata?.classification).toBe('CONFIDENTIAL')
  })

  it('importing plaintext document rows (old broken export format) causes decrypt failure', async () => {
    // Simulate the OLD broken behaviour: export contained decrypted Document objects.
    // Importing them then calling getDocumentById should either throw or return
    // garbled/null data — proving the fix was necessary.
    const plaintextRow = {
      id: 'doc-plain',
      title: 'Confidential Policy',      // plaintext — not valid ciphertext
      body: '<p>Secret body content</p>', // plaintext
      metadata: { classification: 'CONFIDENTIAL' }, // object, not ciphertext string
      type: 'Policy',
      categoryId: 'cat-1',
      status: 'Draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: ACTOR_ID,
      attachmentUrls: [],
      retentionYears: 7,
      tags: [],
    }

    // Write the plaintext row directly (bypass service encryption)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.documents.add(plaintextRow as any)

    // getDocumentById calls decryptDocument() which calls decrypt() on the
    // plaintext "ciphertext" — this is expected to throw or return garbled data.
    await expect(getDocumentById('doc-plain')).rejects.toThrow()
  })
})

// ── wrapAppKey / unwrapAppKey ────────────────────────────────────────────────

describe('wrapAppKey / unwrapAppKey — passphrase-protected key portability', () => {
  it('wrap then unwrap with the correct passphrase restores a working key', async () => {
    // 1. Create a document with the current app key
    const original = await createDocument(baseInput())

    // 2. Wrap the app key with a passphrase
    const passphrase = 'test-passphrase-1234'
    const wrapped = await wrapAppKey(passphrase)

    // wrapped should be a JSON string with saltHex and ciphertext
    const parsed = JSON.parse(wrapped)
    expect(parsed).toHaveProperty('saltHex')
    expect(parsed).toHaveProperty('ciphertext')
    expect(typeof parsed.saltHex).toBe('string')
    expect(typeof parsed.ciphertext).toBe('string')

    // 3. Clear localStorage to simulate moving to a new device, then unwrap
    localStorage.clear()
    await unwrapAppKey(wrapped, passphrase)

    // 4. The restored key must decrypt the original document
    const restored = await getDocumentById(original.id)
    expect(restored).not.toBeNull()
    expect(restored!.title).toBe('Confidential Policy')
    expect(restored!.body).toBe('<p>Secret body content</p>')
  })

  it('unwrap with wrong passphrase throws', async () => {
    const wrapped = await wrapAppKey('correct-passphrase')
    await expect(unwrapAppKey(wrapped, 'wrong-passphrase')).rejects.toThrow()
  })

  it('full backup round-trip with wrapped key: export → clear → unwrap → import → read', async () => {
    // 1. Create a document
    const original = await createDocument(baseInput())

    // 2. Simulate full export: raw ciphertext rows + wrapped key
    const rawDocRows = await db.documents.toArray()
    const rawVersionRows = await db.documentVersions.toArray()
    const passphrase = 'backup-passphrase'
    const wrappedKey = await wrapAppKey(passphrase)

    // 3. Nuke everything — simulate fresh device
    await db.documents.clear()
    await db.documentVersions.clear()
    localStorage.clear()

    // Confirm doc is gone and key is gone
    expect(localStorage.getItem('meridian_enc_key')).toBeNull()

    // 4. Unwrap the key (as DataImportPage does before import)
    await unwrapAppKey(wrappedKey, passphrase)

    // 5. Import the raw ciphertext rows
    const backup: ParsedBackup = {
      exportedAt: new Date().toISOString(),
      module: 'all',
      data: {
        documents: rawDocRows as unknown[],
        documentVersions: rawVersionRows as unknown[],
      },
    }
    await runImport(backup, 'skip')

    // 6. Read via service layer — must decrypt successfully
    const restored = await getDocumentById(original.id)
    expect(restored).not.toBeNull()
    expect(restored!.title).toBe('Confidential Policy')
    expect(restored!.body).toBe('<p>Secret body content</p>')
    expect(restored!.metadata?.classification).toBe('CONFIDENTIAL')
  })
})
