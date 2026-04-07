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

/**
 * Outbound channels for the offline message queue.
 * Decision #11: no real sends — queue exported as CSV/JSON for manual processing.
 *   - Email:          standard email via operator's mail system
 *   - SMS:            text message via operator's telephony provider
 *   - OfficialAccount: WeChat/WhatsApp/LINE official-account push message routed
 *                      through the operator's registered channel; address field
 *                      holds the platform-specific open-id / subscriber-id.
 */
export type OutboundChannel = 'Email' | 'SMS' | 'OfficialAccount'
export type OutboundStatus = 'Scheduled' | 'Queued' | 'Sent' | 'Failed' | 'Retrying'

/** Retry schedule (ms offsets from first failure): 1 min, 5 min, 15 min */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000] as const

/**
 * Offline outbound queue — no real send.
 * Exported as CSV/JSON for manual processing per decision #11.
 *
 * Retry policy: on failure, up to 3 automatic retries at 1 / 5 / 15 minutes.
 * After the third failure the item transitions to `Failed` (terminal).
 */
export interface OutboundQueueItem {
  id: string
  channel: OutboundChannel
  recipientUserId: string
  /** Email address or phone number */
  recipientAddress: string
  subject?: string
  body: string
  /** Template key used to generate this message, if any */
  templateKey?: string
  relatedEntityType?: string
  relatedEntityId?: string
  status: OutboundStatus
  /** Number of send attempts made (0 = never tried) */
  attemptCount: number
  /**
   * Epoch-ms delivery time set by the compose/schedule flow.
   * While `status === 'Scheduled'` and `scheduledAt > Date.now()` the item
   * is held and not included in manual-processing exports.
   * `processScheduledQueue()` transitions it to `'Queued'` once the time passes.
   */
  scheduledAt?: number
  /** Timestamp of the next scheduled retry attempt (epoch ms) */
  nextRetryAt?: number
  queuedAt: number
  sentAt?: number
  /** ISO timestamp of the last failure */
  lastFailedAt?: number
}

// ── Notification templates ─────────────────────────────────────────────────────

export type TemplateKey =
  | 'auction.outbid'
  | 'auction.won'
  | 'auction.no_sale'
  | 'publication.approved'
  | 'publication.rejected'
  | 'publication.published'
  | 'document.approved'
  | 'document.rejected'
  | 'system.welcome'

export interface NotificationTemplate {
  id: string
  key: TemplateKey
  name: string
  subjectTemplate: string
  bodyTemplate: string
  /** Handlebars-style variable names expected in the template */
  variables: string[]
  isActive: boolean
  createdAt: number
  updatedAt: number
}

// ── Subscription preferences ───────────────────────────────────────────────────

export interface NotificationSubscription {
  id: string
  userId: string
  /** Which notification type this preference applies to */
  notificationType: string
  /** Whether the user wants in-app notifications */
  inApp: boolean
  /** Whether the user wants email outbound messages */
  email: boolean
  /** Whether the user wants SMS outbound messages */
  sms: boolean
  /** Whether the user wants official-account (WeChat/WhatsApp/LINE) push messages */
  officialAccount: boolean
  updatedAt: number
}

// ── Read receipt ───────────────────────────────────────────────────────────────

export interface MessageReadReceipt {
  id: string
  notificationId: string
  userId: string
  readAt: number
}
