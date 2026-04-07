import Dexie, { type Table } from 'dexie'
import type { User, Session } from '@/types/auth'
import type { AuditLog } from '@/types/audit'
import type { Auction, Bid, ProxyBid, Wallet, WalletTransaction } from '@/types/auction'
import type { CatalogItem, CatalogReview, Category, Tag } from '@/types/catalog'
import type { Publication, PublicationVersion, ViewEvent } from '@/types/publication'
import type {
  Document,
  DocumentTemplate,
  DocumentVersion,
  CheckoutRecord,
  RetentionPolicy,
  DestructionApproval,
} from '@/types/document'
import type {
  Notification,
  OutboundQueueItem,
  NotificationTemplate,
  NotificationSubscription,
  MessageReadReceipt,
} from '@/types/notification'
import type { TrainingCourse, TrainingProgress } from '@/types/training'
import type { SystemConfig, SensitiveWord } from '@/types/system'

/**
 * MeridianDB — single Dexie database for the entire portal.
 *
 * Schema versioning strategy:
 *   - Version 1 declares ALL tables up front to avoid incremental migrations
 *     during early development (adding a new table requires a version bump in Dexie).
 *   - Future breaking changes (renaming/removing indexes, data migrations) go in
 *     version 2+ with an `upgrade()` function.
 *   - Indexes listed here are for querying only; all fields are stored regardless.
 *   - Dexie index syntax: `&field` = unique, `[a+b]` = compound, `*field` = multi-entry.
 */
export class MeridianDB extends Dexie {
  // ── Auth ───────────────────────────────────────────────────────────────────
  users!: Table<User>
  sessions!: Table<Session>

  // ── Audit (append-only) ────────────────────────────────────────────────────
  auditLogs!: Table<AuditLog>

  // ── Auction ────────────────────────────────────────────────────────────────
  auctions!: Table<Auction>
  bids!: Table<Bid>
  proxyBids!: Table<ProxyBid>
  wallets!: Table<Wallet>
  walletTransactions!: Table<WalletTransaction>

  // ── Catalog ────────────────────────────────────────────────────────────────
  catalogItems!: Table<CatalogItem>
  catalogReviews!: Table<CatalogReview>
  categories!: Table<Category>
  tags!: Table<Tag>

  // ── Publishing ─────────────────────────────────────────────────────────────
  publications!: Table<Publication>
  publicationVersions!: Table<PublicationVersion>
  viewEvents!: Table<ViewEvent>

  // ── Documents ──────────────────────────────────────────────────────────────
  documents!: Table<Document>
  documentTemplates!: Table<DocumentTemplate>
  documentVersions!: Table<DocumentVersion>
  checkoutRecords!: Table<CheckoutRecord>
  retentionPolicies!: Table<RetentionPolicy>
  destructionApprovals!: Table<DestructionApproval>

  // ── Notifications ──────────────────────────────────────────────────────────
  notifications!: Table<Notification>
  outboundQueue!: Table<OutboundQueueItem>
  notificationTemplates!: Table<NotificationTemplate>
  notificationSubscriptions!: Table<NotificationSubscription>
  messageReadReceipts!: Table<MessageReadReceipt>

  // ── Training ───────────────────────────────────────────────────────────────
  trainingCourses!: Table<TrainingCourse>
  trainingProgress!: Table<TrainingProgress>

  // ── System ─────────────────────────────────────────────────────────────────
  systemConfig!: Table<SystemConfig>
  sensitiveWords!: Table<SensitiveWord>

  constructor() {
    super('MeridianPortal')

    this.version(1).stores({
      // ── Auth ──────────────────────────────────────────────────────────────
      // &username = unique index to prevent duplicate usernames
      users: 'id, &username, role, isActive, createdAt',
      sessions: 'id, userId, expiresAt',

      // ── Audit ─────────────────────────────────────────────────────────────
      // Indexed by actor, entity, and type for the audit log viewer filters
      auditLogs: 'id, eventType, actorId, entityType, entityId, createdAt',

      // ── Auction ───────────────────────────────────────────────────────────
      auctions: 'id, status, categoryId, createdBy, startTime, endTime, createdAt',
      // [auctionId+bidderId] compound + idempotencyKey unique prevent duplicate bids
      bids: 'id, auctionId, bidderId, &idempotencyKey, createdAt',
      proxyBids: 'id, auctionId, bidderId, isActive',
      wallets: 'id, &userId',
      walletTransactions: 'id, walletId, userId, type, relatedAuctionId, createdAt',

      // ── Catalog ───────────────────────────────────────────────────────────
      // *tags = multi-entry index so each tag value is indexed individually
      catalogItems: 'id, status, categoryId, *tags, createdBy, createdAt',
      categories: 'id, parentId',
      tags: 'id, &name',

      // ── Publishing ────────────────────────────────────────────────────────
      publications: 'id, type, status, createdBy, createdAt, publishedAt',
      publicationVersions: 'id, publicationId, versionNumber, createdAt',
      // [entityType+entityId] compound for per-entity analytics queries
      viewEvents: 'id, [entityType+entityId], userId, openedAt',

      // ── Documents ─────────────────────────────────────────────────────────
      // &documentNumber unique (sparse — undefined until approved)
      documents:
        'id, documentNumber, status, categoryId, checkedOutBy, retentionDueDate, createdBy, createdAt',
      documentVersions: 'id, documentId, versionNumber, createdAt',
      checkoutRecords: 'id, documentId, userId, isActive, checkedOutAt',
      retentionPolicies: 'id, &categoryId',
      destructionApprovals: 'id, documentId, status, requestedBy, requestedAt',

      // ── Notifications ─────────────────────────────────────────────────────
      notifications: 'id, userId, type, isRead, createdAt',
      outboundQueue: 'id, recipientUserId, status, channel, queuedAt',

      // ── System ────────────────────────────────────────────────────────────
      systemConfig: 'id',
      sensitiveWords: 'id, &word, createdAt',
    })

    // Version 2: outbound retry fields + Message Center + Training tables
    this.version(2).stores({
      // Add nextRetryAt index for efficient retry polling
      outboundQueue: 'id, recipientUserId, status, channel, queuedAt, nextRetryAt',
      // New Message Center tables
      notificationTemplates: 'id, &key, isActive, createdAt',
      notificationSubscriptions: 'id, userId, notificationType',
      messageReadReceipts: 'id, notificationId, userId, readAt',
      // Training module
      trainingCourses: 'id, isActive, createdAt',
      trainingProgress: 'id, userId, courseId, status, updatedAt',
    })

    // Version 3: encrypt wallet balances and document content at rest.
    // The schema string for wallets is unchanged (same indexed fields) but the
    // upgrade callback re-encrypts all existing rows so no wallet or document
    // record retains plaintext balance/reservedAmount after the migration.
    // Note: the upgrade runs async; Dexie awaits the returned Promise.
    this.version(3)
      .stores({
        // Schema unchanged — index list is the same as version 1.
        // Repeating it here is required by Dexie when an upgrade() is added.
        wallets: 'id, &userId',
      })
      .upgrade(async (tx) => {
        // Lazily import to avoid circular-dependency during DB construction.
        const { getAppKey } = await import('@/crypto/appKey')
        const { encrypt } = await import('@/crypto/encryption')
        const key = await getAppKey()

        // Migrate every existing wallet: encrypt plaintext numeric fields.
        // Old shape: { balance: number, reservedAmount: number }
        // New shape: { encBalance: string, encReservedAmount: string }
        await tx
          .table('wallets')
          .toCollection()
          .modify(async (row: Record<string, unknown>) => {
            // Skip rows that are already migrated (encBalance already present).
            if (typeof row.encBalance === 'string') return

            const bal = typeof row.balance === 'number' ? row.balance : 0
            const res = typeof row.reservedAmount === 'number' ? row.reservedAmount : 0

            row.encBalance = await encrypt(String(bal), key)
            row.encReservedAmount = await encrypt(String(res), key)
            // Remove plaintext fields from the record.
            delete row.balance
            delete row.reservedAmount
          })
      })

    // Version 4: add *tags multi-entry index to documents for efficient tag queries;
    // add documentTemplates table for reusable document scaffolding.
    this.version(4).stores({
      documents:
        'id, documentNumber, status, categoryId, checkedOutBy, retentionDueDate, createdBy, createdAt, *tags',
      documentTemplates: 'id, type, categoryId, createdBy, createdAt',
    })

    // Version 5: first-class catalog review records.
    // [itemId+userId] compound index enforces one-review-per-user-per-item query;
    // uniqueness is enforced in the service layer.
    this.version(5).stores({
      catalogReviews: 'id, itemId, userId, [itemId+userId], status, createdAt',
    })

    // Version 6: encrypt Document.metadata at rest.
    // Prior versions stored metadata as a plaintext Record<string,string>.
    // The upgrade serialises each existing metadata object to JSON and encrypts
    // it with the same AES-GCM-256 app key used for title/body, replacing the
    // plaintext object with the ciphertext string in-place.
    // Documents that already carry a string metadata value are already migrated
    // and are skipped.
    this.version(6)
      .stores({
        // Schema unchanged — index list is the same as version 4.
        documents:
          'id, documentNumber, status, categoryId, checkedOutBy, retentionDueDate, createdBy, createdAt, *tags',
      })
      .upgrade(async (tx) => {
        const { getAppKey } = await import('@/crypto/appKey')
        const { encrypt } = await import('@/crypto/encryption')
        const key = await getAppKey()

        await tx
          .table('documents')
          .toCollection()
          .modify(async (row: Record<string, unknown>) => {
            // Skip rows already migrated (metadata is already a ciphertext string).
            if (typeof row.metadata === 'string') return

            const plain = typeof row.metadata === 'object' && row.metadata !== null
              ? (row.metadata as Record<string, string>)
              : {}

            row.metadata = await encrypt(JSON.stringify(plain), key)
          })
      })
  }
}
