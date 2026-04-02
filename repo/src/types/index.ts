// Central re-export — import everything from '@/types'
export type { User, Session } from './auth'
export { Role } from './auth'

export type { AuditLog, AuditEventType } from './audit'

export type {
  Auction,
  AuctionStatus,
  Bid,
  ProxyBid,
  Wallet,
  WalletTransaction,
  WalletTransactionType,
} from './auction'

export type { CatalogItem, CatalogItemStatus, Category, Tag } from './catalog'

export type {
  Publication,
  PublicationVersion,
  PublicationType,
  WorkflowStatus,
  ViewEvent,
} from './publication'

export type {
  Document,
  DocumentVersion,
  DocumentStatus,
  CheckoutRecord,
  RetentionPolicy,
  DestructionApproval,
  DestructionApprovalStatus,
} from './document'

export type {
  Notification,
  NotificationType,
  OutboundQueueItem,
  OutboundChannel,
  OutboundStatus,
  NotificationTemplate,
  TemplateKey,
  NotificationSubscription,
  MessageReadReceipt,
} from './notification'
export { RETRY_DELAYS_MS } from './notification'

export type { SystemConfig, SensitiveWord } from './system'
