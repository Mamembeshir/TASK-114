/**
 * Unit tests for DocumentService.
 *
 * Covers: generateWatermark, createDocument, updateDocument, listDocuments,
 *         getDocumentById, searchDocuments, listDocumentVersions,
 *         listAllDocumentVersions, createDocumentTemplate,
 *         listDocumentTemplates, getDocumentTemplate
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  generateWatermark,
  createDocument,
  updateDocument,
  listDocuments,
  getDocumentById,
  searchDocuments,
  listDocumentVersions,
  listAllDocumentVersions,
  createDocumentTemplate,
  listDocumentTemplates,
  getDocumentTemplate,
  checkoutDocument,
  checkinDocument,
  type DocumentInput,
  type DocumentTemplateInput,
} from '@/services/documentService'
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

const setAdmin       = (id = 'admin-1')  => setUser(id, Role.Administrator, 'Admin')
const setEditor      = (id = 'editor-1') => setUser(id, Role.ContentEditor, 'Editor')
const setReviewer    = (id = 'rev-1')    => setUser(id, Role.ReviewerApprover, 'Reviewer')
const setParticipant = (id = 'p-1')      => setUser(id, Role.Participant, 'Participant')

// ── Fixtures ──────────────────────────────────────────────────────────────────

function docInput(overrides: Partial<DocumentInput> = {}): DocumentInput {
  return {
    title: 'Test Document',
    type: 'Policy',
    categoryId: 'cat-1',
    body: '<p>Document content</p>',
    attachmentUrls: [],
    retentionYears: 7,
    tags: ['tag-a'],
    ...overrides,
  }
}

function templateInput(overrides: Partial<DocumentTemplateInput> = {}): DocumentTemplateInput {
  return {
    name: 'Test Template',
    type: 'Policy',
    categoryId: 'cat-1',
    body: '<p>Template body</p>',
    defaultRetentionYears: 5,
    tags: ['template-tag'],
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.documents.clear(),
    db.documentVersions.clear(),
    db.documentTemplates.clear(),
    db.checkoutRecords.clear(),
    db.destructionApprovals.clear(),
    db.auditLogs.clear(),
    db.sensitiveWords.clear(),
    db.notifications.clear(),
    db.systemConfig.clear(),
    db.users.clear(),
  ])
  setAdmin()
})

// ── generateWatermark ─────────────────────────────────────────────────────────

describe('generateWatermark', () => {
  it('includes CONFIDENTIAL prefix and user details', () => {
    const wm = generateWatermark('user-12345', 'Alice Smith')
    expect(wm).toContain('CONFIDENTIAL')
    expect(wm).toContain('Alice Smith')
    expect(wm).toContain('2345') // last 4 chars of userId
  })

  it('includes today\'s date in YYYY-MM-DD format', () => {
    const wm = generateWatermark('user-1', 'Bob')
    const today = new Date().toLocaleDateString('en-CA')
    expect(wm).toContain(today)
  })
})

// ── createDocument ────────────────────────────────────────────────────────────

describe('createDocument', () => {
  it('creates a document in Draft status for Administrator', async () => {
    setAdmin()
    const doc = await createDocument(docInput())

    expect(doc.id).toBeTruthy()
    expect(doc.status).toBe('Draft')
    expect(doc.title).toBe('Test Document')
    expect(doc.createdBy).toBe('admin-1')
  })

  it('creates a document for ContentEditor', async () => {
    setEditor()
    const doc = await createDocument(docInput())
    expect(doc.status).toBe('Draft')
    expect(doc.createdBy).toBe('editor-1')
  })

  it('throws Forbidden for Participant (lacks createDocument)', async () => {
    setParticipant()
    await expect(createDocument(docInput())).rejects.toThrow(/Forbidden/)
  })

  it('throws Forbidden for ReviewerApprover (lacks createDocument)', async () => {
    setReviewer()
    await expect(createDocument(docInput())).rejects.toThrow(/Forbidden/)
  })

  it('rejects external attachment URLs', async () => {
    setAdmin()
    await expect(
      createDocument(docInput({ attachmentUrls: ['https://external.com/file.pdf'] })),
    ).rejects.toThrow(/External URLs/)
  })

  it('stores metadata field when provided', async () => {
    setAdmin()
    const doc = await createDocument(docInput({ metadata: { project: 'Alpha', version: '1' } }))
    expect(doc.metadata).toEqual({ project: 'Alpha', version: '1' })
  })

  it('defaults metadata to {} when not provided', async () => {
    setAdmin()
    const doc = await createDocument(docInput())
    expect(doc.metadata).toEqual({})
  })

  it('writes an audit log on creation', async () => {
    setAdmin()
    await createDocument(docInput())
    const logs = await db.auditLogs.where('eventType').equals('document.created').toArray()
    expect(logs).toHaveLength(1)
  })
})

// ── updateDocument ────────────────────────────────────────────────────────────

describe('updateDocument', () => {
  it('updates title and body of a Draft document', async () => {
    setAdmin()
    const doc = await createDocument(docInput())
    await updateDocument(doc.id, { title: 'Updated Title', body: '<p>New content</p>' })

    const retrieved = await getDocumentById(doc.id)
    expect(retrieved?.title).toBe('Updated Title')
    expect(retrieved?.body).toBe('<p>New content</p>')
  })

  it('throws if document does not exist', async () => {
    setAdmin()
    await expect(updateDocument('no-id', { title: 'X' })).rejects.toThrow('Document not found')
  })

  it('throws if document is not Draft or Rejected', async () => {
    setAdmin()
    const doc = await createDocument(docInput())
    // Manually set to InReview (not updatable)
    await db.documents.update(doc.id, { status: 'InReview' })
    await expect(updateDocument(doc.id, { title: 'X' })).rejects.toThrow(
      'Only Draft or Rejected documents can be edited',
    )
  })

  it('throws Forbidden when editor tries to update another user\'s document', async () => {
    setAdmin()
    const doc = await createDocument(docInput())

    setEditor('editor-2')
    await expect(updateDocument(doc.id, { title: 'Stolen' })).rejects.toThrow(/Forbidden/)
  })

  it('allows admin (manageDocuments) to update any document', async () => {
    setEditor('editor-1')
    const doc = await createDocument(docInput())

    setAdmin('admin-1')
    await expect(updateDocument(doc.id, { title: 'Admin Override' })).resolves.toBeUndefined()
  })

  it('throws when document is checked out by another user', async () => {
    setAdmin()
    const doc = await createDocument(docInput())
    // Check out as admin
    await checkoutDocument(doc.id)

    // Try to update as editor
    setEditor()
    await expect(updateDocument(doc.id, { title: 'Blocked' })).rejects.toThrow(
      'checked out by another user',
    )
  })

  it('rejects external attachment URLs in update', async () => {
    setAdmin()
    const doc = await createDocument(docInput())
    await expect(
      updateDocument(doc.id, { attachmentUrls: ['https://evil.com/file.pdf'] }),
    ).rejects.toThrow(/External URLs/)
  })

  it('updates metadata and encrypts it', async () => {
    setAdmin()
    const doc = await createDocument(docInput({ metadata: { key: 'old' } }))
    await updateDocument(doc.id, { metadata: { key: 'new', extra: 'value' } })

    const retrieved = await getDocumentById(doc.id)
    expect(retrieved?.metadata).toEqual({ key: 'new', extra: 'value' })
  })
})

// ── getDocumentById ───────────────────────────────────────────────────────────

describe('getDocumentById', () => {
  it('returns a document for its creator', async () => {
    setAdmin()
    const doc = await createDocument(docInput())
    const retrieved = await getDocumentById(doc.id)
    expect(retrieved?.id).toBe(doc.id)
    expect(retrieved?.title).toBe('Test Document')
  })

  it('returns null when document does not exist', async () => {
    setAdmin()
    const result = await getDocumentById('no-such-id')
    expect(result).toBeNull()
  })

  it('returns null for Draft document created by another user (ContentEditor visibility scoping)', async () => {
    // Create doc as admin-1
    setAdmin('admin-1')
    const doc = await createDocument(docInput())

    // editor-2 has viewDocuments but can only see own docs + Approved/Archived
    setEditor('editor-2')
    const result = await getDocumentById(doc.id)
    expect(result).toBeNull()
  })

  it('throws Forbidden when unauthenticated', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await expect(getDocumentById('any-id')).rejects.toThrow(/Forbidden/)
  })

  it('decrypts title, body, and metadata correctly', async () => {
    setAdmin()
    const doc = await createDocument(
      docInput({ title: 'Secret Title', body: 'Secret Body', metadata: { ref: 'ABC' } }),
    )
    const retrieved = await getDocumentById(doc.id)
    expect(retrieved?.title).toBe('Secret Title')
    expect(retrieved?.body).toBe('Secret Body')
    expect(retrieved?.metadata).toEqual({ ref: 'ABC' })
  })
})

// ── listDocuments ─────────────────────────────────────────────────────────────

describe('listDocuments', () => {
  it('returns all visible documents for Administrator', async () => {
    setAdmin()
    await createDocument(docInput({ title: 'Doc A' }))
    await createDocument(docInput({ title: 'Doc B' }))

    const docs = await listDocuments()
    expect(docs.length).toBeGreaterThanOrEqual(2)
  })

  it('returns documents sorted newest-first', async () => {
    setAdmin()
    const d1 = await createDocument(docInput({ title: 'First' }))
    // Backdate d1 by 5 seconds so d2 is definitively newer
    await db.documents.update(d1.id, { createdAt: Date.now() - 5000 })
    const d2 = await createDocument(docInput({ title: 'Second' }))

    const docs = await listDocuments()
    // Second was created after First, so should appear first
    const ids = docs.map((d) => d.id)
    expect(ids.indexOf(d2.id)).toBeLessThan(ids.indexOf(d1.id))
  })

  it('hides Draft documents created by others from ContentEditor', async () => {
    setAdmin('admin-1')
    await createDocument(docInput({ title: 'Secret Draft' }))

    // editor-2 has viewDocuments but can only see own docs + Approved/Archived
    setEditor('editor-2')
    const docs = await listDocuments()
    expect(docs.find((d) => d.status === 'Draft' && d.createdBy === 'admin-1')).toBeUndefined()
  })

  it('throws Forbidden when unauthenticated', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await expect(listDocuments()).rejects.toThrow(/Forbidden/)
  })
})

// ── searchDocuments ───────────────────────────────────────────────────────────

describe('searchDocuments', () => {
  it('returns documents matching a text query (title)', async () => {
    setAdmin()
    await createDocument(docInput({ title: 'Alpha Report' }))
    await createDocument(docInput({ title: 'Beta Manual' }))

    // status filter uses indexed path; query filters in-memory
    const results = await searchDocuments({ status: 'Draft', query: 'alpha' })
    expect(results.every((d) => d.title.toLowerCase().includes('alpha'))).toBe(true)
    expect(results.find((d) => d.title === 'Beta Manual')).toBeUndefined()
  })

  it('filters by status', async () => {
    setAdmin()
    await createDocument(docInput({ title: 'Draft Doc' }))

    const results = await searchDocuments({ status: 'Draft' })
    expect(results.every((d) => d.status === 'Draft')).toBe(true)
  })

  it('filters by categoryId', async () => {
    setAdmin()
    await createDocument(docInput({ categoryId: 'cat-target', title: 'Targeted' }))
    await createDocument(docInput({ categoryId: 'cat-other', title: 'Other' }))

    const results = await searchDocuments({ categoryId: 'cat-target' })
    expect(results.every((d) => d.categoryId === 'cat-target')).toBe(true)
  })

  it('filters by type (combined with status to avoid full-scan path)', async () => {
    setAdmin()
    await createDocument(docInput({ type: 'Policy', title: 'Policy Doc' }))
    await createDocument(docInput({ type: 'Procedure', title: 'Procedure Doc' }))

    // Provide status to use the indexed status path, then type filters in-memory
    const results = await searchDocuments({ status: 'Draft', type: 'Policy' })
    expect(results.every((d) => d.type === 'Policy')).toBe(true)
  })

  it('filters by tag', async () => {
    setAdmin()
    await createDocument(docInput({ tags: ['special-tag'], title: 'Tagged Doc' }))
    await createDocument(docInput({ tags: ['other-tag'], title: 'Other Doc' }))

    const results = await searchDocuments({ tag: 'special-tag' })
    // The tagged doc should appear; other should not
    expect(results.find((d) => d.title === 'Tagged Doc')).toBeDefined()
    expect(results.find((d) => d.title === 'Other Doc')).toBeUndefined()
  })

  it('returns empty array when no documents match query', async () => {
    setAdmin()
    await createDocument(docInput({ title: 'Alpha Doc' }))
    const results = await searchDocuments({ status: 'Draft', query: 'nonexistent-xyz-123' })
    expect(results).toHaveLength(0)
  })

  it('returns all admin-visible docs when no criteria given (full-scan path)', async () => {
    setAdmin()
    await createDocument(docInput({ title: 'No Criteria Doc' }))
    const results = await searchDocuments({})
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('excludes Destroyed documents when no status filter is set', async () => {
    setAdmin()
    // Create two docs; one gets manually set to Destroyed via db (bypass service)
    await createDocument(docInput({ title: 'Normal Doc' }))
    const toDestroy = await createDocument(docInput({ title: 'To Destroy' }))
    // Manually override status to Destroyed in the raw DB
    const rawRow = await db.documents.get(toDestroy.id)
    if (rawRow) await db.documents.update(toDestroy.id, { status: 'Destroyed' })

    const results = await searchDocuments({})
    expect(results.find((d) => d.id === toDestroy.id)).toBeUndefined()
  })

  it('throws Forbidden when unauthenticated', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await expect(searchDocuments({})).rejects.toThrow(/Forbidden/)
  })
})

// ── listDocumentVersions ──────────────────────────────────────────────────────

describe('listDocumentVersions', () => {
  it('returns versions for a visible document', async () => {
    setAdmin()
    const doc = await createDocument(docInput())
    // Checkout and checkin to create a version snapshot
    await checkoutDocument(doc.id)
    await checkinDocument(doc.id)

    const versions = await listDocumentVersions(doc.id)
    expect(versions.length).toBeGreaterThanOrEqual(1)
    expect(versions[0].documentId).toBe(doc.id)
  })

  it('returns empty array when document is not visible to editor', async () => {
    setAdmin('admin-1')
    const doc = await createDocument(docInput())

    // editor-2 cannot see admin-1's Draft document
    setEditor('editor-2')
    const versions = await listDocumentVersions(doc.id)
    expect(versions).toHaveLength(0)
  })
})

// ── listAllDocumentVersions ───────────────────────────────────────────────────

describe('listAllDocumentVersions', () => {
  it('returns all versions visible to admin', async () => {
    setAdmin()
    const doc = await createDocument(docInput())
    await checkoutDocument(doc.id)
    await checkinDocument(doc.id)

    const versions = await listAllDocumentVersions()
    expect(versions.length).toBeGreaterThanOrEqual(1)
  })

  it('throws Forbidden when unauthenticated', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await expect(listAllDocumentVersions()).rejects.toThrow(/Forbidden/)
  })
})

// ── Document templates ────────────────────────────────────────────────────────

describe('createDocumentTemplate', () => {
  it('creates a template for Administrator', async () => {
    setAdmin()
    const template = await createDocumentTemplate(templateInput())
    expect(template.id).toBeTruthy()
    expect(template.name).toBe('Test Template')
    expect(template.createdBy).toBe('admin-1')

    const stored = await db.documentTemplates.get(template.id)
    expect(stored).toBeDefined()
  })

  it('throws Forbidden for ContentEditor (lacks manageDocuments)', async () => {
    setEditor()
    await expect(createDocumentTemplate(templateInput())).rejects.toThrow(/Forbidden/)
  })

  it('throws Forbidden for ReviewerApprover', async () => {
    setReviewer()
    await expect(createDocumentTemplate(templateInput())).rejects.toThrow(/Forbidden/)
  })

  it('writes an audit log on template creation', async () => {
    setAdmin()
    await createDocumentTemplate(templateInput())
    const logs = await db.auditLogs
      .where('eventType')
      .equals('document.template_created')
      .toArray()
    expect(logs).toHaveLength(1)
  })
})

describe('listDocumentTemplates', () => {
  it('returns all templates for Administrator', async () => {
    setAdmin()
    await createDocumentTemplate(templateInput({ name: 'T1' }))
    await createDocumentTemplate(templateInput({ name: 'T2' }))

    const templates = await listDocumentTemplates()
    expect(templates.length).toBeGreaterThanOrEqual(2)
  })

  it('allows ContentEditor to list templates (has createDocument)', async () => {
    setAdmin()
    await createDocumentTemplate(templateInput())

    setEditor()
    const templates = await listDocumentTemplates()
    expect(templates.length).toBeGreaterThanOrEqual(1)
  })

  it('throws Forbidden for Participant', async () => {
    setParticipant()
    await expect(listDocumentTemplates()).rejects.toThrow(/Forbidden/)
  })
})

describe('getDocumentTemplate', () => {
  it('returns a template by id', async () => {
    setAdmin()
    const template = await createDocumentTemplate(templateInput())
    const retrieved = await getDocumentTemplate(template.id)
    expect(retrieved?.id).toBe(template.id)
    expect(retrieved?.name).toBe('Test Template')
  })

  it('returns null when template does not exist', async () => {
    setAdmin()
    const result = await getDocumentTemplate('no-id')
    expect(result).toBeNull()
  })

  it('throws Forbidden for Participant', async () => {
    setParticipant()
    await expect(getDocumentTemplate('any-id')).rejects.toThrow(/Forbidden/)
  })
})
