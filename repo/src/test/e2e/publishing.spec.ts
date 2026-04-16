/**
 * E2E — Publishing workflow journeys
 *
 * Covers the full publication lifecycle end-to-end:
 *   create draft → submit for review → reviewer approves →
 *   admin publishes → appears in feed → reviewer rejects →
 *   status filters → role gating (Participant sees feed, not management)
 *
 * One shared browser context (IndexedDB) across all tests.
 * Editor creates content; reviewer approves/rejects; admin publishes.
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import {
  loginAsAdmin,
  loginAsEditor,
  loginAsReviewer,
  logout,
  openSection,
} from './helpers/auth'

let context: BrowserContext
let page: Page

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext()
  page = await context.newPage()
  // Editor is the primary content creator for publications
  await loginAsEditor(page)
})

test.afterAll(async () => {
  await context.close()
})

// ── Navigation ────────────────────────────────────────────────────────────────

test('editor can navigate to the Publishing section', async () => {
  await openSection(page, 'Publishing')
  // PublicationListPage h1 is "Publishing"
  await expect(page.locator('h1:has-text("Publishing")')).toBeVisible()
})

// ── Empty state ───────────────────────────────────────────────────────────────

test('Publications list shows empty state before any publications are created', async () => {
  await openSection(page, 'Publishing')
  await expect(page.locator('text=No publications')).toBeVisible()
})

// ── Create draft ──────────────────────────────────────────────────────────────

test('editor can open the New Publication form', async () => {
  await openSection(page, 'Publishing')
  await page.click('text=+ New Publication')
  await expect(page.locator('h1:has-text("New Publication")')).toBeVisible()
})

test('editor can save a publication as a draft', async () => {
  // Already on the New Publication form from the previous test
  await page.getByPlaceholder('Publication title').fill('E2E Announcement Draft')

  // Body (TipTap ProseMirror)
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.type('This announcement was created by the E2E test suite.')

  await page.click('button:has-text("Save Draft")')

  // After saving, the form switches to edit mode for the created publication.
  await expect(page.locator('text=E2E Announcement Draft').first()).toBeVisible()
})

// ── Draft appears in list ─────────────────────────────────────────────────────

test('the draft publication appears in the list with Draft status', async () => {
  // Close stale Publishing tab so next navigation mounts fresh with updated data
  await page.locator('[aria-label="Close Publishing"]').click()
  await openSection(page, 'Publishing')
  const row = page.locator('tr', { hasText: 'E2E Announcement Draft' })
  await expect(row).toBeVisible()
  // Use exact match to avoid matching "E2E Announcement Draft" button text
  await expect(row.getByText('Draft', { exact: true })).toBeVisible()
})

// ── Status filter ─────────────────────────────────────────────────────────────

test('Draft filter shows the publication; Published filter hides it', async () => {
  await openSection(page, 'Publishing')

  // Use exact match to avoid clicking "E2E Announcement Draft" row button
  await page.getByRole('button', { name: 'Draft', exact: true }).click()
  const row = page.locator('tr', { hasText: 'E2E Announcement Draft' })
  await expect(row).toBeVisible()

  await page.getByRole('button', { name: 'Published', exact: true }).click()
  await expect(row).not.toBeVisible()

  await page.getByRole('button', { name: 'All', exact: true }).click()
})

// ── Submit for review ─────────────────────────────────────────────────────────

test('editor submits the publication for review; status becomes InReview', async () => {
  await openSection(page, 'Publishing')
  const row = page.locator('tr', { hasText: 'E2E Announcement Draft' })

  // Click the Edit action button (not the title button which opens the review view)
  await row.locator('button:has-text("Edit")').click()
  await page.waitForSelector('h1:has-text("Edit Publication")')

  // Use :visible to target the active tab's button (hidden tabs may also have this button)
  await page.locator('button:has-text("Submit for Review"):visible').click()
  await expect(page.locator('text=Submitted for review')).toBeVisible()

  // Close stale Publishing tab so next navigation shows updated status
  await page.locator('[aria-label="Close Publishing"]').click()
  await openSection(page, 'Publishing')
  const updatedRow = page.locator('tr', { hasText: 'E2E Announcement Draft' })
  await expect(updatedRow.getByText('InReview', { exact: true })).toBeVisible()
})

// ── Review Queue ──────────────────────────────────────────────────────────────

test('InReview publication appears in the Review Queue for the reviewer', async () => {
  await logout(page)
  await loginAsReviewer(page)

  // Reviewer's "Publishing" nav link lands on the Review Queue (/publishing/queue)
  await openSection(page, 'Publishing')
  await expect(page.locator('h1:has-text("Review Queue")')).toBeVisible()
  await expect(page.locator('text=E2E Announcement Draft')).toBeVisible()
})

// ── Reviewer approves ─────────────────────────────────────────────────────────

test('reviewer approves the publication; status changes to Approved', async () => {
  await openSection(page, 'Publishing')

  // Click publication title to open the review detail tab (h1 is the pub title)
  await page.locator('text=E2E Announcement Draft').click()
  await page.waitForSelector('button:has-text("Approve")')

  // Optional comment
  await page.fill('textarea[placeholder="Add a review comment…"]', 'Content meets publication standards.')
  await page.click('button:has-text("Approve")')

  await expect(page.locator('text=Publication approved')).toBeVisible()
  await expect(page.locator('text=Approved').first()).toBeVisible()
})

