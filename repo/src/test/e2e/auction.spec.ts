/**
 * E2E — Auction management journeys
 *
 * Uses a single shared browser context across all tests (one IndexedDB).
 * Admin is set up in beforeAll via the force-password-change flow.
 *
 * Journeys covered:
 *  1. Navigate to Auctions section
 *  2. Open the New Auction form
 *  3. Validation — submit empty form shows errors
 *  4. Create an auction as a draft
 *  5. Create and immediately publish an auction
 *  6. Published auction is listed with Active status
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { loginAsAdmin, openSection } from './helpers/auth'

let context: BrowserContext
let page: Page

/** Returns a datetime-local string (YYYY-MM-DDTHH:mm) offset by `offsetMs` from now */
function futureDatetimeLocal(offsetMs: number): string {
  const d = new Date(Date.now() + offsetMs)
  // Format: YYYY-MM-DDTHH:mm  (no seconds — matches <input type="datetime-local"> default)
  return d.toISOString().slice(0, 16)
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext()
  page = await context.newPage()
  await loginAsAdmin(page)
})

test.afterAll(async () => {
  await context.close()
})

// ── Navigation ────────────────────────────────────────────────────────────────

test('admin can navigate to the Auctions section', async () => {
  await openSection(page, 'Auctions')
  await expect(page.locator('h1:has-text("Auctions")')).toBeVisible()
})

// ── New Auction form ──────────────────────────────────────────────────────────

test('clicking New Auction opens the auction form', async () => {
  await openSection(page, 'Auctions')
  // Use button selector to avoid matching the invisible tab-bar span
  await page.locator('button:has-text("New Auction"):visible').first().click()
  await expect(page.locator('h1:has-text("New Auction")')).toBeVisible()
})

// ── Validation ────────────────────────────────────────────────────────────────

test('submitting an empty auction form shows required-field errors', async () => {
  // Should already be on the new auction form
  await page.click('button:has-text("Save as Draft")')
  // Title is required — at least one validation error should appear
  await expect(page.locator('text=required').first()).toBeVisible()
})

// ── Create draft ──────────────────────────────────────────────────────────────

test('admin can save a new auction as a draft', async () => {
  await openSection(page, 'Auctions')
  await page.locator('button:has-text("New Auction"):visible').first().click()
  await page.waitForSelector('h1:has-text("New Auction")')

  await page.fill('#title', 'E2E Draft Auction')
  await page.fill('#description', 'Draft auction created by Playwright')
  await page.locator('#category').selectOption({ label: 'General' })
  await page.fill('#startPrice', '100')
  await page.fill('#startTime', futureDatetimeLocal(60 * 60 * 1000))      // +1 h
  await page.fill('#endTime', futureDatetimeLocal(24 * 60 * 60 * 1000))   // +24 h

  await page.click('button:has-text("Save as Draft")')
  await expect(page.locator('text=Auction saved as Draft')).toBeVisible()

  // The Auctions list tab was mounted before this auction existed — close it so
  // the next navigation creates a fresh tab with up-to-date IndexedDB data.
  await page.locator('[aria-label="Close Auctions"]').click()
  await openSection(page, 'Auctions')
  await expect(page.locator('text=E2E Draft Auction')).toBeVisible()
})

// ── Create & publish ──────────────────────────────────────────────────────────

test('admin can create and immediately publish an auction', async () => {
  await openSection(page, 'Auctions')
  await page.locator('button:has-text("New Auction"):visible').first().click()
  await page.waitForSelector('h1:has-text("New Auction")')

  await page.fill('#title', 'E2E Live Auction')
  await page.fill('#description', 'Live auction published via Playwright')
  await page.locator('#category').selectOption({ label: 'General' })
  await page.fill('#startPrice', '500')
  // Use a past startTime so publishAuction sets status=Active (not Scheduled)
  await page.fill('#startTime', futureDatetimeLocal(-60 * 60 * 1000))     // -1 h (past)
  await page.fill('#endTime', futureDatetimeLocal(2 * 60 * 60 * 1000))    // +2 h

  await page.click('button:has-text("Create & Publish")')
  await expect(page.locator('text=Auction created and published')).toBeVisible()

  // Close stale Auctions tab so next navigation mounts fresh with updated data
  await page.locator('[aria-label="Close Auctions"]').click()
  await openSection(page, 'Auctions')
  await expect(page.locator('text=E2E Live Auction')).toBeVisible()
})

// ── Status verification ───────────────────────────────────────────────────────

test('the published auction shows an Active status', async () => {
  await openSection(page, 'Auctions')
  const row = page.locator('tr', { hasText: 'E2E Live Auction' })
  await expect(row).toBeVisible()
  await expect(row.locator('text=Active')).toBeVisible()
})

test('the draft auction shows a Draft status', async () => {
  await openSection(page, 'Auctions')
  const row = page.locator('tr', { hasText: 'E2E Draft Auction' })
  await expect(row).toBeVisible()
  // Use exact match — "text=Draft" would also match the button "E2E Draft Auction"
  await expect(row.getByText('Draft', { exact: true })).toBeVisible()
})
