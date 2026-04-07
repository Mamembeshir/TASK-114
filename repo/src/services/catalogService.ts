/**
 * CatalogService — CRUD operations for catalog items.
 *
 * Status transitions:
 *   Draft → Active  (publish)
 *   Active → Archived (archive)
 *   Archived → Draft  (restore)
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import { writeAuditLog } from '@/utils/audit'
import { moderateContent } from '@/utils/moderation'
import { requirePermission } from '@/utils/permissions'
import type { CatalogItem } from '@/types'

export interface CatalogItemInput {
  title: string
  description: string
  categoryId: string
  tags: string[]
  price: number
  stock: number
  imageUrls: string[]
}

export async function createCatalogItem(
  input: CatalogItemInput,
  actorId: string,
  actorName: string,
): Promise<CatalogItem> {
  requirePermission('createCatalogItem')
  const moderationFlags = await moderateContent([input.title, input.description, ...input.tags])
  const item: CatalogItem = {
    id: generateId(),
    ...input,
    status: 'Draft',
    moderationFlags,
    moderationStatus: 'Pending',
    salesCount: 0,
    ratingScore: 0,
    ratingCount: 0,
    createdBy: actorId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.catalogItems.add(item)
  await writeAuditLog({
    eventType: 'catalog.created',
    actorId,
    actorName,
    entityType: 'CatalogItem',
    entityId: item.id,
    description: `${actorName} created catalog item "${item.title}"`,
  })
  return item
}

export async function updateCatalogItem(
  id: string,
  updates: Partial<CatalogItemInput>,
  actorId: string,
  actorName: string,
): Promise<void> {
  requirePermission('createCatalogItem')
  const item = await db.catalogItems.get(id)
  if (!item) throw new Error('Catalog item not found')
  if (item.status === 'Archived') throw new Error('Cannot edit an archived item')
  const textsToCheck = [
    updates.title ?? item.title,
    updates.description ?? item.description,
    ...(updates.tags ?? item.tags),
  ]
  const moderationFlags = await moderateContent(textsToCheck)
  // If the flag set changed (new flags or flags cleared), the prior reviewer
  // decision is no longer valid — reset to Pending for a fresh review cycle.
  const flagsChanged =
    moderationFlags.length !== item.moderationFlags.length ||
    moderationFlags.some((f) => !item.moderationFlags.includes(f))
  const moderationStatus = flagsChanged ? 'Pending' : item.moderationStatus
  await db.catalogItems.update(id, { ...updates, moderationFlags, moderationStatus, updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'catalog.updated',
    actorId,
    actorName,
    entityType: 'CatalogItem',
    entityId: id,
    description: `${actorName} updated catalog item "${item.title}"`,
  })
}

export async function publishCatalogItem(
  id: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  requirePermission('moderateCatalogItem')
  const item = await db.catalogItems.get(id)
  if (!item) throw new Error('Catalog item not found')
  if (item.status !== 'Draft') throw new Error('Only Draft items can be published')
  if (item.moderationStatus === 'ReviewerRejected')
    throw new Error('Cannot publish: item was rejected by a reviewer — edit the content to start a new review cycle')
  if (item.moderationFlags.length > 0 && item.moderationStatus !== 'ReviewerApproved')
    throw new Error(
      `Cannot publish: item has unreviewed moderation flags — ${item.moderationFlags.join(', ')}`,
    )
  await db.catalogItems.update(id, { status: 'Active', updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'catalog.published',
    actorId,
    actorName,
    entityType: 'CatalogItem',
    entityId: id,
    description: `${actorName} published catalog item "${item.title}"`,
  })
}

export async function archiveCatalogItem(
  id: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  requirePermission('manageCatalog')
  const item = await db.catalogItems.get(id)
  if (!item) throw new Error('Catalog item not found')
  if (item.status === 'Archived') return
  await db.catalogItems.update(id, { status: 'Archived', updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'catalog.archived',
    actorId,
    actorName,
    entityType: 'CatalogItem',
    entityId: id,
    description: `${actorName} archived catalog item "${item.title}"`,
  })
}

export async function restoreCatalogItem(
  id: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  requirePermission('manageCatalog')
  const item = await db.catalogItems.get(id)
  if (!item) throw new Error('Catalog item not found')
  if (item.status !== 'Archived') throw new Error('Only Archived items can be restored')
  await db.catalogItems.update(id, { status: 'Draft', updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'catalog.updated',
    actorId,
    actorName,
    entityType: 'CatalogItem',
    entityId: id,
    description: `${actorName} restored catalog item "${item.title}" to Draft`,
  })
}

/**
 * Reviewer approves the moderation flags on a flagged catalog item.
 * The item may then be published despite having flags.
 */
export async function approveModerationFlags(
  id: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  requirePermission('moderateCatalogItem')
  const item = await db.catalogItems.get(id)
  if (!item) throw new Error('Catalog item not found')
  if (item.moderationFlags.length === 0) throw new Error('Item has no moderation flags to review')
  if (item.status === 'Archived') throw new Error('Cannot review an archived item')
  await db.catalogItems.update(id, { moderationStatus: 'ReviewerApproved', updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'catalog.moderation_approved',
    actorId,
    actorName,
    entityType: 'CatalogItem',
    entityId: id,
    description: `${actorName} approved moderation flags on catalog item "${item.title}"`,
    metadata: { flags: item.moderationFlags },
  })
}

/**
 * Reviewer rejects the flagged catalog item — publishing is blocked until the
 * content is edited (which resets moderationStatus back to Pending).
 */
export async function rejectModerationFlags(
  id: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  requirePermission('moderateCatalogItem')
  const item = await db.catalogItems.get(id)
  if (!item) throw new Error('Catalog item not found')
  if (item.moderationFlags.length === 0) throw new Error('Item has no moderation flags to review')
  if (item.status === 'Archived') throw new Error('Cannot review an archived item')
  await db.catalogItems.update(id, { moderationStatus: 'ReviewerRejected', updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'catalog.moderation_rejected',
    actorId,
    actorName,
    entityType: 'CatalogItem',
    entityId: id,
    description: `${actorName} rejected moderation flags on catalog item "${item.title}"`,
    metadata: { flags: item.moderationFlags },
  })
}
