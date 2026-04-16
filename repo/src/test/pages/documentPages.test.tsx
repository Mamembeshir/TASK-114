/**
 * Document page rendering tests.
 *
 * DocumentListPage   — filterable document management list
 * DocumentFormPage   — create / edit document form
 * DocumentDetailPage — document viewer / version history
 */

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest'
import { DocumentListPage } from '@/pages/documents/DocumentListPage'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { createDocument, submitDocumentForReview } from '@/services/documentService'
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

// ── DocumentListPage ──────────────────────────────────────────────────────────

describe('DocumentListPage', () => {
  it('renders the Documents heading', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<DocumentListPage />)
    expect(await screen.findByRole('heading', { name: 'Documents' })).toBeInTheDocument()
  })

  it('shows + New Document button for ContentEditor', async () => {
    setUser(Role.ContentEditor)
    await renderAndFlush(<DocumentListPage />)
    expect(await screen.findByText(/\+ New Document/)).toBeInTheDocument()
  })

  it('shows + New Document button for Administrator', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<DocumentListPage />)
    expect(await screen.findByText(/\+ New Document/)).toBeInTheDocument()
  })

  it('shows empty state when no documents exist', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<DocumentListPage />)
    expect(await screen.findByText('No documents')).toBeInTheDocument()
  })

  it('renders the search input', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<DocumentListPage />)
    expect(
      await screen.findByPlaceholderText(/search by title/i),
    ).toBeInTheDocument()
  })

  it('renders status filter pills', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<DocumentListPage />)
    expect(await screen.findByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Draft' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approved' })).toBeInTheDocument()
  })

  it('clicking + New Document opens the documents/new tab', async () => {
    setUser(Role.ContentEditor)
    await renderAndFlush(<DocumentListPage />)
    await userEvent.click(await screen.findByText(/\+ New Document/))
    await waitFor(() => {
      expect(useTabStore.getState().tabs.some((t) => t.path === '/documents/new')).toBe(true)
    })
  })

  it('does NOT show + New Document for ReviewerApprover', async () => {
    setUser(Role.ReviewerApprover)
    await renderAndFlush(<DocumentListPage />)
    expect(await screen.findByRole('heading', { name: 'Documents' })).toBeInTheDocument()
    expect(screen.queryByText(/\+ New Document/)).not.toBeInTheDocument()
  })
})

// ── DocumentListPage — data, filters, search, and role outcomes ───────────────
//
// These tests seed real documents via the service layer (fake-indexeddb +
// crypto) in beforeAll, then assert the rendered list reflects them.
// They run after the rendering tests above to avoid affecting the empty-state
// assertions (the DB is shared within this file).

describe('DocumentListPage — data mutation and filter outcomes', () => {
  // Seed two documents once for the whole describe block.
  // Administrator is the acting user so requirePermission passes.
  beforeAll(async () => {
    setUser(Role.Administrator)

    await createDocument({
      title: 'Annual Security Policy',
      type: 'Policy',
      categoryId: 'cat-test',
      body: '<p>Security guidelines for all staff.</p>',
      attachmentUrls: [],
      retentionYears: 7,
      tags: ['security', 'compliance'],
      metadata: {},
    })

    const toReview = await createDocument({
      title: 'Procurement Procedure',
      type: 'Procedure',
      categoryId: 'cat-test',
      body: '<p>Steps for raising purchase orders.</p>',
      attachmentUrls: [],
      retentionYears: 3,
      tags: ['procurement'],
      metadata: {},
    })
    // Submit the second document for review so it has InReview status
    await submitDocumentForReview(toReview.id)
  })

  beforeEach(() => {
    // Restore admin user before each test (global afterEach resets it)
    setUser(Role.Administrator)
  })

  it('seeded documents appear in the list', async () => {
    await renderAndFlush(<DocumentListPage />)
    expect(await screen.findByText('Annual Security Policy')).toBeInTheDocument()
    expect(screen.getByText('Procurement Procedure')).toBeInTheDocument()
  })

  it('Draft filter shows only Draft-status documents', async () => {
    await renderAndFlush(<DocumentListPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Draft' }))
    // Annual Security Policy is in Draft; Procurement Procedure is InReview
    expect(screen.getByText('Annual Security Policy')).toBeInTheDocument()
    expect(screen.queryByText('Procurement Procedure')).not.toBeInTheDocument()
  })

  it('InReview filter shows only InReview documents', async () => {
    await renderAndFlush(<DocumentListPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'InReview' }))
    expect(screen.getByText('Procurement Procedure')).toBeInTheDocument()
    expect(screen.queryByText('Annual Security Policy')).not.toBeInTheDocument()
  })

  it('Approved filter hides all seeded documents (none are Approved yet)', async () => {
    await renderAndFlush(<DocumentListPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Approved' }))
    expect(screen.queryByText('Annual Security Policy')).not.toBeInTheDocument()
    expect(screen.queryByText('Procurement Procedure')).not.toBeInTheDocument()
  })

  it('search by partial title returns matching documents only', async () => {
    await renderAndFlush(<DocumentListPage />)
    const searchInput = await screen.findByPlaceholderText(/search by title/i)

    await userEvent.type(searchInput, 'Security')
    expect(screen.getByText('Annual Security Policy')).toBeInTheDocument()
    expect(screen.queryByText('Procurement Procedure')).not.toBeInTheDocument()

    await userEvent.clear(searchInput)
    await userEvent.type(searchInput, 'Procurement')
    expect(screen.getByText('Procurement Procedure')).toBeInTheDocument()
    expect(screen.queryByText('Annual Security Policy')).not.toBeInTheDocument()

    await userEvent.clear(searchInput)
  })

  it('search with no matching term shows no document rows', async () => {
    await renderAndFlush(<DocumentListPage />)
    const searchInput = await screen.findByPlaceholderText(/search by title/i)
    await userEvent.type(searchInput, 'zzznomatch')
    expect(screen.queryByText('Annual Security Policy')).not.toBeInTheDocument()
    expect(screen.queryByText('Procurement Procedure')).not.toBeInTheDocument()
    await userEvent.clear(searchInput)
  })

  it('ReviewerApprover sees a Review button for InReview documents', async () => {
    setUser(Role.ReviewerApprover)
    await renderAndFlush(<DocumentListPage />)
    // The "Review" action button appears only for InReview docs when the user
    // has the approveDocument permission (ReviewerApprover does).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
    })
  })

  it('ContentEditor does NOT see a Review button', async () => {
    setUser(Role.ContentEditor)
    await renderAndFlush(<DocumentListPage />)
    await screen.findByRole('heading', { name: 'Documents' })
    // ContentEditor has createDocument but not approveDocument
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
  })

  it('clicking a document title opens the document detail tab', async () => {
    await renderAndFlush(<DocumentListPage />)
    const titleLink = await screen.findByRole('button', { name: 'Annual Security Policy' })
    await userEvent.click(titleLink)
    await waitFor(() => {
      const tabs = useTabStore.getState().tabs
      expect(tabs.some((t) => t.path.startsWith('/documents/') && !t.path.endsWith('/edit'))).toBe(true)
    })
  })
})
