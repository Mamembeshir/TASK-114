/**
 * Audience delivery tests for publishPublication.
 *
 * Asserts that the notification recipient set is the exact intersection of all
 * active audience dimensions — audienceRoles, audienceOrgs, audienceTags.
 * An empty array for any dimension means "no restriction" (global broadcast
 * for that dimension).
 *
 * Evidence: src/services/publicationService.ts:327
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  createPublication,
  submitForReview,
  approvePublication,
  publishPublication,
} from '@/services/publicationService'
import { Role } from '@/types'
import type { User } from '@/types/auth'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PUBLISHER_ID = 'publisher-1'

function makeUser(id: string, role: Role, org?: string, tags?: string[]): User {
  return {
    id,
    username: id,
    displayName: id,
    email: `${id}@test`,
    passwordHash: '',
    passwordSalt: '',
    role,
    organization: org,
    tags,
    isActive: true,
    isTemporaryPassword: false,
    createdAt: 0,
    updatedAt: 0,
    createdBy: 'system',
  }
}

//  id      role              org       tags
//  alice   ContentEditor     finance   ['priority', 'internal']
//  bob     Participant       finance   ['internal']
//  carol   Participant       legal     ['priority']
//  dave    Administrator     hr        (no tags)
const ALICE = makeUser('alice', Role.ContentEditor, 'finance', ['priority', 'internal'])
const BOB   = makeUser('bob',   Role.Participant,   'finance', ['internal'])
const CAROL = makeUser('carol', Role.Participant,   'legal',   ['priority'])
const DAVE  = makeUser('dave',  Role.Administrator, 'hr',      undefined)

const ALL_USERS = [ALICE, BOB, CAROL, DAVE]

// ── Helpers ───────────────────────────────────────────────────────────────────

interface AudienceParams {
  audienceRoles?: Role[]
  audienceOrgs?: string[]
  audienceTags?: string[]
}

/** Create → submit → approve → publish; return sorted list of notified user IDs. */
async function publishWithAudience(params: AudienceParams): Promise<string[]> {
  const pub = await createPublication(
    {
      title: 'Audience Test',
      type: 'Notice' as const,
      body: '<p>body</p>',
      attachmentUrls: [],
      audienceRoles: params.audienceRoles ?? [],
      audienceOrgs:  params.audienceOrgs  ?? [],
      audienceTags:  params.audienceTags  ?? [],
    },
    'editor-1',
    'Editor',
  )
  await submitForReview(pub.id, 'editor-1', 'Editor')
  await approvePublication(pub.id, 'reviewer-1', 'Reviewer')
  await publishPublication(pub.id, PUBLISHER_ID, 'Publisher')

  const notifs = await db.notifications
    .where('type')
    .equals('PublicationPublished')
    .toArray()
  return notifs.map((n) => n.userId).sort()
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.users.clear(),
    db.publications.clear(),
    db.publicationVersions.clear(),
    db.notifications.clear(),
    db.auditLogs.clear(),
    db.sensitiveWords.clear(),
  ])
  await db.users.bulkAdd(ALL_USERS)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('publishPublication — audience delivery: role gate', () => {
  it('all dimensions empty → global broadcast to all active users (excl. publisher)', async () => {
    const recipients = await publishWithAudience({})
    expect(recipients).toEqual(['alice', 'bob', 'carol', 'dave'])
  })

  it('audienceRoles: [Participant] → bob + carol only', async () => {
    const recipients = await publishWithAudience({ audienceRoles: [Role.Participant] })
    expect(recipients).toEqual(['bob', 'carol'])
  })

  it('audienceRoles: [ContentEditor] → alice only', async () => {
    const recipients = await publishWithAudience({ audienceRoles: [Role.ContentEditor] })
    expect(recipients).toEqual(['alice'])
  })
})

describe('publishPublication — audience delivery: org gate', () => {
  it('audienceOrgs: [finance] → alice + bob only', async () => {
    const recipients = await publishWithAudience({ audienceOrgs: ['finance'] })
    expect(recipients).toEqual(['alice', 'bob'])
  })

  it('audienceOrgs: [legal] → carol only', async () => {
    const recipients = await publishWithAudience({ audienceOrgs: ['legal'] })
    expect(recipients).toEqual(['carol'])
  })

  it('user with no org is excluded when audienceOrgs is non-empty', async () => {
    // dave has no org field
    const recipients = await publishWithAudience({ audienceOrgs: ['finance'] })
    expect(recipients).not.toContain('dave')
  })
})

describe('publishPublication — audience delivery: tag gate', () => {
  it('audienceTags: [priority] → alice + carol', async () => {
    const recipients = await publishWithAudience({ audienceTags: ['priority'] })
    expect(recipients).toEqual(['alice', 'carol'])
  })

  it('audienceTags: [internal] → alice + bob', async () => {
    const recipients = await publishWithAudience({ audienceTags: ['internal'] })
    expect(recipients).toEqual(['alice', 'bob'])
  })

  it('user with no tags is excluded when audienceTags is non-empty', async () => {
    // dave has no tags
    const recipients = await publishWithAudience({ audienceTags: ['priority'] })
    expect(recipients).not.toContain('dave')
  })
})

describe('publishPublication — audience delivery: multi-dimension intersection', () => {
  it('role + org: Participant AND finance → bob only', async () => {
    const recipients = await publishWithAudience({
      audienceRoles: [Role.Participant],
      audienceOrgs:  ['finance'],
    })
    expect(recipients).toEqual(['bob'])
  })

  it('role + tag: Participant AND priority → carol only', async () => {
    const recipients = await publishWithAudience({
      audienceRoles: [Role.Participant],
      audienceTags:  ['priority'],
    })
    expect(recipients).toEqual(['carol'])
  })

  it('org + tag: finance AND priority → alice only', async () => {
    const recipients = await publishWithAudience({
      audienceOrgs: ['finance'],
      audienceTags: ['priority'],
    })
    expect(recipients).toEqual(['alice'])
  })

  it('all three: ContentEditor + finance + internal → alice only', async () => {
    const recipients = await publishWithAudience({
      audienceRoles: [Role.ContentEditor],
      audienceOrgs:  ['finance'],
      audienceTags:  ['internal'],
    })
    expect(recipients).toEqual(['alice'])
  })

  it('no-match audience → zero notifications sent', async () => {
    const recipients = await publishWithAudience({
      audienceRoles: [Role.ReviewerApprover],
      audienceOrgs:  ['nonexistent-org'],
    })
    expect(recipients).toHaveLength(0)
  })
})

describe('publishPublication — audience delivery: edge cases', () => {
  it('publisher is never self-notified even when audience fully matches', async () => {
    // Seed publisher as an active user who would otherwise qualify for the broadcast
    const publisher = makeUser(PUBLISHER_ID, Role.Administrator, 'finance', ['priority', 'internal'])
    await db.users.add(publisher)
    const recipients = await publishWithAudience({})
    expect(recipients).not.toContain(PUBLISHER_ID)
  })

  it('inactive users are excluded even when audience dimensions match', async () => {
    const inactive = {
      ...makeUser('inactive-1', Role.Participant, 'finance', ['internal']),
      isActive: false,
    }
    await db.users.add(inactive)
    const recipients = await publishWithAudience({ audienceOrgs: ['finance'] })
    expect(recipients).not.toContain('inactive-1')
  })
})
