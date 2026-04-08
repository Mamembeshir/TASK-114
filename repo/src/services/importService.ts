/**
 * importService — backup restore logic extracted from DataImportPage so it
 * can be unit-tested independently of the React component.
 */

import type { Table } from 'dexie'
import { db } from '@/db'
import { writeAuditLog } from '@/utils/audit'
import { requirePermission } from '@/utils/permissions'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@/types/auth'
import type { AuditLog } from '@/types/audit'
import type { Auction, AuctionExtensionEvent, Bid, ProxyBid, Wallet, WalletTransaction } from '@/types/auction'
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

// Tables that can be restored (in dependency order)
export const IMPORTABLE_TABLES = [
  'users',
  'auctions',
  'bids',
  'proxyBids',
  'wallets',
  'walletTransactions',
  'auctionExtensionEvents',
  'catalogItems',
  'catalogReviews',
  'categories',
  'tags',
  'publications',
  'publicationVersions',
  'viewEvents',
  'documents',
  'documentVersions',
  'checkoutRecords',
  'retentionPolicies',
  'destructionApprovals',
  'documentTemplates',
  'notifications',
  'outboundQueue',
  'notificationTemplates',
  'notificationSubscriptions',
  'messageReadReceipts',
  'trainingCourses',
  'trainingProgress',
  'auditLogs',
  'systemConfig',
  'sensitiveWords',
] as const

export type ImportableTable = (typeof IMPORTABLE_TABLES)[number]

// Never import sessions — they contain auth tokens
export const SKIP_ALWAYS: ReadonlySet<string> = new Set(['sessions'])

/**
 * Concrete row type for each importable table.
 * Used to type TABLE_MAP with full concrete row types.
 */
type TableRowMap = {
  users: User
  auctions: Auction
  bids: Bid
  proxyBids: ProxyBid
  wallets: Wallet
  walletTransactions: WalletTransaction
  auctionExtensionEvents: AuctionExtensionEvent
  catalogItems: CatalogItem
  catalogReviews: CatalogReview
  categories: Category
  tags: Tag
  publications: Publication
  publicationVersions: PublicationVersion
  viewEvents: ViewEvent
  documents: Document
  documentVersions: DocumentVersion
  checkoutRecords: CheckoutRecord
  retentionPolicies: RetentionPolicy
  destructionApprovals: DestructionApproval
  documentTemplates: DocumentTemplate
  notifications: Notification
  outboundQueue: OutboundQueueItem
  notificationTemplates: NotificationTemplate
  notificationSubscriptions: NotificationSubscription
  messageReadReceipts: MessageReadReceipt
  trainingCourses: TrainingCourse
  trainingProgress: TrainingProgress
  auditLogs: AuditLog
  systemConfig: SystemConfig
  sensitiveWords: SensitiveWord
}

/**
 * Closed union of every concrete row type that can appear in a backup.
 * Used at the generic .add()/.put() call sites so the cast target is a bounded
 * set of known domain types — never TypeScript's `any`.
 */
/**
 * Typed table map: every ImportableTable name is statically verified to resolve
 * to its exact Dexie Table<RowType, string, RowType>.
 *
 * All three Dexie Table type parameters are explicit:
 *   T          = concrete row type from TableRowMap
 *   TKey       = string  (all domain tables use id: string as primary key)
 *   TInsertType = T      (full row object required on insert)
 *
 * This prevents Dexie's default `TKey = any` from leaking into the type.
 */
const TABLE_MAP: { [K in ImportableTable]: Table<TableRowMap[K], string, TableRowMap[K]> } = {
  users: db.users,
  auctions: db.auctions,
  bids: db.bids,
  proxyBids: db.proxyBids,
  wallets: db.wallets,
  walletTransactions: db.walletTransactions,
  auctionExtensionEvents: db.auctionExtensionEvents,
  catalogItems: db.catalogItems,
  catalogReviews: db.catalogReviews,
  categories: db.categories,
  tags: db.tags,
  publications: db.publications,
  publicationVersions: db.publicationVersions,
  viewEvents: db.viewEvents,
  documents: db.documents,
  documentVersions: db.documentVersions,
  checkoutRecords: db.checkoutRecords,
  retentionPolicies: db.retentionPolicies,
  destructionApprovals: db.destructionApprovals,
  documentTemplates: db.documentTemplates,
  notifications: db.notifications,
  outboundQueue: db.outboundQueue,
  notificationTemplates: db.notificationTemplates,
  notificationSubscriptions: db.notificationSubscriptions,
  messageReadReceipts: db.messageReadReceipts,
  trainingCourses: db.trainingCourses,
  trainingProgress: db.trainingProgress,
  auditLogs: db.auditLogs,
  systemConfig: db.systemConfig,
  sensitiveWords: db.sensitiveWords,
}

export type ConflictStrategy = 'skip' | 'overwrite'

export interface ParsedBackup {
  exportedAt: string
  module: string
  data: Record<string, unknown[]>
}

export interface ImportResult {
  table: string
  inserted: number
  skipped: number
  overwritten: number
}

export function isValidBackup(parsed: unknown): parsed is ParsedBackup {
  if (typeof parsed !== 'object' || parsed === null) return false
  const obj = parsed as Record<string, unknown>
  if (typeof obj.exportedAt !== 'string') return false
  if (typeof obj.data !== 'object' || obj.data === null) return false
  const data = obj.data as Record<string, unknown>
  // At least one table must be present
  if (Object.keys(data).length === 0) return false
  // Every value must be an array
  for (const val of Object.values(data)) {
    if (!Array.isArray(val)) return false
  }
  return true
}

export async function runImport(
  backup: ParsedBackup,
  strategy: ConflictStrategy,
): Promise<ImportResult[]> {
  requirePermission('manageSystem')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName

  const results: ImportResult[] = []

  for (const tableName of IMPORTABLE_TABLES) {
    const rows = backup.data[tableName]
    if (!rows || rows.length === 0) continue
    if (SKIP_ALWAYS.has(tableName)) continue

    const table = TABLE_MAP[tableName]

    let inserted = 0
    let skipped = 0
    let overwritten = 0

    for (const row of rows) {
      if (typeof row !== 'object' || row === null || !('id' in row)) continue
      const record = row as Record<string, unknown>
      const id = record.id as string

      // User rows: only restore when the backup contains hashed credentials.
      // Rows without passwordHash/passwordSalt (e.g. from a module-only export)
      // are skipped — inserting credential-less accounts would make them
      // permanently non-operable (login requires a valid PBKDF2 hash).
      // Existing users are never overwritten to prevent credential clobbering.
      if (tableName === 'users') {
        const existing = await db.users.get(id)
        if (existing) { skipped++; continue }
        if (!record.passwordHash || !record.passwordSalt) { skipped++; continue }
        await db.users.add(record as unknown as Parameters<typeof db.users.add>[0])
        inserted++
        continue
      }

      // auditLogs: append-only — add missing entries, never overwrite
      if (tableName === 'auditLogs') {
        const existing = await db.auditLogs.get(id)
        if (existing) { skipped++; continue }
        await db.auditLogs.add(record as unknown as Parameters<typeof db.auditLogs.add>[0])
        inserted++
        continue
      }

      // NOTE: for 'documents' and 'documentVersions', rows in the backup file
      // are expected to be in the encrypted StoredDocument / StoredDocumentVersion
      // shape (ciphertext strings for title/body/metadata). DataExportPage uses
      // db.documents.toArray() / db.documentVersions.toArray() (raw IndexedDB
      // reads) rather than listDocuments() / listAllDocumentVersions() (which
      // decrypt before returning) to preserve this contract. Writing the rows
      // back here as-is is correct — decryption happens on read via
      // getDocumentById() → decryptDocument().
      const existing = await table.get(id)
      if (existing) {
        if (strategy === 'skip') {
          skipped++
        } else {
          await (table as { put: (row: unknown) => Promise<unknown> }).put(record)
          overwritten++
        }
      } else {
        await (table as { add: (row: unknown) => Promise<unknown> }).add(record)
        inserted++
      }
    }

    results.push({ table: tableName, inserted, skipped, overwritten })
  }

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0)
  const totalOverwritten = results.reduce((s, r) => s + r.overwritten, 0)

  await writeAuditLog({
    eventType: 'system.data_imported',
    actorId,
    actorName,
    entityType: 'System',
    entityId: 'backup',
    description: `Data backup imported: ${totalInserted} records inserted, ${totalOverwritten} overwritten (strategy: ${strategy})`,
    metadata: {
      exportedAt: backup.exportedAt,
      module: backup.module,
      conflictStrategy: strategy,
      tableResults: results,
    },
  })

  return results
}
