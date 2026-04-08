import type { IncrementTier } from '@/types'

/**
 * Compute the minimum bid increment for `currentPrice` given a tier schedule.
 *
 * Tiers are evaluated in order. The first tier whose `upTo` value is null (open-
 * ended) or strictly greater than `currentPrice` applies. This means:
 *
 *   tiers = [{ upTo: 50, increment: 1 }, { upTo: 500, increment: 5 }, { upTo: null, increment: 10 }]
 *
 *   getMinimumIncrement(25,  tiers) → 1   (price < 50)
 *   getMinimumIncrement(50,  tiers) → 5   (price < 500 but not < 50)
 *   getMinimumIncrement(500, tiers) → 10  (falls through to open-ended tier)
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

/** Default tier schedule used as the starting point in the auction form.
 *  Matches the prompt requirement: $1 under $50, $5 from $50–$500, $10 above $500. */
export const DEFAULT_INCREMENT_TIERS: IncrementTier[] = [
  { upTo: 50, increment: 1 },
  { upTo: 500, increment: 5 },
  { upTo: null, increment: 10 },
]
