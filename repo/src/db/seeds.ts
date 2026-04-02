import { db } from '@/db'
import { generateId } from '@/crypto'

/**
 * Seed a handful of default auction/catalog categories on first launch.
 * No-op if the categories table is already populated.
 */
export async function seedDefaultCategories(): Promise<void> {
  const count = await db.categories.count()
  if (count > 0) return

  const now = Date.now()
  const defaults = [
    'General',
    'Electronics',
    'Vehicles',
    'Real Estate',
    'Art & Collectibles',
    'Office Equipment',
    'Machinery',
    'Other',
  ]

  await db.categories.bulkAdd(
    defaults.map((name) => ({
      id: generateId(),
      name,
      createdAt: now,
    })),
  )
}
