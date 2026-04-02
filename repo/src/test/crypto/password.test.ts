import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '@/crypto/password'

// NOTE: PBKDF2 at 310,000 iterations is intentionally slow (~1-2 s per call).
// This test suite may take several seconds — that is expected and correct.
describe('hashPassword', () => {
  it('returns a 64-char hex hash (256-bit) and 32-char hex salt (128-bit)', async () => {
    const result = await hashPassword('test-password')
    expect(result.hash).toHaveLength(64)
    expect(result.salt).toHaveLength(32)
    expect(result.hash).toMatch(/^[0-9a-f]+$/)
    expect(result.salt).toMatch(/^[0-9a-f]+$/)
  }, 10_000)

  it('produces a unique salt and hash on every call for the same password', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  }, 20_000)
})

describe('verifyPassword', () => {
  it('returns true for the correct password', async () => {
    const { hash, salt } = await hashPassword('correct-horse-battery')
    const result = await verifyPassword('correct-horse-battery', hash, salt)
    expect(result).toBe(true)
  }, 20_000)

  it('returns false for a wrong password', async () => {
    const { hash, salt } = await hashPassword('correct-horse-battery')
    const result = await verifyPassword('wrong-password', hash, salt)
    expect(result).toBe(false)
  }, 20_000)

  it('returns false when the salt is altered', async () => {
    const { hash, salt } = await hashPassword('my-password')
    // Flip one character in the salt
    const alteredSalt = salt.slice(0, -1) + (salt.endsWith('a') ? 'b' : 'a')
    const result = await verifyPassword('my-password', hash, alteredSalt)
    expect(result).toBe(false)
  }, 20_000)
})
