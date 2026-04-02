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
  const item = await db.catalogItems.get(id)
  if (!item) throw new Error('Catalog item not found')
  if (item.status === 'Archived') throw new Error('Cannot edit an archived item')
  const textsToCheck = [
    updates.title ?? item.title,
    updates.description ?? item.description,
    ...(updates.tags ?? item.tags),
  ]
  const moderationFlags = await moderateContent(textsToCheck)
  await db.catalogItems.update(id, { ...updates, moderationFlags, updatedAt: Date.now() })
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
  const item = await db.catalogItems.get(id)
  if (!item) throw new Error('Catalog item not found')
  if (item.status !== 'Draft') throw new Error('Only Draft items can be published')
  if (item.moderationFlags.length > 0)
    throw new Error(
      `Cannot publish: item has moderation flags — ${item.moderationFlags.join(', ')}`,
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
