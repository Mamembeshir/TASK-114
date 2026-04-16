/**
 * DocumentService — CRUD, checkout/checkin, approval workflow, and destruction.
 *
 * Key design decisions (CLAUDE.md #5, #6, #7):
 *   - Exclusive checkout: only one user can edit at a time
 *   - Document number assigned ONLY on Draft → Approved (to avoid numbering gaps)
 *   - Two-step destruction: Reviewer approves → Administrator confirms
 *
 * Security: Document `title` and `body` (and DocumentVersion equivalents) are
 * encrypted with AES-GCM-256 before every IndexedDB write, and decrypted after
 * every read.  Use the public `getDocumentById` / `listDocuments` helpers so
 * callers always receive plaintext values.
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import { encrypt, decrypt } from '@/crypto/encryption'
import { getAppKey } from '@/crypto/appKey'
import { writeAuditLog } from '@/utils/audit'
import { moderateContent } from '@/utils/moderation'
import { requirePermission } from '@/utils/permissions'
import { isExternalUrl } from '@/utils/fileUtils'
import { useAuthStore } from '@/store/authStore'
import { hasPermission } from '@/auth/permissions'
import { notify, notifyMany } from './notificationService'
import { Role } from '@/types'
import type { Document, DocumentTemplate, DocumentVersion } from '@/types'

// ── Field-level encryption helpers ────────────────────────────────────────────

async function encStr(value: string): Promise<string> {
  return encrypt(value, await getAppKey())
}

async function decStr(cipher: string): Promise<string> {
  return decrypt(cipher, await getAppKey())
}

/**
 * Shape of a Document row as stored in IndexedDB.
 * `title`, `body`, and `metadata` are AES-GCM-256 ciphertext strings.
 * `metadata` is the encrypted JSON serialisation of `Record<string,string>`.
 */
type StoredDocument = Omit<Document, 'metadata'> & { metadata: string }

/**
 * Return a copy of `doc` with `title` and `body` encrypted for DB storage.
 * Used for DocumentVersion objects which have no metadata field.
 */
async function encryptDocFields<T extends { title: string; body: string }>(doc: T): Promise<T> {
  return {
    ...doc,
    title: await encStr(doc.title),
    body: await encStr(doc.body),
  }
}

/**
 * Return a copy of `doc` with `title` and `body` decrypted from DB ciphertext.
 * Used for DocumentVersion objects which have no metadata field.
 */
async function decryptDocFields<T extends { title: string; body: string }>(doc: T): Promise<T> {
  return {
    ...doc,
    title: await decStr(doc.title),
    body: await decStr(doc.body),
  }
}

/**
 * Encrypt a full Document for IndexedDB storage.
 * Encrypts `title`, `body`, and `metadata` (serialised as JSON then AES-GCM-256).
 */
async function encryptDocument(doc: Document): Promise<StoredDocument> {
  return {
    ...doc,
    title: await encStr(doc.title),
    body: await encStr(doc.body),
    // Default to {} when metadata was omitted (optional field) so the stored
    // ciphertext is always valid JSON when decrypted.
    metadata: await encStr(JSON.stringify(doc.metadata ?? {})),
  }
}

/**
 * Decrypt a StoredDocument from IndexedDB to a plaintext Document.
 * Decrypts `title`, `body`, and `metadata` (AES-GCM-256 then JSON.parse).
 */
async function decryptDocument(raw: StoredDocument): Promise<Document> {
  // Guard: rows written before the v6 migration may still carry a plaintext
  // object.  Treat them as already-decrypted until the migration catches up.
  const metadataIsEncrypted = typeof raw.metadata === 'string'
  const metadata: Record<string, string> = metadataIsEncrypted
    ? (JSON.parse(await decStr(raw.metadata)) as Record<string, string>)
    : ((raw.metadata as unknown as Record<string, string>) ?? {})

  return {
    ...raw,
    title: await decStr(raw.title),
    body: await decStr(raw.body),
    metadata,
  }
}

// ── Private DB read helpers ───────────────────────────────────────────────────

/** Read a document by id and decrypt all sensitive fields. Returns null if not found. */
async function readDoc(id: string): Promise<Document | null> {
  const raw = await db.documents.get(id)
  return raw ? decryptDocument(raw as unknown as StoredDocument) : null
}

// ── Object/status scoping ────────────────────────────────────────────────────

/** Statuses visible to non-admin, non-reviewer roles (approved lifecycle). */
const PUBLIC_STATUSES: string[] = ['Approved', 'Archived']

/** Statuses a reviewer may additionally see (anything in their workflow). */
const REVIEWER_STATUSES: string[] = ['InReview', 'Approved', 'PendingDestruction', 'Archived']

/**
 * Returns true when `doc` should be visible to the current user.
 *
 * Scoping rules:
 *  - Administrator (manageDocuments): sees all documents.
 *  - Reviewer (approveDocument): sees own docs + docs in review/approved/pending-destruction/archived.
 *  - ContentEditor (createDocument): sees own docs + approved/archived docs.
 */
function isDocumentVisible(doc: Document, userId: string, role: Role): boolean {
  if (hasPermission(role, 'manageDocuments')) return true
  if (doc.createdBy === userId) return true
  if (hasPermission(role, 'approveDocument')) {
    return REVIEWER_STATUSES.includes(doc.status)
  }
  return PUBLIC_STATUSES.includes(doc.status)
}

// ── Public read helpers ───────────────────────────────────────────────────────

/** Return a decrypted document by id, or null if not visible to the current user. */
export async function getDocumentById(id: string): Promise<Document | null> {
  requirePermission('viewDocuments')
  const doc = await readDoc(id)
  if (!doc) return null
  const currentUser = useAuthStore.getState().currentUser!
  if (!isDocumentVisible(doc, currentUser.id, currentUser.role)) return null
  return doc
}

/** Return all documents visible to the current user, newest-first. */
export async function listDocuments(): Promise<Document[]> {
  requirePermission('viewDocuments')
  const currentUser = useAuthStore.getState().currentUser!
  const raws = await db.documents.toArray()
  const docs = await Promise.all((raws as unknown as StoredDocument[]).map(decryptDocument))
  return docs
    .filter((doc) => isDocumentVisible(doc, currentUser.id, currentUser.role))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Return all versions for a specific document with sensitive fields decrypted. */
export async function listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  requirePermission('viewDocuments')
  // Enforce object-level visibility on the parent document
  const doc = await getDocumentById(documentId)
  if (!doc) return []
  const raws = await db.documentVersions
    .where('documentId')
    .equals(documentId)
    .sortBy('versionNumber')
  return Promise.all(raws.map(decryptDocFields))
}

/** Return ALL document versions across all documents with sensitive fields decrypted. */
export async function listAllDocumentVersions(): Promise<DocumentVersion[]> {
  requirePermission('viewDocuments')
  const currentUser = useAuthStore.getState().currentUser!
  // Build a set of visible document IDs using object-level checks
  const allDocs = await db.documents.toArray()
  const decryptedDocs = await Promise.all((allDocs as unknown as StoredDocument[]).map(decryptDocument))
  const visibleDocIds = new Set(
    decryptedDocs
      .filter((doc) => isDocumentVisible(doc, currentUser.id, currentUser.role))
      .map((doc) => doc.id),
  )
  const raws = await db.documentVersions.toArray()
  const filtered = raws.filter((v) => visibleDocIds.has(v.documentId))
  return Promise.all(filtered.map(decryptDocFields))
}

// ── Watermark ─────────────────────────────────────────────────────────────────

export function generateWatermark(userId: string, displayName: string): string {
  const date = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
  return `CONFIDENTIAL – INTERNAL USE · ${displayName} (${userId.slice(-4)}) · ${date}`
}

// ── Document numbering ────────────────────────────────────────────────────────

async function assignDocumentNumber(): Promise<string> {
  return db.transaction('rw', db.systemConfig, async () => {
    let config = await db.systemConfig.get('singleton')
    if (!config) {
      config = {
        id: 'singleton',
        orgName: 'Meridian',
        documentNumberPrefix: 'ORG',
        documentNumberCounter: 0,
        defaultRetentionYears: 7,
        antiSnipingWindowSeconds: 30,
        antiSnipingExtensionMinutes: 2,
        defaultMinimumIncrement: 1,
        updatedAt: Date.now(),
        updatedBy: 'system',
      }
      await db.systemConfig.add(config)
    }
    const next = config.documentNumberCounter + 1
    await db.systemConfig.update('singleton', {
      documentNumberCounter: next,
      updatedAt: Date.now(),
    })
    const year = new Date().getFullYear()
    return `${config.documentNumberPrefix}-${String(year)}-${String(next).padStart(6, '0')}`
  })
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export interface DocumentInput {
  title: string
  type: string
  categoryId: string
  body: string
  attachmentUrls: string[]
  retentionYears: number
  tags: string[]
  /** Arbitrary key-value metadata. Optional — defaults to {} when omitted. */
  metadata?: Record<string, string>
  templateId?: string
}

// ── Document Templates ────────────────────────────────────────────────────────

export interface DocumentTemplateInput {
  name: string
  type: string
  categoryId: string
  body: string
  defaultRetentionYears: number
  tags: string[]
}

export async function createDocumentTemplate(
  input: DocumentTemplateInput,
): Promise<DocumentTemplate> {
  requirePermission('manageDocuments')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const now = Date.now()
  const template: DocumentTemplate = {
    id: generateId(),
    ...input,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  }
  await db.documentTemplates.add(template)
  await writeAuditLog({
    eventType: 'document.template_created',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: template.id,
    description: `${actorName} created document template "${template.name}"`,
  })
  return template
}

export async function listDocumentTemplates(): Promise<DocumentTemplate[]> {
  requirePermission('createDocument')
  return db.documentTemplates.orderBy('createdAt').reverse().toArray()
}

export async function getDocumentTemplate(id: string): Promise<DocumentTemplate | null> {
  requirePermission('createDocument')
  return (await db.documentTemplates.get(id)) ?? null
}

/**
 * Multidimensional document search using indexed Dexie queries where possible,
 * with in-memory filtering for non-indexed criteria.
 */
export async function searchDocuments(criteria: {
  query?: string
  status?: string
  categoryId?: string
  type?: string
  tag?: string
}): Promise<Document[]> {
  requirePermission('viewDocuments')
  let raws: Document[]

  if (criteria.tag) {
    // Use the *tags multi-entry index for efficient tag lookup
    raws = await db.documents.where('tags').equals(criteria.tag).toArray()
  } else if (criteria.status && criteria.status !== 'All') {
    raws = await db.documents.where('status').equals(criteria.status).toArray()
  } else if (criteria.categoryId) {
    raws = await db.documents.where('categoryId').equals(criteria.categoryId).toArray()
  } else {
    // updatedAt is not indexed — fetch all and sort in-memory (line 348)
    raws = await db.documents.toArray()
  }

  // Decrypt all sensitive fields (title, body, metadata)
  let results = await Promise.all((raws as unknown as StoredDocument[]).map(decryptDocument))

  // Apply remaining in-memory filters
  if (criteria.status && criteria.status !== 'All') {
    results = results.filter((d) => d.status === criteria.status)
  }
  if (criteria.categoryId) {
    results = results.filter((d) => d.categoryId === criteria.categoryId)
  }
  if (criteria.type) {
    results = results.filter((d) => d.type === criteria.type)
  }
  if (criteria.query) {
    const q = criteria.query.toLowerCase()
    results = results.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.documentNumber ?? '').toLowerCase().includes(q) ||
        (d.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    )
  }

  // Enforce object-level visibility
  const currentUser = useAuthStore.getState().currentUser!
  results = results.filter((d) => isDocumentVisible(d, currentUser.id, currentUser.role))

  // Exclude destroyed documents unless explicitly requested
  if (!criteria.status || criteria.status === 'All') {
    results = results.filter((d) => d.status !== 'Destroyed')
  }

  return results.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function createDocument(
  input: DocumentInput,
): Promise<Document> {
  requirePermission('createDocument')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  if (input.attachmentUrls.some(isExternalUrl)) {
    throw new Error('External URLs are not allowed — upload files from your device')
  }
  const moderationFlags = await moderateContent([input.title, input.body])
  const doc: Document = {
    id: generateId(),
    ...input,
    metadata: input.metadata ?? {},
    status: 'Draft',
    moderationFlags,
    createdBy: actorId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  // Store encrypted (title, body, metadata) — callers always receive the plaintext `doc`
  await db.documents.add(await encryptDocument(doc) as unknown as Document)
  await writeAuditLog({
    eventType: 'document.created',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: doc.id,
    description: `${actorName} created document "${doc.title}"`,
  })
  return doc
}

export async function updateDocument(
  id: string,
  updates: Partial<DocumentInput>,
): Promise<void> {
  requirePermission('createDocument')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  if (updates.attachmentUrls?.some(isExternalUrl)) {
    throw new Error('External URLs are not allowed — upload files from your device')
  }
  const doc = await readDoc(id)
  if (!doc) throw new Error('Document not found')
  if (doc.checkedOutBy && doc.checkedOutBy !== actorId)
    throw new Error('Document is checked out by another user')
  if (!['Draft', 'Rejected'].includes(doc.status))
    throw new Error('Only Draft or Rejected documents can be edited')
  // Object-level: editors may only update documents they created;
  // manageDocuments bypasses this (admin override).
  if (doc.createdBy !== actorId && !hasPermission(currentUser.role, 'manageDocuments'))
    throw new Error('Forbidden: you can only edit documents you created')

  const textsToCheck = [updates.title ?? doc.title, updates.body ?? doc.body]
  const moderationFlags = await moderateContent(textsToCheck)

  // Only encrypt the sensitive fields that are actually being updated.
  // metadata is serialised as JSON then encrypted, mirroring the write path in encryptDocument.
  const encUpdates: Record<string, unknown> = {
    ...updates,
    moderationFlags,
    updatedAt: Date.now(),
  }
  if (updates.title !== undefined) encUpdates.title = await encStr(updates.title)
  if (updates.body !== undefined) encUpdates.body = await encStr(updates.body)
  if (updates.metadata !== undefined) {
    encUpdates.metadata = await encStr(JSON.stringify(updates.metadata))
  }

  await db.documents.update(id, encUpdates as unknown as Partial<Document>)
  await writeAuditLog({
    eventType: 'document.updated',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: id,
    description: `${actorName} updated document "${doc.title}"`,
  })
}

// ── Checkout / Check-in ───────────────────────────────────────────────────────

const CHECKOUT_TIMEOUT_MS = 4 * 60 * 60 * 1000 // 4 hours auto-release

export async function checkoutDocument(
  id: string,
): Promise<void> {
  requirePermission('checkoutDocument')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const doc = await readDoc(id)
  if (!doc) throw new Error('Document not found')

  // Auto-release if expired checkout exists
  if (doc.checkedOutBy && doc.checkoutExpiresAt && doc.checkoutExpiresAt < Date.now()) {
    await db.checkoutRecords
      .where('documentId')
      .equals(id)
      .filter((r) => r.isActive)
      .modify({ isActive: false, checkedInAt: Date.now() })
    await db.documents.update(id, {
      checkedOutBy: undefined,
      checkedOutAt: undefined,
      checkoutExpiresAt: undefined,
    })
  }

  const fresh = await readDoc(id)
  if (!fresh) throw new Error('Document not found')
  if (fresh.checkedOutBy) throw new Error(`Document is checked out by another user`)

  const now = Date.now()
  const checkoutRecord = {
    id: generateId(),
    documentId: id,
    userId: actorId,
    checkedOutAt: now,
    isActive: true,
  }
  await db.checkoutRecords.add(checkoutRecord)
  await db.documents.update(id, {
    checkedOutBy: actorId,
    checkedOutAt: now,
    checkoutExpiresAt: now + CHECKOUT_TIMEOUT_MS,
    updatedAt: now,
  })

  await writeAuditLog({
    eventType: 'document.checked_out',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: id,
    description: `${actorName} checked out document "${fresh.title}"`,
  })
}

export async function checkinDocument(
  id: string,
): Promise<void> {
  requirePermission('checkoutDocument')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const doc = await readDoc(id)
  if (!doc) throw new Error('Document not found')
  if (doc.checkedOutBy !== actorId)
    throw new Error('You do not hold the checkout lock for this document')

  const now = Date.now()
  const watermark = generateWatermark(actorId, actorName)

  // Save a version snapshot on check-in (title/body encrypted at rest)
  const versionNumber = (await db.documentVersions.where('documentId').equals(id).count()) + 1
  await db.documentVersions.add(
    await encryptDocFields({
      id: generateId(),
      documentId: id,
      versionNumber,
      title: doc.title,
      body: doc.body,
      status: doc.status,
      watermark,
      createdBy: actorId,
      createdAt: now,
    }),
  )

  await db.checkoutRecords
    .where('documentId')
    .equals(id)
    .filter((r) => r.isActive && r.userId === actorId)
    .modify({ isActive: false, checkedInAt: now })

  await db.documents.update(id, {
    checkedOutBy: undefined,
    checkedOutAt: undefined,
    checkoutExpiresAt: undefined,
    updatedAt: now,
  })

  await writeAuditLog({
    eventType: 'document.checked_in',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: id,
    description: `${actorName} checked in document "${doc.title}"`,
  })
}

export async function releaseCheckout(
  id: string,
): Promise<void> {
  requirePermission('manageDocuments')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const doc = await readDoc(id)
  if (!doc) throw new Error('Document not found')

  await db.checkoutRecords
    .where('documentId')
    .equals(id)
    .filter((r) => r.isActive)
    .modify({ isActive: false, checkedInAt: Date.now() })

  await db.documents.update(id, {
    checkedOutBy: undefined,
    checkedOutAt: undefined,
    checkoutExpiresAt: undefined,
    updatedAt: Date.now(),
  })

  await writeAuditLog({
    eventType: 'document.checkout_released',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: id,
    description: `${actorName} released checkout for document "${doc.title}"`,
  })
}

// ── Approval workflow ─────────────────────────────────────────────────────────

export async function submitDocumentForReview(
  id: string,
): Promise<void> {
  requirePermission('createDocument')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const doc = await readDoc(id)
  if (!doc) throw new Error('Document not found')
  if (!['Draft', 'Rejected'].includes(doc.status))
    throw new Error('Only Draft or Rejected documents can be submitted for review')
  // Object-level: only the author may submit their own document for review.
  if (doc.createdBy !== actorId)
    throw new Error('Forbidden: you can only submit documents you created')

  const moderationFlags = await moderateContent([doc.title, doc.body])
  if (moderationFlags.length > 0) {
    await db.documents.update(id, { moderationFlags, updatedAt: Date.now() })
    throw new Error(`Cannot submit: moderation flags detected — ${moderationFlags.join(', ')}`)
  }

  await db.documents.update(id, { status: 'InReview', moderationFlags: [], updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'document.submitted',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: id,
    description: `${actorName} submitted document "${doc.title}" for review`,
  })
}

export async function approveDocument(
  id: string,
  comment?: string,
): Promise<void> {
  requirePermission('approveDocument')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const doc = await readDoc(id)
  if (!doc) throw new Error('Document not found')
  if (doc.status !== 'InReview') throw new Error('Document is not in review')
  // Self-review prevention: the author must not approve their own work.
  if (doc.createdBy === actorId)
    throw new Error('Forbidden: you cannot approve a document you created')

  const documentNumber = await assignDocumentNumber()
  const now = Date.now()
  const retentionDueDate = now + doc.retentionYears * 365.25 * 24 * 3600 * 1000

  const versionNumber = (await db.documentVersions.where('documentId').equals(id).count()) + 1
  const watermark = generateWatermark(actorId, actorName)
  await db.documentVersions.add(
    await encryptDocFields({
      id: generateId(),
      documentId: id,
      versionNumber,
      title: doc.title,
      body: doc.body,
      status: 'Approved' as const,
      reviewComment: comment,
      reviewedBy: actorId,
      reviewedAt: now,
      watermark,
      createdBy: actorId,
      createdAt: now,
    }),
  )

  await db.documents.update(id, {
    status: 'Approved',
    documentNumber,
    retentionDueDate,
    updatedAt: now,
  })

  await writeAuditLog({
    eventType: 'document.approved',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: id,
    description: `${actorName} approved document "${doc.title}" → ${documentNumber}`,
  })

  await notify({
    userId: doc.createdBy,
    type: 'DocumentApproved',
    title: 'Document Approved',
    message: `"${doc.title}" has been approved and assigned number ${documentNumber}.`,
    relatedEntityType: 'Document',
    relatedEntityId: id,
  })
}

export async function rejectDocument(
  id: string,
  comment: string,
): Promise<void> {
  requirePermission('approveDocument')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const doc = await readDoc(id)
  if (!doc) throw new Error('Document not found')
  if (doc.status !== 'InReview') throw new Error('Document is not in review')
  // Self-review prevention: the author must not reject their own work.
  if (doc.createdBy === actorId)
    throw new Error('Forbidden: you cannot reject a document you created')

  await db.documents.update(id, { status: 'Rejected', updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'document.rejected',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: id,
    description: `${actorName} rejected document "${doc.title}" — ${comment}`,
  })

  await notify({
    userId: doc.createdBy,
    type: 'DocumentRejected',
    title: 'Document Rejected',
    message: `"${doc.title}" was rejected: ${comment}`,
    relatedEntityType: 'Document',
    relatedEntityId: id,
  })
}

// ── Destruction workflow ──────────────────────────────────────────────────────

export async function requestDestruction(
  id: string,
  reason: string,
): Promise<void> {
  requirePermission('approveDestruction')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const doc = await readDoc(id)
  if (!doc) throw new Error('Document not found')
  if (!['Approved', 'Archived'].includes(doc.status))
    throw new Error('Only Approved or Archived documents can be flagged for destruction')
  if (doc.retentionDueDate && doc.retentionDueDate > Date.now())
    throw new Error('Document cannot be destroyed before its retention period has elapsed')

  await db.destructionApprovals.add({
    id: generateId(),
    documentId: id,
    requestedBy: actorId,
    requestedAt: Date.now(),
    reason,
    status: 'Pending',
  })

  await db.documents.update(id, { status: 'PendingDestruction', updatedAt: Date.now() })

  await writeAuditLog({
    eventType: 'document.destruction_requested',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: id,
    description: `${actorName} requested destruction of "${doc.title}" — reason: ${reason}`,
  })

  // Notify all Administrators that a destruction request needs their approval
  const admins = await db.users.filter((u) => u.role === Role.Administrator && u.isActive).toArray()
  const adminIds = admins.map((u) => u.id)
  await notifyMany(adminIds, {
    type: 'DocumentDestructionRequested',
    title: 'Destruction Request Pending',
    message: `Document "${doc.title}" has been flagged for destruction by ${actorName} and requires reviewer then admin approval.`,
    relatedEntityType: 'Document',
    relatedEntityId: id,
  })
}

export async function reviewerApproveDestruction(
  approvalId: string,
): Promise<void> {
  requirePermission('approveDocument')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const actor = await db.users.get(actorId)
  if (!actor || actor.role !== Role.ReviewerApprover) {
    throw new Error('Forbidden: only a ReviewerApprover may perform the reviewer step')
  }

  const approval = await db.destructionApprovals.get(approvalId)
  if (!approval) throw new Error('Approval record not found')
  if (approval.status !== 'Pending') throw new Error('Approval is not in Pending state')

  await db.destructionApprovals.update(approvalId, {
    status: 'ReviewerApproved',
    reviewerApprovedBy: actorId,
    reviewerApprovedAt: Date.now(),
  })

  await writeAuditLog({
    eventType: 'document.destruction_reviewer_approved',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: approval.documentId,
    description: `${actorName} gave reviewer approval for destruction`,
  })
}

export async function adminApproveDestruction(
  approvalId: string,
): Promise<void> {
  requirePermission('approveDestruction')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const actor = await db.users.get(actorId)
  if (!actor || actor.role !== Role.Administrator) {
    throw new Error('Forbidden: only an Administrator may perform the final destruction approval')
  }

  const approval = await db.destructionApprovals.get(approvalId)
  if (!approval) throw new Error('Approval record not found')
  if (approval.status !== 'ReviewerApproved') throw new Error('Reviewer approval required first')

  if (approval.reviewerApprovedBy === actorId) {
    throw new Error('Role separation violation: the admin approver must be a different person than the reviewer')
  }

  const now = Date.now()
  await db.destructionApprovals.update(approvalId, {
    status: 'FullyApproved',
    adminApprovedBy: actorId,
    adminApprovedAt: now,
  })

  await db.documents.update(approval.documentId, { status: 'Destroyed', updatedAt: now })

  const doc = await readDoc(approval.documentId)
  await writeAuditLog({
    eventType: 'document.destroyed',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: approval.documentId,
    description: `${actorName} gave final approval — document "${doc?.title ?? approval.documentId}" DESTROYED. Reason: ${approval.reason}`,
  })
}

export async function rejectDestruction(
  approvalId: string,
  reason: string,
): Promise<void> {
  requirePermission('approveDestruction')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const approval = await db.destructionApprovals.get(approvalId)
  if (!approval) throw new Error('Approval record not found')

  await db.destructionApprovals.update(approvalId, {
    status: 'Rejected',
    rejectedBy: actorId,
    rejectedAt: Date.now(),
    rejectionReason: reason,
  })

  await db.documents.update(approval.documentId, { status: 'Approved', updatedAt: Date.now() })

  await writeAuditLog({
    eventType: 'document.destruction_rejected',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: approval.documentId,
    description: `${actorName} rejected destruction request — ${reason}`,
  })
}
