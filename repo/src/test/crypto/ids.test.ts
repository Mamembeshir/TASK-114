import { describe, it, expect } from 'vitest'
import { generateId } from '@/crypto/ids'

describe('generateId', () => {
  it('returns a valid RFC 4122 v4 UUID', () => {
    const id = generateId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('generates 100 unique IDs with no collisions', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })
})
