/**
 * Unit tests for the moderation engine.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { moderateContent } from '@/utils/moderation'

async function seedWords(words: string[]): Promise<void> {
  await db.sensitiveWords.bulkAdd(
    words.map((word) => ({
      id: `sw-${word}`,
      word,
      createdBy: 'admin',
      createdAt: Date.now(),
    })),
  )
}

beforeEach(async () => {
  await db.sensitiveWords.clear()
})

describe('moderateContent', () => {
  it('returns an empty array when the sensitive-word list is empty', async () => {
    const flags = await moderateContent(['Hello world'])
    expect(flags).toEqual([])
  })

  it('detects a flagged word in the text (case-insensitive)', async () => {
    await seedWords(['badword'])
    const flags = await moderateContent(['This contains BadWord in it'])
    expect(flags).toEqual(['badword'])
  })

  it('does NOT flag a partial word match', async () => {
    await seedWords(['bad'])
    const flags = await moderateContent(['badminton is a sport'])
    expect(flags).toEqual([])
  })

  it('detects a flagged word at the start and end of a sentence', async () => {
    await seedWords(['spam'])
    expect(await moderateContent(['spam is everywhere'])).toContain('spam')
    expect(await moderateContent(['no one likes spam'])).toContain('spam')
  })

  it('scans across multiple text inputs', async () => {
    await seedWords(['alpha', 'beta'])
    const flags = await moderateContent(['This has alpha', 'And this has beta'])
    expect(flags).toContain('alpha')
    expect(flags).toContain('beta')
  })

  it('deduplicates repeated flags', async () => {
    await seedWords(['dup'])
    const flags = await moderateContent(['dup dup dup'])
    expect(flags).toEqual(['dup'])
  })

  it('returns only the matched words, not all sensitive words', async () => {
    await seedWords(['match', 'nomatch'])
    const flags = await moderateContent(['this has a match in it'])
    expect(flags).toEqual(['match'])
    expect(flags).not.toContain('nomatch')
  })

  it('escapes regex special characters in sensitive words — does not throw', async () => {
    // Words with regex special chars like "c++" would cause an error if unescaped.
    // The implementation escapes them, so this should not throw.
    await seedWords(['c++', 'a.b', '$money'])
    await expect(moderateContent(['some text about c++ or a.b or $money'])).resolves.not.toThrow()
  })
})
