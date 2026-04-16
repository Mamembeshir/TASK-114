/**
 * Publishing page rendering tests.
 *
 * PublicationListPage       — editor/admin publication management list
 * ReviewQueuePage           — reviewer/approver review queue
 * PublicationFeedPage       — all-roles publication feed
 * ReadershipsAnalyticsPage  — admin readership analytics
 */

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest'
import { PublicationListPage } from '@/pages/publishing/PublicationListPage'
import { ReviewQueuePage } from '@/pages/publishing/ReviewQueuePage'
import { PublicationFeedPage } from '@/pages/publishing/PublicationFeedPage'
import { ReadershipsAnalyticsPage } from '@/pages/publishing/ReadershipsAnalyticsPage'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import {
  createPublication,
  submitForReview,
  approvePublication,
  publishPublication,
} from '@/services/publicationService'
import { Role } from '@/types'

function makeUser(role: Role) {
  return {
    id: `user-${role}`,
    username: role.toLowerCase(),
    displayName: `${role} User`,
    email: `${role.toLowerCase()}@test`,
    passwordHash: '',
    passwordSalt: '',
    role,
    isActive: true,
    isTemporaryPassword: false,
    createdAt: 0,
    updatedAt: 0,
    createdBy: 'system',
  }
}

function setUser(role: Role) {
  useAuthStore.setState({ currentUser: makeUser(role), sessionId: 'test', isLoading: false, error: null })
}

function resetStores() {
  useAuthStore.setState({ currentUser: null, sessionId: null, isLoading: false, error: null })
  useTabStore.setState({ tabs: [{ id: 'home', title: 'Dashboard', path: '/', isDirty: false }], activeTabId: 'home' })
}

async function renderAndFlush(ui: React.ReactElement) {
  await act(async () => {
    render(ui)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => { act(() => { resetStores() }) })
afterEach(() => { act(() => { resetStores() }) })

// ── PublicationListPage ───────────────────────────────────────────────────────

describe('PublicationListPage', () => {
  it('renders the Publishing heading', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<PublicationListPage />)
    expect(await screen.findByRole('heading', { name: 'Publishing' })).toBeInTheDocument()
  })

  it('shows + New Publication button for ContentEditor', async () => {
    setUser(Role.ContentEditor)
    await renderAndFlush(<PublicationListPage />)
    expect(await screen.findByText(/\+ New Publication/)).toBeInTheDocument()
  })

  it('does NOT show + New Publication button for ReviewerApprover', async () => {
    setUser(Role.ReviewerApprover)
    await renderAndFlush(<PublicationListPage />)
    await screen.findByRole('heading', { name: 'Publishing' })
    expect(screen.queryByText(/\+ New Publication/)).not.toBeInTheDocument()
  })

  it('renders status filter buttons', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<PublicationListPage />)
    expect(await screen.findByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Draft' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Published' })).toBeInTheDocument()
  })

  it('clicking + New Publication opens the publishing/new tab', async () => {
    setUser(Role.ContentEditor)
    await renderAndFlush(<PublicationListPage />)
    await userEvent.click(await screen.findByText(/\+ New Publication/))
    await waitFor(() => {
      expect(useTabStore.getState().tabs.some((t) => t.path === '/publishing/new')).toBe(true)
    })
  })

  it('renders nothing when no user is logged in', async () => {
    await renderAndFlush(<PublicationListPage />)
    expect(screen.queryByRole('heading', { name: 'Publishing' })).not.toBeInTheDocument()
  })
})

// ── ReviewQueuePage ───────────────────────────────────────────────────────────

describe('ReviewQueuePage', () => {
  it('renders the Review Queue heading', async () => {
    setUser(Role.ReviewerApprover)
    await renderAndFlush(<ReviewQueuePage />)
    expect(await screen.findByRole('heading', { name: 'Review Queue' })).toBeInTheDocument()
  })

  it('shows empty state when no publications are in review', async () => {
    setUser(Role.ReviewerApprover)
    await renderAndFlush(<ReviewQueuePage />)
    expect(await screen.findByText('Queue is clear')).toBeInTheDocument()
  })

  it('shows the subheading about awaiting review', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<ReviewQueuePage />)
    expect(await screen.findByText(/awaiting your review/i)).toBeInTheDocument()
  })
})

// ── PublicationFeedPage ───────────────────────────────────────────────────────

describe('PublicationFeedPage', () => {
  it('renders the Publications heading', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<PublicationFeedPage />)
    expect(await screen.findByRole('heading', { name: 'Publications' })).toBeInTheDocument()
  })

  it('shows empty state when no published content exists', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<PublicationFeedPage />)
    expect(await screen.findByText('No publications yet')).toBeInTheDocument()
  })
})

// ── ReadershipsAnalyticsPage ──────────────────────────────────────────────────

describe('ReadershipsAnalyticsPage', () => {
  it('renders the Readership Analytics heading', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<ReadershipsAnalyticsPage />)
    expect(await screen.findByRole('heading', { name: 'Readership Analytics' })).toBeInTheDocument()
  })

  it('shows empty state when no analytics data exists', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<ReadershipsAnalyticsPage />)
    expect(await screen.findByText('No data yet')).toBeInTheDocument()
  })
})

// ── PublicationListPage — data, filters, and mutation outcomes ────────────────
//
// Runs after the rendering tests above (shared DB within this file).
// Seeds publications via the real service layer so encryption round-trips
// and index queries are exercised alongside the UI assertions.

describe('PublicationListPage — data mutation and filter outcomes', () => {
  // Seed once: a Draft, an InReview, and a Published publication
  beforeAll(async () => {
    setUser(Role.ContentEditor)

    const draft = await createPublication({
      title: 'Q1 Budget Announcement',
      type: 'Announcement',
      body: '<p>Budget details for Q1.</p>',
      attachmentUrls: [],
      audienceRoles: [],
      audienceOrgs: [],
      audienceTags: [],
    })
    // Leave draft in Draft status

    const toReview = await createPublication({
      title: 'Office Closure Notice',
      type: 'Notice',
      body: '<p>The office will be closed on Friday.</p>',
      attachmentUrls: [],
      audienceRoles: [],
      audienceOrgs: [],
      audienceTags: [],
    })
    await submitForReview(toReview.id)

    const toPublish = await createPublication({
      title: 'Company Newsletter',
      type: 'Bulletin',
      body: '<p>Monthly newsletter content.</p>',
      attachmentUrls: [],
      audienceRoles: [],
      audienceOrgs: [],
      audienceTags: [],
    })
    await submitForReview(toPublish.id)
    // Switch to reviewer role to approve, then admin to publish
    setUser(Role.ReviewerApprover)
    await approvePublication(toPublish.id, 'Looks great')
    setUser(Role.Administrator)
    await publishPublication(toPublish.id)

    // Leave draft for subsequent seeding reference
    void draft
  })

  beforeEach(() => {
    setUser(Role.Administrator)
  })

  it('all seeded publications appear in the list', async () => {
    await renderAndFlush(<PublicationListPage />)
    expect(await screen.findByText('Q1 Budget Announcement')).toBeInTheDocument()
    expect(screen.getByText('Office Closure Notice')).toBeInTheDocument()
    expect(screen.getByText('Company Newsletter')).toBeInTheDocument()
  })

  it('Draft filter shows only Draft-status publications', async () => {
    await renderAndFlush(<PublicationListPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Draft' }))
    expect(screen.getByText('Q1 Budget Announcement')).toBeInTheDocument()
    expect(screen.queryByText('Office Closure Notice')).not.toBeInTheDocument()
    expect(screen.queryByText('Company Newsletter')).not.toBeInTheDocument()
  })

  it('InReview filter shows only InReview publications', async () => {
    await renderAndFlush(<PublicationListPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'InReview' }))
    expect(screen.getByText('Office Closure Notice')).toBeInTheDocument()
    expect(screen.queryByText('Q1 Budget Announcement')).not.toBeInTheDocument()
    expect(screen.queryByText('Company Newsletter')).not.toBeInTheDocument()
  })

  it('Published filter shows only Published publications', async () => {
    await renderAndFlush(<PublicationListPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Published' }))
    expect(screen.getByText('Company Newsletter')).toBeInTheDocument()
    expect(screen.queryByText('Q1 Budget Announcement')).not.toBeInTheDocument()
    expect(screen.queryByText('Office Closure Notice')).not.toBeInTheDocument()
  })

  it('Rejected filter shows no publications (none are rejected)', async () => {
    await renderAndFlush(<PublicationListPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Rejected' }))
    expect(screen.queryByText('Q1 Budget Announcement')).not.toBeInTheDocument()
    expect(screen.queryByText('Office Closure Notice')).not.toBeInTheDocument()
    expect(screen.queryByText('Company Newsletter')).not.toBeInTheDocument()
  })

  it('clicking a publication title opens the publishing review tab', async () => {
    await renderAndFlush(<PublicationListPage />)
    const titleBtn = await screen.findByRole('button', { name: 'Q1 Budget Announcement' })
    await userEvent.click(titleBtn)
    await waitFor(() => {
      const tabs = useTabStore.getState().tabs
      expect(tabs.some((t) => t.path.includes('/publishing/') && t.path.includes('/review'))).toBe(true)
    })
  })
})

// ── ReviewQueuePage — data outcomes ──────────────────────────────────────────
//
// Runs after the seeding above; the InReview publication is in the DB.

describe('ReviewQueuePage — shows InReview publications', () => {
  beforeEach(() => {
    setUser(Role.ReviewerApprover)
  })

  it('shows the seeded InReview publication in the review queue', async () => {
    await renderAndFlush(<ReviewQueuePage />)
    expect(await screen.findByText('Office Closure Notice')).toBeInTheDocument()
  })

  it('clicking a publication title in the queue opens the review tab', async () => {
    await renderAndFlush(<ReviewQueuePage />)
    const titleBtn = await screen.findByRole('button', { name: 'Office Closure Notice' })
    await userEvent.click(titleBtn)
    await waitFor(() => {
      const tabs = useTabStore.getState().tabs
      expect(tabs.some((t) => t.path.includes('/publishing/') && t.path.includes('/review'))).toBe(true)
    })
  })
})

// ── PublicationFeedPage — published content visible ───────────────────────────
//
// The Published publication seeded above should appear in the feed.

describe('PublicationFeedPage — shows published content', () => {
  beforeEach(() => {
    setUser(Role.Participant)
  })

  it('shows the seeded Published publication in the feed', async () => {
    await renderAndFlush(<PublicationFeedPage />)
    expect(await screen.findByText('Company Newsletter')).toBeInTheDocument()
  })

  it('does NOT show InReview or Draft publications in the feed', async () => {
    await renderAndFlush(<PublicationFeedPage />)
    await screen.findByText('Company Newsletter') // wait for load
    expect(screen.queryByText('Office Closure Notice')).not.toBeInTheDocument()
    expect(screen.queryByText('Q1 Budget Announcement')).not.toBeInTheDocument()
  })
})
