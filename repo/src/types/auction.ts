// ── Auction System ────────────────────────────────────────────────────────────

export type AuctionStatus =
  | 'Draft'
  | 'Active'
  | 'Extended' // anti-sniping triggered, end time extended once by 2 min
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
  /** True once anti-sniping extension has been applied — cannot extend again */
  antiSnipingTriggered: boolean
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

export interface Wallet {
  /** Primary key equals userId for O(1) lookup */
  id: string
  userId: string
  balance: number
  /** Amount held while user has active bids — not yet deducted */
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
