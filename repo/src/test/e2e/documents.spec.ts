/**
 * E2E — Document management journeys
 *
 * Covers navigation, the New Document form, and basic UI validation.
 * One shared browser context (IndexedDB) across all tests.
 *
 * Admin is set up in beforeAll via the force-password-change flow.
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

// ── Navigation ────────────────────────────────────────────────────────────────

test('admin can navigate to the Documents section', async () => {
  await openSection(page, 'Documents')
  await expect(page.locator('h1:has-text("Documents")')).toBeVisible()
})

// ── Empty state ───────────────────────────────────────────────────────────────

test('Documents list shows empty state before any documents are created', async () => {
  await openSection(page, 'Documents')
  await expect(page.locator('text=No documents')).toBeVisible()
})

// ── New document form ─────────────────────────────────────────────────────────

test('clicking + New Document opens the document form', async () => {
  await openSection(page, 'Documents')
  await page.click('text=+ New Document')
  await expect(page.locator('h1:has-text("New Document")')).toBeVisible()
})

test('the New Document form shows the expected core fields', async () => {
  // Form should already be open from the previous test
  await expect(page.locator('#doc-title')).toBeVisible()
  await expect(page.locator('#doc-category')).toBeVisible()
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await expect(page.locator('button:has-text("Save Draft")')).toBeVisible()
})

// ── Validation ────────────────────────────────────────────────────────────────

test('submitting an empty document form shows a title-required error', async () => {
  // Already on the new document form from the previous test
  await page.click('button:has-text("Save Draft")')
  await expect(page.locator('text=Title is required').first()).toBeVisible()
})

// ── Reviewer role ─────────────────────────────────────────────────────────────

test('reviewer can access the Documents section', async () => {
  await logout(page)
  await loginAsReviewer(page)
  await openSection(page, 'Documents')
  await expect(page.locator('h1:has-text("Documents")')).toBeVisible()
})
