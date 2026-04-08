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
import { requirePermission } from '@/utils/permissions'
import { isExternalUrl } from '@/utils/fileUtils'
import { useAuthStore } from '@/store/authStore'
import { hasPermission } from '@/auth/permissions'
import { notify, notifyMany } from './notificationService'
import type { Publication, PublicationType, WorkflowStatus } from '@/types'
import type { Role } from '@/types'

// ── helpers ───────────────────────────────────────────────────────────────────

async function nextVersionNumber(publicationId: string): Promise<number> {
  const versions = await db.publicationVersions
    .where('publicationId')
    .equals(publicationId)
    .toArray()
  return versions.length + 1
}

const MAX_VERSIONS = 20

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

  // Prune oldest versions so the total never exceeds MAX_VERSIONS
  const all = await db.publicationVersions
    .where('publicationId')
    .equals(pub.id)
    .sortBy('versionNumber')
  if (all.length > MAX_VERSIONS) {
    const toDelete = all.slice(0, all.length - MAX_VERSIONS).map((v) => v.id)
    await db.publicationVersions.bulkDelete(toDelete)
  }

  return versionId
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface CreatePublicationInput {
  title: string
  type: PublicationType
  body: string
  attachmentUrls: string[]
  /** Roles that may see this publication. Empty = global broadcast to all roles. */
  audienceRoles: Role[]
  /** Organisations that may see this publication. Empty = global broadcast to all orgs. */
  audienceOrgs: string[]
  /**
   * Audience tags — users must have at least one matching tag to receive this
   * publication. Empty array = no tag restriction (all users pass this gate).
   */
  audienceTags: string[]
}

export async function createPublication(
  input: CreatePublicationInput,
): Promise<Publication> {
  requirePermission('createPublication')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  if (input.attachmentUrls.some(isExternalUrl)) {
    throw new Error('External URLs are not allowed — upload files from your device')
  }
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
    audienceRoles: input.audienceRoles,
    audienceOrgs: input.audienceOrgs,
    audienceTags: input.audienceTags,
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
): Promise<void> {
  requirePermission('createPublication')
  if (updates.attachmentUrls?.some(isExternalUrl)) {
    throw new Error('External URLs are not allowed — upload files from your device')
  }
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const pub = await db.publications.get(id)
  if (!pub) throw new Error('Publication not found')
  if (pub.status !== 'Draft' && pub.status !== 'Rejected')
    throw new Error('Only Draft or Rejected publications can be edited')
  // Object-level: editors may only update their own publications;
  // managePublications bypasses this (admin override).
  if (pub.createdBy !== actorId && !hasPermission(currentUser.role, 'managePublications'))
    throw new Error('Forbidden: you can only edit publications you created')

  const textsToCheck = [updates.title ?? pub.title, updates.body ?? pub.body]
  const moderationFlags = await moderateContent(textsToCheck)

  await db.publications.update(id, {
    ...updates,
    moderationFlags,
    status: 'Draft',
    updatedAt: Date.now(),
  })

  await writeAuditLog({
    eventType: 'publication.updated',
    actorId,
    actorName,
    entityType: 'Publication',
    entityId: id,
    description: `${actorName} updated publication "${pub.title}"`,
  })
}

export async function submitForReview(
  id: string,
): Promise<void> {
  requirePermission('createPublication')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const pub = await db.publications.get(id)
  if (!pub) throw new Error('Publication not found')
  if (pub.status !== 'Draft' && pub.status !== 'Rejected')
    throw new Error('Only Draft or Rejected publications can be submitted for review')
  // Object-level: only the author may submit their own publication for review.
  if (pub.createdBy !== actorId)
    throw new Error('Forbidden: you can only submit publications you created')

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
  comment?: string,
): Promise<void> {
  requirePermission('approvePublication')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const pub = await db.publications.get(id)
  if (!pub) throw new Error('Publication not found')
  if (pub.status !== 'InReview') throw new Error('Publication is not in review')
  // Self-review prevention: the author must not approve their own work.
  if (pub.createdBy === actorId)
    throw new Error('Forbidden: you cannot approve a publication you created')

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

  await notify({
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
  comment: string,
): Promise<void> {
  requirePermission('approvePublication')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const pub = await db.publications.get(id)
  if (!pub) throw new Error('Publication not found')
  if (pub.status !== 'InReview') throw new Error('Publication is not in review')
  // Self-review prevention: the author must not reject their own work.
  if (pub.createdBy === actorId)
    throw new Error('Forbidden: you cannot reject a publication you created')

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

  await notify({
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
): Promise<void> {
  requirePermission('managePublications')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const pub = await db.publications.get(id)
  if (!pub) throw new Error('Publication not found')
  if (pub.status !== 'Approved') throw new Error('Only Approved publications can be published')

  const audienceRoles: Role[] = pub.audienceRoles ?? []
  const audienceOrgs: string[] = pub.audienceOrgs ?? []
  const audienceTags: string[] = pub.audienceTags ?? []
  const audienceParts: string[] = []
  if (audienceRoles.length > 0) audienceParts.push(`roles: ${audienceRoles.join(', ')}`)
  if (audienceOrgs.length > 0) audienceParts.push(`orgs: ${audienceOrgs.join(', ')}`)
  if (audienceTags.length > 0) audienceParts.push(`tags: ${audienceTags.join(', ')}`)
  const audienceDesc = audienceParts.length > 0 ? audienceParts.join(' | ') : 'all users'

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
    description: `${actorName} published "${pub.title}" — audience: ${audienceDesc}`,
  })

  // Notify only users who match all active audience dimensions:
  //   role: in audienceRoles (or audienceRoles empty → all roles pass)
  //   org:  in audienceOrgs  (or audienceOrgs empty  → all orgs pass)
  //   tags: user has at least one matching tag (or audienceTags empty → all pass)
  const allUsers = await db.users.filter((u) => u.isActive).toArray()
  const recipients = allUsers.filter(
    (u) =>
      u.id !== actorId &&
      (audienceRoles.length === 0 || audienceRoles.includes(u.role)) &&
      (audienceOrgs.length === 0 || (u.organization != null && audienceOrgs.includes(u.organization))) &&
      (audienceTags.length === 0 || audienceTags.some((t) => u.tags?.includes(t))),
  )
  await notifyMany(
    recipients.map((u) => u.id),
    {
      type: 'PublicationPublished',
      title: 'New Publication',
      message: `"${pub.title}" has been published and is now available in the feed.`,
      relatedEntityType: 'Publication',
      relatedEntityId: id,
    },
  )
}

export async function rollbackToVersion(
  publicationId: string,
  versionId: string,
): Promise<void> {
  requirePermission('managePublications')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
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
