import type { IncrementTier } from '@/types'

/**
 * Compute the minimum bid increment for `currentPrice` given a tier schedule.
 *
 * Tiers are evaluated in order. The first tier whose `upTo` value is null (open-
 * ended) or strictly greater than `currentPrice` applies. This means:
 *
 *   tiers = [{ upTo: 100, increment: 5 }, { upTo: 500, increment: 10 }, { upTo: null, increment: 25 }]
 *
 *   getMinimumIncrement(50,  tiers) → 5   (price < 100)
 *   getMinimumIncrement(100, tiers) → 10  (price < 500 but not < 100)
 *   getMinimumIncrement(500, tiers) → 25  (falls through to open-ended tier)
 *
 * Falls back to `flatFallback` when `tiers` is empty or undefined.
 */
export function getMinimumIncrement(
  currentPrice: number,
  tiers: IncrementTier[] | undefined,
  flatFallback: number,
): number {
  if (!tiers || tiers.length === 0) return flatFallback
  for (const tier of tiers) {
    if (tier.upTo === null || currentPrice < tier.upTo) {
      return tier.increment
    }
  }
  // Price exceeds all bounded tiers — use the last tier as a safe fallback
  return tiers[tiers.length - 1]!.increment
}

/** Default tier schedule used as the starting point in the auction form. */
export const DEFAULT_INCREMENT_TIERS: IncrementTier[] = [
  { upTo: 100, increment: 5 },
  { upTo: 500, increment: 10 },
  { upTo: 2000, increment: 25 },
  { upTo: null, increment: 50 },
]
