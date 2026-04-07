/**
 * Tests for CatalogItem.specs — data model and filtering logic.
 *
 * Verifies:
 *   - createCatalogItem persists specs in IndexedDB
 *   - updateCatalogItem merges spec updates correctly
 *   - Items without specs can be created and retrieved without errors
 *   - Spec-based filtering logic (the same predicate used by CatalogBrowsePage)
 *     correctly matches, excludes, and handles multiple simultaneous spec constraints
 *
 * Evidence: src/types/catalog.ts (specs field), src/services/catalogService.ts (CatalogItemInput)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { createCatalogItem, updateCatalogItem } from '@/services/catalogService'
import { useAuthStore } from '@/store/authStore'
import type { CatalogItem } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTOR_ID = 'admin-1'
const ACTOR_NAME = 'Admin'

function baseInput(overrides: Partial<Parameters<typeof createCatalogItem>[0]> = {}) {
  return {
    title: 'Test Widget',
    description: 'A test catalog item',
    categoryId: 'cat-1',
    tags: [],
    price: 100,
    stock: 10,
    imageUrls: [],
    ...overrides,
  }
}

/** Apply the same spec-filter predicate used by CatalogBrowsePage.filtered. */
function applySpecFilters(
  items: CatalogItem[],
  specFilters: Record<string, string>,
): CatalogItem[] {
  const activeEntries = Object.entries(specFilters).filter(([, v]) => v !== '')
  if (activeEntries.length === 0) return items
  return items.filter((item) => activeEntries.every(([k, v]) => item.specs?.[k] === v))
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([db.catalogItems.clear(), db.auditLogs.clear(), db.sensitiveWords.clear()])
  // Provide a minimal auth context required by requirePermission / hasPermission
  useAuthStore.setState({
    currentUser: {
      id: ACTOR_ID,
      displayName: ACTOR_NAME,
      username: 'admin',
      role: 'Administrator',
      isActive: true,
      createdAt: Date.now(),
    },
  } as Parameters<typeof useAuthStore.setState>[0])
})

// ── Data model ────────────────────────────────────────────────────────────────

describe('CatalogItem.specs — data model', () => {
  it('persists specs when provided', async () => {
    const specs = { color: 'red', size: 'M', material: 'cotton' }
    const item = await createCatalogItem(baseInput({ specs }), ACTOR_ID, ACTOR_NAME)

    const stored = await db.catalogItems.get(item.id)
    expect(stored?.specs).toEqual(specs)
  })

  it('creates item without specs (undefined) without error', async () => {
    const item = await createCatalogItem(baseInput(), ACTOR_ID, ACTOR_NAME)

    const stored = await db.catalogItems.get(item.id)
    expect(stored?.specs).toBeUndefined()
  })

  it('persists empty specs object', async () => {
    const item = await createCatalogItem(baseInput({ specs: {} }), ACTOR_ID, ACTOR_NAME)

    const stored = await db.catalogItems.get(item.id)
    expect(stored?.specs).toEqual({})
  })

  it('updateCatalogItem overwrites specs when provided in updates', async () => {
    const item = await createCatalogItem(
      baseInput({ specs: { color: 'blue', size: 'L' } }),
      ACTOR_ID,
      ACTOR_NAME,
    )

    await updateCatalogItem(item.id, { specs: { color: 'green', size: 'S' } }, ACTOR_ID, ACTOR_NAME)

    const updated = await db.catalogItems.get(item.id)
    expect(updated?.specs).toEqual({ color: 'green', size: 'S' })
  })

  it('updateCatalogItem preserves existing specs when specs not included in update', async () => {
    const specs = { color: 'red', size: 'M' }
    const item = await createCatalogItem(baseInput({ specs }), ACTOR_ID, ACTOR_NAME)

    // Update only title — specs must survive
    await updateCatalogItem(item.id, { title: 'New Title' }, ACTOR_ID, ACTOR_NAME)

    const updated = await db.catalogItems.get(item.id)
    expect(updated?.specs).toEqual(specs)
  })
})

// ── Filtering logic ───────────────────────────────────────────────────────────

describe('Spec filter predicate (CatalogBrowsePage logic)', () => {
  const items: CatalogItem[] = [
    {
      id: '1',
      title: 'Red Medium T-Shirt',
      description: '',
      categoryId: 'cat-1',
      tags: [],
      specs: { color: 'red', size: 'M' },
      price: 20,
      stock: 5,
      imageUrls: [],
      status: 'Active',
      moderationFlags: [],
      moderationStatus: 'Pending',
      salesCount: 0,
      ratingScore: 0,
      ratingCount: 0,
      createdBy: 'u1',
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: '2',
      title: 'Blue Large Jacket',
      description: '',
      categoryId: 'cat-1',
      tags: [],
      specs: { color: 'blue', size: 'L' },
      price: 80,
      stock: 3,
      imageUrls: [],
      status: 'Active',
      moderationFlags: [],
      moderationStatus: 'Pending',
      salesCount: 0,
      ratingScore: 0,
      ratingCount: 0,
      createdBy: 'u1',
      createdAt: 2,
      updatedAt: 2,
    },
    {
      id: '3',
      title: 'Red Large Hoodie',
      description: '',
      categoryId: 'cat-1',
      tags: [],
      specs: { color: 'red', size: 'L' },
      price: 60,
      stock: 7,
      imageUrls: [],
      status: 'Active',
      moderationFlags: [],
      moderationStatus: 'Pending',
      salesCount: 0,
      ratingScore: 0,
      ratingCount: 0,
      createdBy: 'u1',
      createdAt: 3,
      updatedAt: 3,
    },
    {
      id: '4',
      title: 'No-Spec Item',
      description: '',
      categoryId: 'cat-1',
      tags: [],
      // no specs
      price: 10,
      stock: 20,
      imageUrls: [],
      status: 'Active',
      moderationFlags: [],
      moderationStatus: 'Pending',
      salesCount: 0,
      ratingScore: 0,
      ratingCount: 0,
      createdBy: 'u1',
      createdAt: 4,
      updatedAt: 4,
    },
  ]

  it('returns all items when no spec filter is active', () => {
    const result = applySpecFilters(items, {})
    expect(result).toHaveLength(4)
  })

  it('filters by a single spec key-value', () => {
    const result = applySpecFilters(items, { color: 'red' })
    expect(result.map((i) => i.id)).toEqual(['1', '3'])
  })

  it('filters by multiple spec constraints (AND logic)', () => {
    const result = applySpecFilters(items, { color: 'red', size: 'L' })
    expect(result.map((i) => i.id)).toEqual(['3'])
  })

  it('returns empty array when no item matches all constraints', () => {
    const result = applySpecFilters(items, { color: 'green' })
    expect(result).toHaveLength(0)
  })

  it('excludes items without specs when spec filter is active', () => {
    const result = applySpecFilters(items, { color: 'red' })
    const ids = result.map((i) => i.id)
    expect(ids).not.toContain('4') // item without specs
  })

  it('ignores empty-string filter values (treated as "All")', () => {
    // '' means deselected — should not be applied
    const result = applySpecFilters(items, { color: '', size: 'L' })
    // Only size: L filter active → items 2 and 3
    expect(result.map((i) => i.id)).toEqual(['2', '3'])
  })

  it('returns all items when all filter values are empty strings', () => {
    const result = applySpecFilters(items, { color: '', size: '' })
    expect(result).toHaveLength(4)
  })
})
