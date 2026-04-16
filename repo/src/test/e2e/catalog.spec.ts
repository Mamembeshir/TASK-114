/**
 * E2E — Catalog management journeys
 *
 * Uses a single shared browser context (one IndexedDB) across all tests in this
 * file.  The admin account is set up in beforeAll via the force-password-change
 * flow; subsequent tests reuse the already-authenticated session.
 *
 * Journeys covered:
 *  1. Navigate to Catalog section
 *  2. Open the New Item form
 *  3. Form shows all required fields
 *  4. Validation errors appear when saving an empty form
 *  5. Editor can also access the Catalog page
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { loginAsAdmin, loginAsEditor, logout, openSection } from './helpers/auth'

let context: BrowserContext
let page: Page

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext()
  page = await context.newPage()
  // Set up admin session (handles forced password change)
  await loginAsAdmin(page)
})

test.afterAll(async () => {
  await context.close()
})

// ── Navigation ────────────────────────────────────────────────────────────────

test('admin can navigate to the Catalog section', async () => {
  await openSection(page, 'Catalog')
  await expect(page.locator('h1:has-text("Catalog")')).toBeVisible()
})

// ── New Item form ─────────────────────────────────────────────────────────────

test('admin can open the New Item form', async () => {
  await openSection(page, 'Catalog')
  await page.click('text=+ New Item')
  await expect(page.locator('h1:has-text("New Catalog Item")')).toBeVisible()
})

test('the New Item form shows the expected core fields', async () => {
  // Form should already be open from the previous test
  await expect(page.getByPlaceholder('Enter item title')).toBeVisible()
  await expect(page.getByPlaceholder('Describe the item')).toBeVisible()
  await expect(page.locator('select')).toBeVisible()
  await expect(page.getByPlaceholder('0.00')).toBeVisible()
  // Save Draft and Create & Publish buttons present
  await expect(page.locator('button:has-text("Save Draft")')).toBeVisible()
  await expect(page.locator('button:has-text("Create & Publish")')).toBeVisible()
})

// ── Validation ────────────────────────────────────────────────────────────────

test('submitting an empty New Item form shows validation errors', async () => {
  // Should still be on the new item form
  await page.click('button:has-text("Save Draft")')
  // At least one required-field error should appear — Title is the simplest
  await expect(page.locator('text=Title is required')).toBeVisible()
})

// ── Editor role ───────────────────────────────────────────────────────────────

test('editor can access the Catalog section after logging in', async () => {
  await logout(page)
  await loginAsEditor(page)
  await openSection(page, 'Catalog')
  await expect(page.locator('h1:has-text("Catalog")')).toBeVisible()
})
