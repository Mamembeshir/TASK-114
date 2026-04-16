/**
 * Unit tests for increment utility.
 *
 * Covers: getMinimumIncrement (all tier scenarios), DEFAULT_INCREMENT_TIERS constant.
 */

import { describe, it, expect } from 'vitest'
import { getMinimumIncrement, DEFAULT_INCREMENT_TIERS } from '@/utils/increment'
import type { IncrementTier } from '@/types'

const TIERS: IncrementTier[] = [
  { upTo: 50, increment: 1 },
  { upTo: 500, increment: 5 },
  { upTo: null, increment: 10 },
]

describe('getMinimumIncrement', () => {
  it('returns flatFallback when tiers is undefined', () => {
    expect(getMinimumIncrement(100, undefined, 25)).toBe(25)
  })

  it('returns flatFallback when tiers is empty', () => {
    expect(getMinimumIncrement(100, [], 25)).toBe(25)
  })

  it('applies first tier when price is below its upTo', () => {
    expect(getMinimumIncrement(25, TIERS, 99)).toBe(1)
  })

  it('applies first tier at price = 0', () => {
    expect(getMinimumIncrement(0, TIERS, 99)).toBe(1)
  })

  it('applies second tier when price equals first tier upTo exactly', () => {
    // price = 50 is NOT < 50, so first tier doesn't apply; second applies (50 < 500)
    expect(getMinimumIncrement(50, TIERS, 99)).toBe(5)
  })

  it('applies second tier for mid-range price', () => {
    expect(getMinimumIncrement(200, TIERS, 99)).toBe(5)
  })

  it('applies open-ended tier when price exceeds all bounded tiers', () => {
    // price = 500 is NOT < 500, and upTo=null means open-ended
    expect(getMinimumIncrement(500, TIERS, 99)).toBe(10)
  })

  it('applies open-ended tier for very high prices', () => {
    expect(getMinimumIncrement(1_000_000, TIERS, 99)).toBe(10)
  })

  it('uses last tier as fallback when price exceeds all bounded tiers and no null upTo', () => {
    const boundedTiers: IncrementTier[] = [
      { upTo: 50, increment: 1 },
      { upTo: 500, increment: 5 },
    ]
    // price = 1000 exceeds all bounded tiers — fallback to last tier's increment
    expect(getMinimumIncrement(1000, boundedTiers, 99)).toBe(5)
  })

  it('works with a single open-ended tier', () => {
    const singleTier: IncrementTier[] = [{ upTo: null, increment: 10 }]
    expect(getMinimumIncrement(0, singleTier, 99)).toBe(10)
    expect(getMinimumIncrement(99999, singleTier, 99)).toBe(10)
  })

  it('works with a single bounded tier below price (falls back to that tier)', () => {
    const singleTier: IncrementTier[] = [{ upTo: 100, increment: 2 }]
    // price = 200 > 100, no open-ended tier, fallback to last tier
    expect(getMinimumIncrement(200, singleTier, 99)).toBe(2)
  })
})

describe('DEFAULT_INCREMENT_TIERS', () => {
  it('has 3 tiers', () => {
    expect(DEFAULT_INCREMENT_TIERS).toHaveLength(3)
  })

  it('first tier: $1 increment below $50', () => {
    expect(getMinimumIncrement(10, DEFAULT_INCREMENT_TIERS, 0)).toBe(1)
    expect(getMinimumIncrement(49, DEFAULT_INCREMENT_TIERS, 0)).toBe(1)
  })

  it('second tier: $5 increment from $50 to $500', () => {
    expect(getMinimumIncrement(50, DEFAULT_INCREMENT_TIERS, 0)).toBe(5)
    expect(getMinimumIncrement(499, DEFAULT_INCREMENT_TIERS, 0)).toBe(5)
  })

  it('third tier: $10 increment above $500', () => {
    expect(getMinimumIncrement(500, DEFAULT_INCREMENT_TIERS, 0)).toBe(10)
    expect(getMinimumIncrement(10000, DEFAULT_INCREMENT_TIERS, 0)).toBe(10)
  })
})
