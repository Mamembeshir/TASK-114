import { MeridianDB } from './database'

/**
 * Singleton Dexie instance — import `db` wherever IndexedDB access is needed.
 *
 * Usage:
 *   import { db } from '@/db'
 *   const users = await db.users.toArray()
 */
export const db = new MeridianDB()

export type { MeridianDB } from './database'
