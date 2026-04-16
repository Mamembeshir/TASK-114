/**
 * Unit tests for AuctionService.
 *
 * Covers: createAuction, updateAuction, publishAuction, cancelAuction,
 *         getAuction, listAuctions, activateIfDue
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  createAuction,
  updateAuction,
  publishAuction,
  cancelAuction,
  getAuction,
  listAuctions,
  activateIfDue,
  type CreateAuctionInput,
} from '@/services/auctionService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'
import type { Auction } from '@/types'

// ── Auth helpers ──────────────────────────────────────────────────────────────

function setUser(id: string, role: Role, displayName = id) {
  useAuthStore.setState({
    currentUser: {
      id,
      username: id,
      displayName,
      role,
      isActive: true,
      createdAt: Date.now(),
    },
  } as Parameters<typeof useAuthStore.setState>[0])
}

const setAdmin    = (id = 'admin-1')    => setUser(id, Role.Administrator, 'Admin')
const setEditor   = (id = 'editor-1')  => setUser(id, Role.ContentEditor, 'Editor')
const setReviewer = (id = 'rev-1')     => setUser(id, Role.ReviewerApprover, 'Reviewer')
const setParticipant = (id = 'p-1')    => setUser(id, Role.Participant, 'Participant')

// ── Fixtures ──────────────────────────────────────────────────────────────────

function auctionInput(overrides: Partial<CreateAuctionInput> = {}): CreateAuctionInput {
  return {
    title: 'Test Auction',
    description: 'A test auction',
    categoryId: 'cat-1',
    imageUrls: [],
    startPrice: 100,
    minimumIncrement: 10,
    depositAmount: 50,
    startTime: Date.now() - 1000,
    endTime: Date.now() + 60_000,
    ...overrides,
  }
}

async function seedAuction(overrides: Partial<Auction> = {}): Promise<Auction> {
  const auction: Auction = {
    id: 'auction-seed',
    title: 'Seeded Auction',
    description: '',
    categoryId: 'cat-1',
    imageUrls: [],
    startPrice: 100,
    currentPrice: 100,
    minimumIncrement: 10,
    depositAmount: 50,
    startTime: Date.now() - 2000,
    endTime: Date.now() + 60_000,
    status: 'Draft',
    createdBy: 'admin-1',
    antiSnipingTriggered: false,
    createdAt: Date.now() - 3000,
    updatedAt: Date.now() - 3000,
    ...overrides,
  }
  await db.auctions.put(auction)
  return auction
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.auctions.clear(),
    db.auditLogs.clear(),
  ])
  setAdmin()
})

// ── createAuction ─────────────────────────────────────────────────────────────

describe('createAuction', () => {
  it('creates an auction in Draft status for Administrator', async () => {
    setAdmin()
    const input = auctionInput()
    const auction = await createAuction(input)

    expect(auction.id).toBeTruthy()
    expect(auction.title).toBe('Test Auction')
    expect(auction.status).toBe('Draft')
    expect(auction.currentPrice).toBe(input.startPrice)
    expect(auction.createdBy).toBe('admin-1')

    const stored = await db.auctions.get(auction.id)
    expect(stored).toBeDefined()
  })

  it('creates an auction for ContentEditor (has createAuction permission)', async () => {
    setEditor()
    const auction = await createAuction(auctionInput())
    expect(auction.status).toBe('Draft')
    expect(auction.createdBy).toBe('editor-1')
  })

  it('throws Forbidden for Participant (lacks createAuction permission)', async () => {
    setParticipant()
    await expect(createAuction(auctionInput())).rejects.toThrow(/Forbidden/)
  })

  it('throws Forbidden for ReviewerApprover (lacks createAuction permission)', async () => {
    setReviewer()
    await expect(createAuction(auctionInput())).rejects.toThrow(/Forbidden/)
  })

  it('rejects external image URLs', async () => {
    setAdmin()
    await expect(
      createAuction(auctionInput({ imageUrls: ['https://evil.com/img.jpg'] })),
    ).rejects.toThrow(/External URLs/)
  })

  it('writes an audit log entry on success', async () => {
    setAdmin()
    await createAuction(auctionInput())
    const logs = await db.auditLogs.where('eventType').equals('auction.created').toArray()
    expect(logs).toHaveLength(1)
  })

  it('stores incrementTiers when provided', async () => {
    setAdmin()
    const tiers = [{ upTo: 500, increment: 10 }, { upTo: null, increment: 25 }]
    const auction = await createAuction(auctionInput({ incrementTiers: tiers }))
    expect(auction.incrementTiers).toEqual(tiers)
  })
})

// ── updateAuction ─────────────────────────────────────────────────────────────

describe('updateAuction', () => {
  it('updates title and description of a Draft auction', async () => {
    setAdmin()
    const { id } = await createAuction(auctionInput())
    await updateAuction(id, { title: 'Updated Title' })

    const stored = await db.auctions.get(id)
    expect(stored?.title).toBe('Updated Title')
  })

  it('throws if auction does not exist', async () => {
    setAdmin()
    await expect(updateAuction('no-such-id', { title: 'X' })).rejects.toThrow('Auction not found')
  })

  it('throws if auction is not in Draft status', async () => {
    await seedAuction({ status: 'Active' })
    setAdmin()
    await expect(updateAuction('auction-seed', { title: 'X' })).rejects.toThrow(
      'Only Draft auctions can be edited',
    )
  })

  it('allows admin (manageAuctions) to edit auctions created by others', async () => {
    // Seeded auction is created by admin-1
    await seedAuction({ createdBy: 'other-user' })
    setAdmin() // admin has manageAuctions
    await expect(updateAuction('auction-seed', { title: 'Admin Override' })).resolves.toBeUndefined()
  })

  it('throws Forbidden when editor tries to update another user\'s auction', async () => {
    // Auction created by admin-1
    await seedAuction({ createdBy: 'admin-1' })
    setEditor('editor-2') // different user, no manageAuctions
    await expect(updateAuction('auction-seed', { title: 'X' })).rejects.toThrow(/Forbidden/)
  })

  it('rejects external image URLs in update', async () => {
    setAdmin()
    const { id } = await createAuction(auctionInput())
    await expect(
      updateAuction(id, { imageUrls: ['https://external.com/img.png'] }),
    ).rejects.toThrow(/External URLs/)
  })

  it('writes an audit log entry on success', async () => {
    setAdmin()
    const { id } = await createAuction(auctionInput())
    await db.auditLogs.clear()
    await updateAuction(id, { title: 'Logged Update' })
    const logs = await db.auditLogs.where('eventType').equals('auction.updated').toArray()
    expect(logs).toHaveLength(1)
  })
})

// ── publishAuction ────────────────────────────────────────────────────────────

describe('publishAuction', () => {
  it('transitions Draft → Active when startTime is in the past', async () => {
    await seedAuction({ startTime: Date.now() - 10_000, endTime: Date.now() + 60_000 })
    setAdmin()
    await publishAuction('auction-seed')
    const stored = await db.auctions.get('auction-seed')
    expect(stored?.status).toBe('Active')
  })

  it('transitions Draft → Scheduled when startTime is in the future', async () => {
    await seedAuction({ startTime: Date.now() + 60_000, endTime: Date.now() + 120_000 })
    setAdmin()
    await publishAuction('auction-seed')
    const stored = await db.auctions.get('auction-seed')
    expect(stored?.status).toBe('Scheduled')
  })

  it('throws if auction does not exist', async () => {
    setAdmin()
    await expect(publishAuction('no-such-id')).rejects.toThrow('Auction not found')
  })

  it('throws if auction is not Draft', async () => {
    await seedAuction({ status: 'Active' })
    setAdmin()
    await expect(publishAuction('auction-seed')).rejects.toThrow('Only Draft auctions can be published')
  })

  it('throws if end time is in the past', async () => {
    await seedAuction({ endTime: Date.now() - 1000 })
    setAdmin()
    await expect(publishAuction('auction-seed')).rejects.toThrow('end time must be in the future')
  })

  it('throws Forbidden for ContentEditor (lacks manageAuctions)', async () => {
    await seedAuction()
    setEditor()
    await expect(publishAuction('auction-seed')).rejects.toThrow(/Forbidden/)
  })

  it('throws Forbidden for Participant', async () => {
    await seedAuction()
    setParticipant()
    await expect(publishAuction('auction-seed')).rejects.toThrow(/Forbidden/)
  })

  it('writes an audit log on publish', async () => {
    await seedAuction({ startTime: Date.now() - 1000, endTime: Date.now() + 60_000 })
    setAdmin()
    await db.auditLogs.clear()
    await publishAuction('auction-seed')
    const logs = await db.auditLogs.where('eventType').equals('auction.published').toArray()
    expect(logs).toHaveLength(1)
  })
})

// ── cancelAuction ─────────────────────────────────────────────────────────────

describe('cancelAuction', () => {
  it('cancels an Active auction', async () => {
    await seedAuction({ status: 'Active' })
    setAdmin()
    await cancelAuction('auction-seed')
    const stored = await db.auctions.get('auction-seed')
    expect(stored?.status).toBe('Cancelled')
  })

  it('cancels a Draft auction', async () => {
    await seedAuction({ status: 'Draft' })
    setAdmin()
    await cancelAuction('auction-seed')
    const stored = await db.auctions.get('auction-seed')
    expect(stored?.status).toBe('Cancelled')
  })

  it('throws if auction does not exist', async () => {
    setAdmin()
    await expect(cancelAuction('no-such-id')).rejects.toThrow('Auction not found')
  })

  it('throws if auction is Awarded (completed)', async () => {
    await seedAuction({ status: 'Awarded' })
    setAdmin()
    await expect(cancelAuction('auction-seed')).rejects.toThrow('Completed auctions cannot be cancelled')
  })

  it('throws if auction is NoSale (completed)', async () => {
    await seedAuction({ status: 'NoSale' })
    setAdmin()
    await expect(cancelAuction('auction-seed')).rejects.toThrow('Completed auctions cannot be cancelled')
  })

  it('throws Forbidden for ContentEditor', async () => {
    await seedAuction()
    setEditor()
    await expect(cancelAuction('auction-seed')).rejects.toThrow(/Forbidden/)
  })

  it('writes an audit log on cancel', async () => {
    await seedAuction({ status: 'Active' })
    setAdmin()
    await db.auditLogs.clear()
    await cancelAuction('auction-seed')
    const logs = await db.auditLogs.where('eventType').equals('auction.cancelled').toArray()
    expect(logs).toHaveLength(1)
  })
})

// ── getAuction ────────────────────────────────────────────────────────────────

describe('getAuction', () => {
  it('returns auction for Administrator (sees all statuses)', async () => {
    await seedAuction({ status: 'Active' })
    setAdmin()
    const auction = await getAuction('auction-seed')
    expect(auction).toBeDefined()
    expect(auction?.id).toBe('auction-seed')
  })

  it('returns undefined when auction does not exist', async () => {
    setAdmin()
    const result = await getAuction('does-not-exist')
    expect(result).toBeUndefined()
  })

  it('returns undefined for Draft auction for Participant (non-public status)', async () => {
    await seedAuction({ status: 'Draft' })
    setParticipant()
    const result = await getAuction('auction-seed')
    expect(result).toBeUndefined()
  })

  it('returns Active auction for Participant (public status)', async () => {
    await seedAuction({ status: 'Active' })
    setParticipant()
    const result = await getAuction('auction-seed')
    expect(result).toBeDefined()
  })

  it('throws Forbidden when unauthenticated', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await expect(getAuction('auction-seed')).rejects.toThrow(/Forbidden/)
  })

  it('returns Scheduled/Ended/Awarded/NoSale auctions to Participant (public statuses)', async () => {
    for (const status of ['Scheduled', 'Ended', 'Awarded', 'NoSale'] as const) {
      await db.auctions.clear()
      await seedAuction({ status })
      setParticipant()
      const result = await getAuction('auction-seed')
      expect(result?.status).toBe(status)
    }
  })
})

// ── listAuctions ──────────────────────────────────────────────────────────────

describe('listAuctions', () => {
  it('returns all auctions for Administrator', async () => {
    await seedAuction({ status: 'Draft' })
    await db.auctions.put({
      id: 'a2',
      title: 'A2',
      description: '',
      categoryId: 'cat-1',
      imageUrls: [],
      startPrice: 50,
      currentPrice: 50,
      minimumIncrement: 5,
      depositAmount: 10,
      startTime: Date.now() - 1000,
      endTime: Date.now() + 60_000,
      status: 'Active',
      createdBy: 'admin-1',
      antiSnipingTriggered: false,
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
    })
    setAdmin()
    const auctions = await listAuctions()
    expect(auctions.length).toBeGreaterThanOrEqual(2)
  })

  it('filters by status', async () => {
    await seedAuction({ status: 'Active' })
    await db.auctions.put({
      id: 'a-draft',
      title: 'Draft',
      description: '',
      categoryId: 'cat-1',
      imageUrls: [],
      startPrice: 50,
      currentPrice: 50,
      minimumIncrement: 5,
      depositAmount: 10,
      startTime: Date.now(),
      endTime: Date.now() + 60_000,
      status: 'Draft',
      createdBy: 'admin-1',
      antiSnipingTriggered: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    setAdmin()
    const active = await listAuctions({ status: 'Active' })
    expect(active.every((a) => a.status === 'Active')).toBe(true)
  })

  it('filters by categoryId', async () => {
    await seedAuction({ categoryId: 'cat-target' })
    setAdmin()
    const result = await listAuctions({ categoryId: 'cat-target' })
    expect(result.every((a) => a.categoryId === 'cat-target')).toBe(true)
  })

  it('hides Draft auctions from Participant', async () => {
    await seedAuction({ status: 'Draft' })
    setParticipant()
    const result = await listAuctions()
    expect(result.find((a) => a.status === 'Draft')).toBeUndefined()
  })

  it('throws Forbidden when unauthenticated', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await expect(listAuctions()).rejects.toThrow(/Forbidden/)
  })
})

// ── activateIfDue ─────────────────────────────────────────────────────────────

describe('activateIfDue', () => {
  it('transitions Scheduled → Active when startTime has passed', async () => {
    await seedAuction({ status: 'Scheduled', startTime: Date.now() - 5000 })
    setAdmin()
    await activateIfDue('auction-seed')
    const stored = await db.auctions.get('auction-seed')
    expect(stored?.status).toBe('Active')
  })

  it('is a no-op when startTime is still in the future', async () => {
    await seedAuction({ status: 'Scheduled', startTime: Date.now() + 60_000 })
    setAdmin()
    await activateIfDue('auction-seed')
    const stored = await db.auctions.get('auction-seed')
    expect(stored?.status).toBe('Scheduled')
  })

  it('is a no-op for non-Scheduled auctions', async () => {
    await seedAuction({ status: 'Active' })
    setAdmin()
    await activateIfDue('auction-seed')
    const stored = await db.auctions.get('auction-seed')
    expect(stored?.status).toBe('Active')
  })

  it('is a no-op when auction does not exist', async () => {
    setAdmin()
    await expect(activateIfDue('nonexistent')).resolves.toBeUndefined()
  })

  it('writes an audit log on activation', async () => {
    await seedAuction({ status: 'Scheduled', startTime: Date.now() - 1000 })
    setAdmin()
    await db.auditLogs.clear()
    await activateIfDue('auction-seed')
    const logs = await db.auditLogs.where('eventType').equals('auction.activated').toArray()
    expect(logs).toHaveLength(1)
  })
})
