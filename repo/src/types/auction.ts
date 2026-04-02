// ── Auction System ────────────────────────────────────────────────────────────

export type AuctionStatus =
  | 'Draft'
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
