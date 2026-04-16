/**
 * E2E — Notification Center & Outbound Queue journeys
 *
 * Covers UI navigation and basic page rendering for the notifications area:
 *   - Inbox navigation & empty state
 *   - Preferences tab navigation
 *   - Outbound Queue navigation, empty state, filters, export buttons, Compose panel
 *
 * Uses a single shared browser context across all tests.
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { loginAsAdmin, openSection } from './helpers/auth'

let context: BrowserContext
let page: Page

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext()
  page = await context.newPage()
  await loginAsAdmin(page)
})

test.afterAll(async () => {
  await context.close()
})

// ── Inbox ─────────────────────────────────────────────────────────────────────

test('admin can navigate to the Notifications section', async () => {
  await openSection(page, 'Notifications')
  await expect(page.locator('h1:has-text("Notifications")')).toBeVisible()
})

test('inbox shows empty state before any notifications exist', async () => {
  await openSection(page, 'Notifications')
  // When unreadCount === 0 the subtitle reads "All caught up"
  await expect(page.locator('text=All caught up')).toBeVisible()
  // The empty state card shows "Nothing here yet."
  await expect(page.locator('text=Nothing here yet')).toBeVisible()
})

test('inbox shows status filter buttons (all / unread)', async () => {
  await openSection(page, 'Notifications')
  await expect(page.locator('button').filter({ hasText: /^all$/ })).toBeVisible()
  await expect(page.locator('button').filter({ hasText: /^unread$/ })).toBeVisible()
})

// ── Preferences tab ───────────────────────────────────────────────────────────

test('Preferences tab opens from the Notifications page', async () => {
  await openSection(page, 'Notifications')
  await page.click('button:has-text("Preferences")')
  // Preferences panel shows channel column headers
  await expect(page.locator('text=In-App').first()).toBeVisible()
  await expect(page.locator('text=SMS').first()).toBeVisible()
})

// ── Outbound Queue ────────────────────────────────────────────────────────────

test('admin can navigate to the Outbound Queue', async () => {
  await openSection(page, 'Outbound Queue')
  await expect(page.locator('h1:has-text("Outbound Queue")')).toBeVisible()
})

test('Outbound Queue shows the empty state when no messages are queued', async () => {
  await openSection(page, 'Outbound Queue')
  await expect(page.locator('text=Queue is empty')).toBeVisible()
})

test('Outbound Queue has CSV and JSON export buttons', async () => {
  await openSection(page, 'Outbound Queue')
  await expect(page.locator('button:has-text("CSV")')).toBeVisible()
  await expect(page.locator('button:has-text("JSON")')).toBeVisible()
})

test('Outbound Queue has status filter buttons', async () => {
  await openSection(page, 'Outbound Queue')
  await expect(page.locator('button:has-text("All")')).toBeVisible()
  await expect(page.locator('button:has-text("Queued")')).toBeVisible()
  await expect(page.locator('button:has-text("Sent")')).toBeVisible()
  await expect(page.locator('button:has-text("Failed")')).toBeVisible()
})

test('Outbound Queue Compose panel opens', async () => {
  await openSection(page, 'Outbound Queue')
  await page.click('button:has-text("Compose")')
  await expect(page.locator('h2:has-text("Compose & Schedule Message")')).toBeVisible()
})
