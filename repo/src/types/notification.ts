// ── Message Center & Notifications ───────────────────────────────────────────

export type NotificationType =
  // Auction
  | 'BidOutbid'
  | 'AuctionWon'
  | 'AuctionNoSale'
  | 'AuctionStarted'
  | 'AuctionExtended'
  // Publication
  | 'PublicationApproved'
  | 'PublicationRejected'
  | 'PublicationPublished'
  // Document
  | 'DocumentApproved'
  | 'DocumentRejected'
  | 'DocumentCheckoutExpiring'
  | 'DocumentRetentionDue'
  | 'DocumentDestructionRequested'
  // Wallet
  | 'WalletCredited'
  | 'WalletDebited'
  // System
  | 'System'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  relatedEntityType?: string
  relatedEntityId?: string
  isRead: boolean
  createdAt: number
}

export type OutboundChannel = 'Email' | 'SMS'
export type OutboundStatus = 'Queued' | 'Sent' | 'Failed'

/**
 * Offline outbound queue — no real send.
 * Exported as CSV/JSON for manual processing per decision #11.
 */
export interface OutboundQueueItem {
  id: string
  channel: OutboundChannel
  recipientUserId: string
  /** Email address or phone number */
  recipientAddress: string
  subject?: string
  body: string
  relatedEntityType?: string
  relatedEntityId?: string
  status: OutboundStatus
  queuedAt: number
  sentAt?: number
}
