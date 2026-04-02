/**
 * DocumentService — CRUD, checkout/checkin, approval workflow, and destruction.
 *
 * Key design decisions (CLAUDE.md #5, #6, #7):
 *   - Exclusive checkout: only one user can edit at a time
 *   - Document number assigned ONLY on Draft → Approved (to avoid numbering gaps)
 *   - Two-step destruction: Reviewer approves → Administrator confirms
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import { writeAuditLog } from '@/utils/audit'
import { moderateContent } from '@/utils/moderation'
import { requirePermission } from '@/utils/permissions'
import { createNotification, createNotificationForMany } from './notificationService'
import { Role } from '@/types'
import type { Document } from '@/types'

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
        defaultMinimumIncrement: 100,
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
}

export async function createDocument(
  input: DocumentInput,
  actorId: string,
  actorName: string,
): Promise<Document> {
  requirePermission('createDocument')
  const moderationFlags = await moderateContent([input.title, input.body])
  const doc: Document = {
    id: generateId(),
    ...input,
    status: 'Draft',
    moderationFlags,
    createdBy: actorId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.documents.add(doc)
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
  actorId: string,
  actorName: string,
): Promise<void> {
  const doc = await db.documents.get(id)
  if (!doc) throw new Error('Document not found')
  if (doc.checkedOutBy && doc.checkedOutBy !== actorId)
    throw new Error('Document is checked out by another user')
  if (!['Draft', 'Rejected'].includes(doc.status))
    throw new Error('Only Draft or Rejected documents can be edited')

  const textsToCheck = [updates.title ?? doc.title, updates.body ?? doc.body]
  const moderationFlags = await moderateContent(textsToCheck)

  await db.documents.update(id, { ...updates, moderationFlags, updatedAt: Date.now() })
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
  actorId: string,
  actorName: string,
): Promise<void> {
  const doc = await db.documents.get(id)
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

  const fresh = await db.documents.get(id)
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
  actorId: string,
  actorName: string,
): Promise<void> {
  const doc = await db.documents.get(id)
  if (!doc) throw new Error('Document not found')
  if (doc.checkedOutBy !== actorId)
    throw new Error('You do not hold the checkout lock for this document')

  const now = Date.now()
  const watermark = generateWatermark(actorId, actorName)

  // Save a version snapshot on check-in
  const versionNumber = (await db.documentVersions.where('documentId').equals(id).count()) + 1
  await db.documentVersions.add({
    id: generateId(),
    documentId: id,
    versionNumber,
    title: doc.title,
    body: doc.body,
    status: doc.status,
    watermark,
    createdBy: actorId,
    createdAt: now,
  })

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
  actorId: string,
  actorName: string,
): Promise<void> {
  const doc = await db.documents.get(id)
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
  actorId: string,
  actorName: string,
): Promise<void> {
  const doc = await db.documents.get(id)
  if (!doc) throw new Error('Document not found')
  if (!['Draft', 'Rejected'].includes(doc.status))
    throw new Error('Only Draft or Rejected documents can be submitted for review')

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
  actorId: string,
  actorName: string,
  comment?: string,
): Promise<void> {
  const doc = await db.documents.get(id)
  if (!doc) throw new Error('Document not found')
  if (doc.status !== 'InReview') throw new Error('Document is not in review')

  const documentNumber = await assignDocumentNumber()
  const now = Date.now()
  const retentionDueDate = now + doc.retentionYears * 365.25 * 24 * 3600 * 1000

  const versionNumber = (await db.documentVersions.where('documentId').equals(id).count()) + 1
  const watermark = generateWatermark(actorId, actorName)
  await db.documentVersions.add({
    id: generateId(),
    documentId: id,
    versionNumber,
    title: doc.title,
    body: doc.body,
    status: 'Approved',
    reviewComment: comment,
    reviewedBy: actorId,
    reviewedAt: now,
    watermark,
    createdBy: actorId,
    createdAt: now,
  })

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

  await createNotification({
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
  actorId: string,
  actorName: string,
  comment: string,
): Promise<void> {
  const doc = await db.documents.get(id)
  if (!doc) throw new Error('Document not found')
  if (doc.status !== 'InReview') throw new Error('Document is not in review')

  await db.documents.update(id, { status: 'Rejected', updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'document.rejected',
    actorId,
    actorName,
    entityType: 'Document',
    entityId: id,
    description: `${actorName} rejected document "${doc.title}" — ${comment}`,
  })

  await createNotification({
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
  actorId: string,
  actorName: string,
): Promise<void> {
  const doc = await db.documents.get(id)
  if (!doc) throw new Error('Document not found')
  if (!['Approved', 'Archived'].includes(doc.status))
    throw new Error('Only Approved or Archived documents can be flagged for destruction')

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
  await createNotificationForMany(adminIds, {
    type: 'DocumentDestructionRequested',
    title: 'Destruction Request Pending',
    message: `Document "${doc.title}" has been flagged for destruction by ${actorName} and requires reviewer then admin approval.`,
    relatedEntityType: 'Document',
    relatedEntityId: id,
  })
}

export async function reviewerApproveDestruction(
  approvalId: string,
  actorId: string,
  actorName: string,
): Promise<void> {
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
  actorId: string,
  actorName: string,
): Promise<void> {
  const approval = await db.destructionApprovals.get(approvalId)
  if (!approval) throw new Error('Approval record not found')
  if (approval.status !== 'ReviewerApproved') throw new Error('Reviewer approval required first')

  const now = Date.now()
  await db.destructionApprovals.update(approvalId, {
    status: 'FullyApproved',
    adminApprovedBy: actorId,
    adminApprovedAt: now,
  })

  await db.documents.update(approval.documentId, { status: 'Destroyed', updatedAt: now })

  const doc = await db.documents.get(approval.documentId)
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
  actorId: string,
  actorName: string,
): Promise<void> {
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
