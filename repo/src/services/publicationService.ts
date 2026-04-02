/**
 * PublicationService — workflow for drafting, reviewing, and publishing content.
 *
 * Status machine:
 *   Draft → InReview  (submitForReview)
 *   InReview → Approved | Rejected  (approve / reject — Reviewer role)
 *   Approved → Published  (publish — ContentEditor / Admin)
 *   Published → (terminal)
 *   Rejected → Draft  (re-open for editing)
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import { writeAuditLog } from '@/utils/audit'
import { moderateContent } from '@/utils/moderation'
import { createNotification } from './notificationService'
import type { Publication, PublicationType, WorkflowStatus } from '@/types'

// ── helpers ───────────────────────────────────────────────────────────────────

async function nextVersionNumber(publicationId: string): Promise<number> {
  const versions = await db.publicationVersions
    .where('publicationId')
    .equals(publicationId)
    .toArray()
  return versions.length + 1
}

async function snapshotVersion(
  pub: Publication,
  status: WorkflowStatus,
  actorId: string,
  reviewComment?: string,
): Promise<string> {
  const versionNumber = await nextVersionNumber(pub.id)
  const versionId = generateId()
  await db.publicationVersions.add({
    id: versionId,
    publicationId: pub.id,
    versionNumber,
    title: pub.title,
    body: pub.body,
    status,
    reviewComment,
    reviewedBy: actorId,
    reviewedAt: Date.now(),
    createdBy: actorId,
    createdAt: Date.now(),
  })
  return versionId
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface CreatePublicationInput {
  title: string
  type: PublicationType
  body: string
  attachmentUrls: string[]
}

export async function createPublication(
  input: CreatePublicationInput,
  actorId: string,
  actorName: string,
): Promise<Publication> {
  const moderationFlags = await moderateContent([input.title, input.body])
  const id = generateId()
  const now = Date.now()

  // Create initial version snapshot
  const versionId = generateId()
  await db.publicationVersions.add({
    id: versionId,
    publicationId: id,
    versionNumber: 1,
    title: input.title,
    body: input.body,
    status: 'Draft',
    createdBy: actorId,
    createdAt: now,
  })

  const pub: Publication = {
    id,
    ...input,
    status: 'Draft',
    moderationFlags,
    currentVersionId: versionId,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  }
  await db.publications.add(pub)

  await writeAuditLog({
    eventType: 'publication.created',
    actorId,
    actorName,
    entityType: 'Publication',
    entityId: id,
    description: `${actorName} created publication "${input.title}"`,
  })

  return pub
}

export async function updatePublication(
  id: string,
  updates: Partial<CreatePublicationInput>,
  actorId: string,
  actorName: string,
): Promise<void> {
  const pub = await db.publications.get(id)
  if (!pub) throw new Error('Publication not found')
  if (pub.status !== 'Draft' && pub.status !== 'Rejected')
    throw new Error('Only Draft or Rejected publications can be edited')

  const textsToCheck = [updates.title ?? pub.title, updates.body ?? pub.body]
  const moderationFlags = await moderateContent(textsToCheck)

  await db.publications.update(id, {
    ...updates,
    moderationFlags,
    status: 'Draft',
    updatedAt: Date.now(),
  })

  await writeAuditLog({
    eventType: 'publication.created',
    actorId,
    actorName,
    entityType: 'Publication',
    entityId: id,
    description: `${actorName} updated publication "${pub.title}"`,
  })
}

export async function submitForReview(
  id: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  const pub = await db.publications.get(id)
  if (!pub) throw new Error('Publication not found')
  if (pub.status !== 'Draft' && pub.status !== 'Rejected')
    throw new Error('Only Draft or Rejected publications can be submitted for review')

  // Run moderation before submit
  const moderationFlags = await moderateContent([pub.title, pub.body])
  if (moderationFlags.length > 0) {
    await db.publications.update(id, { moderationFlags, updatedAt: Date.now() })
    throw new Error(`Cannot submit: moderation flags detected — ${moderationFlags.join(', ')}`)
  }

  const versionId = await snapshotVersion(pub, 'InReview', actorId)
  await db.publications.update(id, {
    status: 'InReview',
    moderationFlags: [],
    currentVersionId: versionId,
    updatedAt: Date.now(),
  })

  await writeAuditLog({
    eventType: 'publication.submitted',
    actorId,
    actorName,
    entityType: 'Publication',
    entityId: id,
    description: `${actorName} submitted "${pub.title}" for review`,
  })
}

export async function approvePublication(
  id: string,
  actorId: string,
  actorName: string,
  comment?: string,
): Promise<void> {
  const pub = await db.publications.get(id)
  if (!pub) throw new Error('Publication not found')
  if (pub.status !== 'InReview') throw new Error('Publication is not in review')

  const versionId = await snapshotVersion(pub, 'Approved', actorId, comment)
  await db.publications.update(id, {
    status: 'Approved',
    currentVersionId: versionId,
    updatedAt: Date.now(),
  })

  await writeAuditLog({
    eventType: 'publication.approved',
    actorId,
    actorName,
    entityType: 'Publication',
    entityId: id,
    description: `${actorName} approved "${pub.title}"${comment ? ` — ${comment}` : ''}`,
  })

  await createNotification({
    userId: pub.createdBy,
    type: 'PublicationApproved',
    title: 'Publication Approved',
    message: `"${pub.title}" has been approved${comment ? `: ${comment}` : '.'}`,
    relatedEntityType: 'Publication',
    relatedEntityId: id,
  })
}

export async function rejectPublication(
  id: string,
  actorId: string,
  actorName: string,
  comment: string,
): Promise<void> {
  const pub = await db.publications.get(id)
  if (!pub) throw new Error('Publication not found')
  if (pub.status !== 'InReview') throw new Error('Publication is not in review')

  const versionId = await snapshotVersion(pub, 'Rejected', actorId, comment)
  await db.publications.update(id, {
    status: 'Rejected',
    currentVersionId: versionId,
    updatedAt: Date.now(),
  })

  await writeAuditLog({
    eventType: 'publication.rejected',
    actorId,
    actorName,
    entityType: 'Publication',
    entityId: id,
    description: `${actorName} rejected "${pub.title}" — ${comment}`,
  })

  await createNotification({
    userId: pub.createdBy,
    type: 'PublicationRejected',
    title: 'Publication Rejected',
    message: `"${pub.title}" was rejected: ${comment}`,
    relatedEntityType: 'Publication',
    relatedEntityId: id,
  })
}

export async function publishPublication(
  id: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  const pub = await db.publications.get(id)
  if (!pub) throw new Error('Publication not found')
  if (pub.status !== 'Approved') throw new Error('Only Approved publications can be published')

  await db.publications.update(id, {
    status: 'Published',
    publishedAt: Date.now(),
    updatedAt: Date.now(),
  })

  await writeAuditLog({
    eventType: 'publication.published',
    actorId,
    actorName,
    entityType: 'Publication',
    entityId: id,
    description: `${actorName} published "${pub.title}"`,
  })
}

export async function rollbackToVersion(
  publicationId: string,
  versionId: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  const [pub, version] = await Promise.all([
    db.publications.get(publicationId),
    db.publicationVersions.get(versionId),
  ])
  if (!pub) throw new Error('Publication not found')
  if (!version) throw new Error('Version not found')
  if (pub.status === 'Published') throw new Error('Cannot rollback a published publication')

  const newVersionId = await snapshotVersion(
    { ...pub, title: version.title, body: version.body },
    'Draft',
    actorId,
    `Rolled back to version ${String(version.versionNumber)}`,
  )

  await db.publications.update(publicationId, {
    title: version.title,
    body: version.body,
    status: 'Draft',
    currentVersionId: newVersionId,
    updatedAt: Date.now(),
  })

  await writeAuditLog({
    eventType: 'publication.rollback',
    actorId,
    actorName,
    entityType: 'Publication',
    entityId: publicationId,
    description: `${actorName} rolled back "${pub.title}" to version ${String(version.versionNumber)}`,
  })
}
