/**
 * importService — backup restore logic extracted from DataImportPage so it
 * can be unit-tested independently of the React component.
 */

import { db } from '@/db'
import { writeAuditLog } from '@/utils/audit'
import { requirePermission } from '@/utils/permissions'

// Tables that can be restored (in dependency order)
export const IMPORTABLE_TABLES = [
  'users',
  'auctions',
  'bids',
  'proxyBids',
  'wallets',
  'walletTransactions',
  'catalogItems',
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
  actorId: string,
  actorName: string,
): Promise<ImportResult[]> {
  requirePermission('manageSystem')

  const results: ImportResult[] = []

  for (const tableName of IMPORTABLE_TABLES) {
    const rows = backup.data[tableName]
    if (!rows || rows.length === 0) continue
    if (SKIP_ALWAYS.has(tableName)) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (db as any)[tableName]
    if (!table) continue

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
        await db.users.add(record as Parameters<typeof db.users.add>[0])
        inserted++
        continue
      }

      // auditLogs: append-only — add missing entries, never overwrite
      if (tableName === 'auditLogs') {
        const existing = await db.auditLogs.get(id)
        if (existing) { skipped++; continue }
        await db.auditLogs.add(record as Parameters<typeof db.auditLogs.add>[0])
        inserted++
        continue
      }

      const existing = await table.get(id)
      if (existing) {
        if (strategy === 'skip') {
          skipped++
        } else {
          await table.put(record)
          overwritten++
        }
      } else {
        await table.add(record)
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
