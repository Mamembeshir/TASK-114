// ── Auction System ────────────────────────────────────────────────────────────

/**
 * A single tier in a price-banded minimum increment schedule.
 * Tiers must be listed in ascending `upTo` order; the last tier must have
 * `upTo: null` to serve as the catch-all "above all bands" rule.
 */
export interface IncrementTier {
  /** Upper bound of this tier (current price must be strictly less than this value).
   *  `null` means "all prices above the previous tier's upper bound". */
  upTo: number | null
  /** Minimum bid increment required when the current price falls in this tier. */
  increment: number
}

export type AuctionStatus =
  | 'Draft'
  | 'Scheduled' // published but startTime is in the future
  | 'Active'
  | 'Extended' // anti-sniping triggered; end time extended by 2 min per snipe bid
  | 'Ended'
  | 'Awarded' // winner determined, deposit deducted
  | 'NoSale' // ended with zero bids
  | 'Cancelled'

export interface Auction {
  id: string
  title: string
  description: string
  categoryId: string
  /** Base64-encoded or object-URL images */
  imageUrls: string[]
  startPrice: number
  currentPrice: number
  minimumIncrement: number
  /**
   * Optional tiered minimum-increment schedule keyed by price band.
   * When present and non-empty, the engine uses this instead of `minimumIncrement`.
   * Tiers are evaluated in order; the first whose `upTo` exceeds `currentPrice`
   * (or whose `upTo` is null) determines the required increment.
   */
  incrementTiers?: IncrementTier[]
  /** Deposit amount held on win (deducted only on award per decision #2) */
  depositAmount: number
  startTime: number
  endTime: number
  status: AuctionStatus
  winnerId?: string
  winningBidId?: string
  /** True once the first anti-sniping extension has been applied */
  antiSnipingTriggered: boolean
  /** Timestamp (ms) when the first anti-sniping extension was applied, if ever */
  antiSnipingTriggeredAt?: number
  createdBy: string
  createdAt: number
  updatedAt: number
}

export interface Bid {
  id: string
  auctionId: string
  bidderId: string
  amount: number
  /** Unique key per (auctionId + bidderId + amount) to prevent cross-tab duplicates */
  idempotencyKey: string
  /** True when this bid was auto-placed by the proxy bidding engine */
  isProxyResolved: boolean
  createdAt: number
}

export interface ProxyBid {
  id: string
  auctionId: string
  bidderId: string
  maxAmount: number
  /** False once the proxy bid is exhausted or the auction closes */
  isActive: boolean
  createdAt: number
  updatedAt: number
}

/**
 * Wallet — IndexedDB storage shape.
 * `balance` and `reservedAmount` are encrypted with the device AES-GCM key
 * so the raw IndexedDB files do not expose financial data in plaintext.
 * Use `WalletDecrypted` (returned by `walletService.getWallet`) everywhere
 * arithmetic or display is needed.
 */
export interface Wallet {
  /** Primary key equals userId for O(1) lookup */
  id: string
  userId: string
  /** AES-GCM-256 ciphertext — plaintext is the balance number serialised to string */
  encBalance: string
  /** AES-GCM-256 ciphertext — plaintext is the reservedAmount number serialised to string */
  encReservedAmount: string
  updatedAt: number
}

/** In-memory, plaintext representation of a wallet — returned by service reads. */
export interface WalletDecrypted {
  id: string
  userId: string
  balance: number
  reservedAmount: number
  updatedAt: number
}

export type WalletTransactionType = 'Credit' | 'Debit' | 'Reserve' | 'Release' | 'DepositDeducted'

/**
 * Explicit per-auction lock record for cross-tab bid exclusivity.
 *
 * Stored in the `auctionLocks` IndexedDB table with a unique constraint on
 * `auctionId` so that only one tab can hold the lock at a time. Stale locks
 * (expiresAt ≤ now) are reclaimed automatically by the lock manager.
 *
 * Lifecycle:  acquireBidLock(auctionId) → (critical section) → releaseBidLock(auctionId, holderId)
 */
export interface AuctionLock {
  id: string
  /** Unique per auction — only one lock allowed concurrently; enforced by &auctionId index */
  auctionId: string
  /** Opaque ID generated per acquire call; verified on release to prevent accidental unlocks */
  heldBy: string
  acquiredAt: number
  /** Epoch-ms deadline: if now > expiresAt the lock is stale and may be stolen */
  expiresAt: number
}

/** First-class record of an anti-sniping extension event for timeline tracing. */
export interface AuctionExtensionEvent {
  id: string
  auctionId: string
  /** The bid that triggered the extension */
  triggeringBidId: string
  /** Previous end time before this extension */
  previousEndTime: number
  /** New end time after this extension */
  newEndTime: number
  createdAt: number
}

export interface WalletTransaction {
  id: string
  walletId: string
  userId: string
  type: WalletTransactionType
  amount: number
  relatedAuctionId?: string
  description: string
  createdAt: number
  /** userId of actor (could be Admin for manual credits) */
  createdBy: string
}
