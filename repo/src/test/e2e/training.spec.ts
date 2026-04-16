/**
 * E2E — Training page journeys
 *
 * The training page lists active courses for the current user.  Courses have
 * no UI creation form in the app, so these tests focus on navigation, the
 * empty-state rendering, and role-based access.
 *
 * Test order matters — a shared browser context is used across all tests.
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { loginAsAdmin, loginAsReviewer, logout, openSection } from './helpers/auth'

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

// ── Admin — navigation & empty state ──────────────────────────────────────────

test('admin can navigate to the Training section', async () => {
  await openSection(page, 'Training')
  await expect(page.locator('h1:has-text("Training")')).toBeVisible()
})

test('training page shows the empty-state message when no courses exist', async () => {
  await openSection(page, 'Training')
  await expect(page.locator('text=No training courses available')).toBeVisible()
})

test('training page shows the compliance description text', async () => {
  await openSection(page, 'Training')
  await expect(page.locator('text=Complete the required courses')).toBeVisible()
})

// ── Reviewer role ─────────────────────────────────────────────────────────────

test('reviewer can access the Training section', async () => {
  await logout(page)
  await loginAsReviewer(page)
  await openSection(page, 'Training')
  await expect(page.locator('h1:has-text("Training")')).toBeVisible()
})
