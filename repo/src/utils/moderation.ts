/**
 * Content moderation utility.
 *
 * Scans text against the sensitive-word list stored in IndexedDB.
 * Matching is case-insensitive, whole-word boundary aware.
 * Returns the list of matched words (deduplicated).
 */
import { db } from '@/db'

export async function moderateContent(texts: string[]): Promise<string[]> {
  const words = await db.sensitiveWords.toArray()
  if (words.length === 0) return []

  const combined = texts.join(' ').toLowerCase()
  const flagged: string[] = []

  for (const { word } of words) {
    // Whole-word match using word boundary pattern
    const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (pattern.test(combined)) {
      flagged.push(word)
    }
  }

  return [...new Set(flagged)]
}
