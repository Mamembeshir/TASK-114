/**
 * Unit tests for CatalogService.
 *
 * Covers: createCatalogItem, updateCatalogItem, publishCatalogItem,
 *         archiveCatalogItem, restoreCatalogItem,
 *         approveModerationFlags, rejectModerationFlags
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  createCatalogItem,
  updateCatalogItem,
  publishCatalogItem,
  archiveCatalogItem,
  restoreCatalogItem,
  approveModerationFlags,
  rejectModerationFlags,
  type CatalogItemInput,
} from '@/services/catalogService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'
import type { CatalogItem } from '@/types'

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

const setAdmin    = (id = 'admin-1')  => setUser(id, Role.Administrator, 'Admin')
const setEditor   = (id = 'editor-1')  => setUser(id, Role.ContentEditor, 'Editor')
const setReviewer = (id = 'rev-1')     => setUser(id, Role.ReviewerApprover, 'Reviewer')
const setParticipant = (id = 'p-1')   => setUser(id, Role.Participant, 'Participant')

// ── Fixtures ──────────────────────────────────────────────────────────────────

function itemInput(overrides: Partial<CatalogItemInput> = {}): CatalogItemInput {
  return {
    title: 'Test Item',
    description: 'A test catalog item',
    categoryId: 'cat-1',
    tags: ['tag-a'],
    price: 29.99,
    stock: 10,
    imageUrls: [],
    ...overrides,
  }
}

async function seedItem(overrides: Partial<CatalogItem> = {}): Promise<CatalogItem> {
  const item: CatalogItem = {
    id: 'item-seed',
    title: 'Seeded Item',
    description: 'Seeded',
    categoryId: 'cat-1',
    tags: [],
    price: 10,
    stock: 5,
    imageUrls: [],
    status: 'Draft',
    moderationFlags: [],
    moderationStatus: 'Pending',
    salesCount: 0,
    ratingScore: 0,
    ratingCount: 0,
    createdBy: 'admin-1',
    createdAt: Date.now() - 1000,
    updatedAt: Date.now() - 1000,
    ...overrides,
  }
  await db.catalogItems.put(item)
  return item
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.catalogItems.clear(),
    db.auditLogs.clear(),
    db.sensitiveWords.clear(),
  ])
  setAdmin()
})

// ── createCatalogItem ─────────────────────────────────────────────────────────

describe('createCatalogItem', () => {
  it('creates item in Draft status for Administrator', async () => {
    setAdmin()
    const item = await createCatalogItem(itemInput())

    expect(item.id).toBeTruthy()
    expect(item.status).toBe('Draft')
    expect(item.createdBy).toBe('admin-1')
    expect(item.moderationStatus).toBe('Pending')

    const stored = await db.catalogItems.get(item.id)
    expect(stored).toBeDefined()
  })

  it('creates item for ContentEditor (has createCatalogItem permission)', async () => {
    setEditor()
    const item = await createCatalogItem(itemInput())
    expect(item.status).toBe('Draft')
    expect(item.createdBy).toBe('editor-1')
  })

  it('throws Forbidden for Participant', async () => {
    setParticipant()
    await expect(createCatalogItem(itemInput())).rejects.toThrow(/Forbidden/)
  })

  it('throws Forbidden for ReviewerApprover (lacks createCatalogItem)', async () => {
    setReviewer()
    await expect(createCatalogItem(itemInput())).rejects.toThrow(/Forbidden/)
  })

  it('rejects external image URLs', async () => {
    setAdmin()
    await expect(
      createCatalogItem(itemInput({ imageUrls: ['https://external.com/img.jpg'] })),
    ).rejects.toThrow(/External URLs/)
  })

  it('sets moderationFlags when sensitive words are detected', async () => {
    // Add a sensitive word
    await db.sensitiveWords.add({ id: 'sw-1', word: 'badword', createdBy: 'admin-1', createdAt: Date.now() })
    setAdmin()
    const item = await createCatalogItem(itemInput({ title: 'Item with badword' }))
    expect(item.moderationFlags.length).toBeGreaterThan(0)
  })

  it('stores optional brand and specs fields', async () => {
    setAdmin()
    const item = await createCatalogItem(
      itemInput({ brand: 'TestBrand', specs: { color: 'red', size: 'M' } }),
    )
    expect(item.brand).toBe('TestBrand')
    expect(item.specs).toEqual({ color: 'red', size: 'M' })
  })

  it('writes an audit log on creation', async () => {
    setAdmin()
    await createCatalogItem(itemInput())
    const logs = await db.auditLogs.where('eventType').equals('catalog.created').toArray()
    expect(logs).toHaveLength(1)
  })
})

// ── updateCatalogItem ─────────────────────────────────────────────────────────

describe('updateCatalogItem', () => {
  it('updates fields of a Draft item', async () => {
    setAdmin()
    const { id } = await createCatalogItem(itemInput())
    await updateCatalogItem(id, { title: 'Updated Title', price: 49.99 })

    const stored = await db.catalogItems.get(id)
    expect(stored?.title).toBe('Updated Title')
    expect(stored?.price).toBe(49.99)
  })

  it('updates an Active item', async () => {
    await seedItem({ status: 'Active' })
    setAdmin()
    await updateCatalogItem('item-seed', { title: 'Active Update' })
    const stored = await db.catalogItems.get('item-seed')
    expect(stored?.title).toBe('Active Update')
  })

  it('throws if item does not exist', async () => {
    setAdmin()
    await expect(updateCatalogItem('no-id', { title: 'X' })).rejects.toThrow('Catalog item not found')
  })

  it('throws for Archived items', async () => {
    await seedItem({ status: 'Archived' })
    setAdmin()
    await expect(updateCatalogItem('item-seed', { title: 'X' })).rejects.toThrow(
      'Cannot edit an archived item',
    )
  })

  it('throws Forbidden when editor tries to update another user\'s item', async () => {
    await seedItem({ createdBy: 'other-user', status: 'Draft' })
    setEditor('editor-2')
    await expect(updateCatalogItem('item-seed', { title: 'Stolen' })).rejects.toThrow(/Forbidden/)
  })

  it('allows admin (manageCatalog) to update any item', async () => {
    await seedItem({ createdBy: 'other-user', status: 'Draft' })
    setAdmin()
    await expect(updateCatalogItem('item-seed', { title: 'Admin Edit' })).resolves.toBeUndefined()
  })

  it('rejects external image URLs in update', async () => {
    setAdmin()
    const { id } = await createCatalogItem(itemInput())
    await expect(
      updateCatalogItem(id, { imageUrls: ['https://bad.com/img.png'] }),
    ).rejects.toThrow(/External URLs/)
  })

  it('resets moderationStatus to Pending when flags change', async () => {
    await db.sensitiveWords.add({ id: 'sw-1', word: 'badword', createdBy: 'admin-1', createdAt: Date.now() })
    setAdmin()
    const { id } = await createCatalogItem(itemInput())
    // Update with a title containing sensitive word
    await updateCatalogItem(id, { title: 'Contains badword here' })
    const stored = await db.catalogItems.get(id)
    expect(stored?.moderationStatus).toBe('Pending')
  })

  it('writes an audit log on update', async () => {
    setAdmin()
    const { id } = await createCatalogItem(itemInput())
    await db.auditLogs.clear()
    await updateCatalogItem(id, { title: 'Logged Update' })
    const logs = await db.auditLogs.where('eventType').equals('catalog.updated').toArray()
    expect(logs).toHaveLength(1)
  })
})

// ── publishCatalogItem ────────────────────────────────────────────────────────

describe('publishCatalogItem', () => {
  it('publishes a clean Draft item (no flags)', async () => {
    await seedItem({ status: 'Draft', moderationFlags: [], moderationStatus: 'Pending' })
    setAdmin()
    await publishCatalogItem('item-seed')
    const stored = await db.catalogItems.get('item-seed')
    expect(stored?.status).toBe('Active')
  })

  it('publishes a flagged item that has ReviewerApproved status', async () => {
    await seedItem({
      status: 'Draft',
      moderationFlags: ['profanity'],
      moderationStatus: 'ReviewerApproved',
    })
    setAdmin()
    await publishCatalogItem('item-seed')
    const stored = await db.catalogItems.get('item-seed')
    expect(stored?.status).toBe('Active')
  })

  it('throws if item does not exist', async () => {
    setAdmin()
    await expect(publishCatalogItem('no-id')).rejects.toThrow('Catalog item not found')
  })

  it('throws if item is not Draft', async () => {
    await seedItem({ status: 'Active' })
    setAdmin()
    await expect(publishCatalogItem('item-seed')).rejects.toThrow('Only Draft items can be published')
  })

  it('throws if item was ReviewerRejected', async () => {
    await seedItem({
      status: 'Draft',
      moderationFlags: ['profanity'],
      moderationStatus: 'ReviewerRejected',
    })
    setAdmin()
    await expect(publishCatalogItem('item-seed')).rejects.toThrow('rejected by a reviewer')
  })

  it('throws if item has unreviewed flags', async () => {
    await seedItem({
      status: 'Draft',
      moderationFlags: ['profanity'],
      moderationStatus: 'Pending',
    })
    setAdmin()
    await expect(publishCatalogItem('item-seed')).rejects.toThrow('unreviewed moderation flags')
  })

  it('throws Forbidden for ContentEditor (lacks moderateCatalogItem)', async () => {
    await seedItem({ moderationFlags: [] })
    setEditor()
    await expect(publishCatalogItem('item-seed')).rejects.toThrow(/Forbidden/)
  })

  it('allows ReviewerApprover to publish', async () => {
    await seedItem({ status: 'Draft', moderationFlags: [], moderationStatus: 'Pending' })
    setReviewer()
    await expect(publishCatalogItem('item-seed')).resolves.toBeUndefined()
  })

  it('writes an audit log on publish', async () => {
    await seedItem({ status: 'Draft', moderationFlags: [] })
    setAdmin()
    await db.auditLogs.clear()
    await publishCatalogItem('item-seed')
    const logs = await db.auditLogs.where('eventType').equals('catalog.published').toArray()
    expect(logs).toHaveLength(1)
  })
})

// ── archiveCatalogItem ────────────────────────────────────────────────────────

describe('archiveCatalogItem', () => {
  it('archives an Active item', async () => {
    await seedItem({ status: 'Active' })
    setAdmin()
    await archiveCatalogItem('item-seed')
    const stored = await db.catalogItems.get('item-seed')
    expect(stored?.status).toBe('Archived')
  })

  it('archives a Draft item', async () => {
    await seedItem({ status: 'Draft' })
    setAdmin()
    await archiveCatalogItem('item-seed')
    const stored = await db.catalogItems.get('item-seed')
    expect(stored?.status).toBe('Archived')
  })

  it('is idempotent — archiving an already-archived item is a no-op', async () => {
    await seedItem({ status: 'Archived' })
    setAdmin()
    await expect(archiveCatalogItem('item-seed')).resolves.toBeUndefined()
    const stored = await db.catalogItems.get('item-seed')
    expect(stored?.status).toBe('Archived')
  })

  it('throws if item does not exist', async () => {
    setAdmin()
    await expect(archiveCatalogItem('no-id')).rejects.toThrow('Catalog item not found')
  })

  it('throws Forbidden for ContentEditor (lacks manageCatalog)', async () => {
    await seedItem({ status: 'Active' })
    setEditor()
    await expect(archiveCatalogItem('item-seed')).rejects.toThrow(/Forbidden/)
  })

  it('writes an audit log on archive', async () => {
    await seedItem({ status: 'Active' })
    setAdmin()
    await db.auditLogs.clear()
    await archiveCatalogItem('item-seed')
    const logs = await db.auditLogs.where('eventType').equals('catalog.archived').toArray()
    expect(logs).toHaveLength(1)
  })
})

// ── restoreCatalogItem ────────────────────────────────────────────────────────

describe('restoreCatalogItem', () => {
  it('restores an Archived item to Draft', async () => {
    await seedItem({ status: 'Archived' })
    setAdmin()
    await restoreCatalogItem('item-seed')
    const stored = await db.catalogItems.get('item-seed')
    expect(stored?.status).toBe('Draft')
  })

  it('throws if item does not exist', async () => {
    setAdmin()
    await expect(restoreCatalogItem('no-id')).rejects.toThrow('Catalog item not found')
  })

  it('throws if item is not Archived', async () => {
    await seedItem({ status: 'Active' })
    setAdmin()
    await expect(restoreCatalogItem('item-seed')).rejects.toThrow('Only Archived items can be restored')
  })

  it('throws Forbidden for ContentEditor (lacks manageCatalog)', async () => {
    await seedItem({ status: 'Archived' })
    setEditor()
    await expect(restoreCatalogItem('item-seed')).rejects.toThrow(/Forbidden/)
  })

  it('writes an audit log on restore', async () => {
    await seedItem({ status: 'Archived' })
    setAdmin()
    await db.auditLogs.clear()
    await restoreCatalogItem('item-seed')
    const logs = await db.auditLogs.where('eventType').equals('catalog.updated').toArray()
    expect(logs).toHaveLength(1)
  })
})

// ── approveModerationFlags ────────────────────────────────────────────────────

describe('approveModerationFlags', () => {
  it('sets moderationStatus to ReviewerApproved', async () => {
    await seedItem({ moderationFlags: ['profanity'], moderationStatus: 'Pending' })
    setAdmin()
    await approveModerationFlags('item-seed')
    const stored = await db.catalogItems.get('item-seed')
    expect(stored?.moderationStatus).toBe('ReviewerApproved')
  })

  it('throws if item does not exist', async () => {
    setAdmin()
    await expect(approveModerationFlags('no-id')).rejects.toThrow('Catalog item not found')
  })

  it('throws if item has no moderation flags', async () => {
    await seedItem({ moderationFlags: [] })
    setAdmin()
    await expect(approveModerationFlags('item-seed')).rejects.toThrow('no moderation flags')
  })

  it('throws if item is Archived', async () => {
    await seedItem({ status: 'Archived', moderationFlags: ['profanity'] })
    setAdmin()
    await expect(approveModerationFlags('item-seed')).rejects.toThrow('Cannot review an archived item')
  })

  it('throws Forbidden for ContentEditor (lacks moderateCatalogItem)', async () => {
    await seedItem({ moderationFlags: ['profanity'] })
    setEditor()
    await expect(approveModerationFlags('item-seed')).rejects.toThrow(/Forbidden/)
  })

  it('allows ReviewerApprover to approve flags', async () => {
    await seedItem({ moderationFlags: ['profanity'], moderationStatus: 'Pending' })
    setReviewer()
    await expect(approveModerationFlags('item-seed')).resolves.toBeUndefined()
  })

  it('writes an audit log on approve', async () => {
    await seedItem({ moderationFlags: ['profanity'] })
    setAdmin()
    await db.auditLogs.clear()
    await approveModerationFlags('item-seed')
    const logs = await db.auditLogs
      .where('eventType')
      .equals('catalog.moderation_approved')
      .toArray()
    expect(logs).toHaveLength(1)
  })
})

// ── rejectModerationFlags ─────────────────────────────────────────────────────

describe('rejectModerationFlags', () => {
  it('sets moderationStatus to ReviewerRejected', async () => {
    await seedItem({ moderationFlags: ['profanity'], moderationStatus: 'Pending' })
    setAdmin()
    await rejectModerationFlags('item-seed')
    const stored = await db.catalogItems.get('item-seed')
    expect(stored?.moderationStatus).toBe('ReviewerRejected')
  })

  it('throws if item does not exist', async () => {
    setAdmin()
    await expect(rejectModerationFlags('no-id')).rejects.toThrow('Catalog item not found')
  })

  it('throws if item has no moderation flags', async () => {
    await seedItem({ moderationFlags: [] })
    setAdmin()
    await expect(rejectModerationFlags('item-seed')).rejects.toThrow('no moderation flags')
  })

  it('throws if item is Archived', async () => {
    await seedItem({ status: 'Archived', moderationFlags: ['profanity'] })
    setAdmin()
    await expect(rejectModerationFlags('item-seed')).rejects.toThrow('Cannot review an archived item')
  })

  it('throws Forbidden for ContentEditor (lacks moderateCatalogItem)', async () => {
    await seedItem({ moderationFlags: ['profanity'] })
    setEditor()
    await expect(rejectModerationFlags('item-seed')).rejects.toThrow(/Forbidden/)
  })

  it('allows ReviewerApprover to reject flags', async () => {
    await seedItem({ moderationFlags: ['profanity'] })
    setReviewer()
    await expect(rejectModerationFlags('item-seed')).resolves.toBeUndefined()
  })

  it('writes an audit log on reject', async () => {
    await seedItem({ moderationFlags: ['profanity'] })
    setAdmin()
    await db.auditLogs.clear()
    await rejectModerationFlags('item-seed')
    const logs = await db.auditLogs
      .where('eventType')
      .equals('catalog.moderation_rejected')
      .toArray()
    expect(logs).toHaveLength(1)
  })
})
