import { db } from '@/db'
import { generateId } from '@/crypto'
import type { AuditLog } from '@/types'

/**
 * Write an append-only audit log entry.
 * Never update or delete rows from `auditLogs` — this table is immutable by design.
 */
export async function writeAuditLog(entry: Omit<AuditLog, 'id' | 'createdAt'>): Promise<void> {
  await db.auditLogs.add({
    ...entry,
    id: generateId(),
    createdAt: Date.now(),
  })
}
