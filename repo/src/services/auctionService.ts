/**
 * AuctionService — CRUD operations and status transitions for auctions.
 * All mutations write to the append-only audit log.
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import { writeAuditLog } from '@/utils/audit'
import { requirePermission } from '@/utils/permissions'
import type { Auction, AuctionStatus, IncrementTier } from '@/types'

export interface CreateAuctionInput {
  title: string
  description: string
  categoryId: string
  imageUrls: string[]
  startPrice: number
  minimumIncrement: number
  /** Optional tiered increment schedule. When provided and non-empty, overrides
   *  the flat `minimumIncrement` value in the bid engine. */
  incrementTiers?: IncrementTier[]
  depositAmount: number
  startTime: number
  endTime: number
}

// ── Create ─────────────────────────────────────────────────────────────────────

export async function createAuction(
  input: CreateAuctionInput,
  actorId: string,
  actorName: string,
): Promise<Auction> {
  requirePermission('createAuction')
  const now = Date.now()
  const auction: Auction = {
    id: generateId(),
    ...input,
    currentPrice: input.startPrice,
    status: 'Draft',
    antiSnipingTriggered: false,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  }

  await db.auctions.add(auction)
  await writeAuditLog({
    eventType: 'auction.created',
    actorId,
    actorName,
    entityType: 'Auction',
    entityId: auction.id,
    description: `${actorName} created auction "${auction.title}"`,
  })
  return auction
}

// ── Update (Draft only) ────────────────────────────────────────────────────────

export async function updateAuction(
  id: string,
  changes: Partial<CreateAuctionInput>,
  actorId: string,
  actorName: string,
): Promise<void> {
  requirePermission('createAuction')
  const auction = await db.auctions.get(id)
  if (!auction) throw new Error('Auction not found')
  if (auction.status !== 'Draft') throw new Error('Only Draft auctions can be edited')

  await db.auctions.update(id, { ...changes, updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'auction.updated',
    actorId,
    actorName,
    entityType: 'Auction',
    entityId: id,
    description: `${actorName} updated auction "${auction.title}"`,
  })
}

// ── Publish (Draft → Active) ───────────────────────────────────────────────────

export async function publishAuction(
  id: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  requirePermission('manageAuctions')
  const auction = await db.auctions.get(id)
  if (!auction) throw new Error('Auction not found')
  if (auction.status !== 'Draft') throw new Error('Only Draft auctions can be published')
  if (auction.endTime <= Date.now()) throw new Error('Auction end time must be in the future')

  await db.auctions.update(id, { status: 'Active', updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'auction.published',
    actorId,
    actorName,
    entityType: 'Auction',
    entityId: id,
    description: `${actorName} published auction "${auction.title}"`,
  })
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export async function cancelAuction(id: string, actorId: string, actorName: string): Promise<void> {
  requirePermission('manageAuctions')
  const auction = await db.auctions.get(id)
  if (!auction) throw new Error('Auction not found')
  if (auction.status === 'Awarded' || auction.status === 'NoSale') {
    throw new Error('Completed auctions cannot be cancelled')
  }

  await db.auctions.update(id, {
    status: 'Cancelled' as AuctionStatus,
    updatedAt: Date.now(),
  })
  await writeAuditLog({
    eventType: 'auction.cancelled',
    actorId,
    actorName,
    entityType: 'Auction',
    entityId: id,
    description: `${actorName} cancelled auction "${auction.title}"`,
  })
}

// ── Queries ────────────────────────────────────────────────────────────────────

export async function getAuction(id: string): Promise<Auction | undefined> {
  return db.auctions.get(id)
}

export async function listAuctions(filters?: {
  status?: AuctionStatus
  categoryId?: string
}): Promise<Auction[]> {
  let query = db.auctions.toCollection()

  if (filters?.status) {
    query = db.auctions.where('status').equals(filters.status)
  }

  const results = await query.sortBy('createdAt')
  const filtered = filters?.categoryId
    ? results.filter((a) => a.categoryId === filters.categoryId)
    : results

  return filtered.reverse()
}
