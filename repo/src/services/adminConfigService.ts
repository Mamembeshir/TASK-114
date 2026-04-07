/**
 * AdminConfigService — service-layer mutations for system configuration and
 * sensitive-word management.
 *
 * All exported functions call `requirePermission('manageSystem')` before
 * touching the database, providing function-level authorization that is
 * independent of route-level UI guards (defense-in-depth per CLAUDE.md rules).
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import { writeAuditLog } from '@/utils/audit'
import { requirePermission } from '@/utils/permissions'
import type { SystemConfig } from '@/types'

// ── Sensitive words ────────────────────────────────────────────────────────────

export type EditableSystemConfig = Omit<SystemConfig, 'id' | 'documentNumberCounter' | 'updatedAt' | 'updatedBy'>

/**
 * Add a word to the sensitive-word moderation list.
 * Idempotent: returns false (without throwing) if the word is already present.
 */
export async function addSensitiveWord(
  word: string,
  actorId: string,
  actorName: string,
): Promise<boolean> {
  requirePermission('manageSystem')
  const normalised = word.trim().toLowerCase()
  if (!normalised) throw new Error('Word must not be blank')

  const existing = await db.sensitiveWords.where('word').equals(normalised).first()
  if (existing) return false // already present — idempotent

  await db.sensitiveWords.add({
    id: generateId(),
    word: normalised,
    createdBy: actorId,
    createdAt: Date.now(),
  })

  await writeAuditLog({
    eventType: 'system.sensitive_word_added',
    actorId,
    actorName,
    entityType: 'SensitiveWord',
    entityId: normalised,
    description: `${actorName} added sensitive word "${normalised}"`,
  })

  return true
}

/**
 * Remove a word from the sensitive-word moderation list.
 * Idempotent: no-ops if the record no longer exists.
 */
export async function deleteSensitiveWord(
  id: string,
  word: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  requirePermission('manageSystem')
  await db.sensitiveWords.delete(id)
  await writeAuditLog({
    eventType: 'system.sensitive_word_removed',
    actorId,
    actorName,
    entityType: 'SensitiveWord',
    entityId: word,
    description: `${actorName} removed sensitive word "${word}"`,
  })
}

// ── System configuration ───────────────────────────────────────────────────────

/**
 * Persist the editable portion of SystemConfig.
 * Creates the singleton row if it does not yet exist.
 */
export async function saveSystemConfig(
  config: EditableSystemConfig,
  actorId: string,
  actorName: string,
): Promise<void> {
  requirePermission('manageSystem')

  const existing = await db.systemConfig.get('singleton')
  const updates: Omit<SystemConfig, 'id' | 'documentNumberCounter'> = {
    ...config,
    documentNumberPrefix: config.documentNumberPrefix.trim().toUpperCase(),
    updatedAt: Date.now(),
    updatedBy: actorId,
  }

  if (existing) {
    await db.systemConfig.update('singleton', updates)
  } else {
    await db.systemConfig.add({
      id: 'singleton',
      ...updates,
      documentNumberCounter: 0,
    })
  }

  await writeAuditLog({
    eventType: 'system.config_updated',
    actorId,
    actorName,
    entityType: 'SystemConfig',
    entityId: 'singleton',
    description: `${actorName} updated system configuration`,
  })
}
