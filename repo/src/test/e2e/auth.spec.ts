/**
 * E2E — Authentication journeys
 *
 * Each test uses a fresh browser context so IndexedDB starts empty and demo
 * accounts are re-seeded from scratch (no cross-test contamination).
 *
 * Journeys covered:
 *  1. Login with wrong credentials → error message
 *  2. Login with correct credentials → forced password-change screen
 *  3. Complete password change → arrive at Dashboard
 *  4. Editor login (also requires forced password change)
 *
 * Self-registration is covered at the unit/store level.
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import {
  gotoLogin,
  submitLogin,
  completeForcePasswordChange,
  waitForDashboard,
  ADMIN,
  EDITOR,
  TEST_NEW_PASSWORD,
} from './helpers/auth'

// Each test gets its own context → fresh IndexedDB
let context: BrowserContext
let page: Page

test.beforeEach(async ({ browser }) => {
  context = await browser.newContext()
  page = await context.newPage()
})

test.afterEach(async () => {
  await context.close()
})

// ── 1. Wrong credentials ──────────────────────────────────────────────────────

test('shows an error for invalid username', async () => {
  await gotoLogin(page)
  await submitLogin(page, 'nobody', 'wrongpassword!')
  await expect(page.locator('text=Invalid username or password')).toBeVisible()
})

test('shows an error for correct username but wrong password', async () => {
  await gotoLogin(page)
  await submitLogin(page, ADMIN.username, 'notthepassword!')
  await expect(page.locator('text=Invalid username or password')).toBeVisible()
})

// ── 2. Forced password change on first login ──────────────────────────────────

test('redirects to the force-password-change screen on first login', async () => {
  await gotoLogin(page)
  await submitLogin(page, ADMIN.username, ADMIN.password)
  // Force-change form must appear before the dashboard
  await expect(page.locator('#fp-current')).toBeVisible()
  await expect(page.locator('#fp-next')).toBeVisible()
  await expect(page.locator('#fp-confirm')).toBeVisible()
})

test('rejects a new password shorter than 12 characters', async () => {
  await gotoLogin(page)
  await submitLogin(page, ADMIN.username, ADMIN.password)
  await page.waitForSelector('#fp-current')
  await page.fill('#fp-current', ADMIN.password)
  await page.fill('#fp-next', 'Short1!')
  await page.fill('#fp-confirm', 'Short1!')
  await page.click('button[type="submit"]')
  // Still on the force-change page (not navigated away)
  await expect(page.locator('#fp-current')).toBeVisible()
})

test('rejects confirm that does not match new password', async () => {
  await gotoLogin(page)
  await submitLogin(page, ADMIN.username, ADMIN.password)
  await page.waitForSelector('#fp-current')
  await page.fill('#fp-current', ADMIN.password)
  await page.fill('#fp-next', TEST_NEW_PASSWORD)
  await page.fill('#fp-confirm', 'DifferentPass1!')
  await page.click('button[type="submit"]')
  await expect(page.locator('#fp-current')).toBeVisible()
})

// ── 3. Successful password change → Dashboard ─────────────────────────────────

test('reaches the Dashboard after completing the force-password-change flow', async () => {
  await gotoLogin(page)
  await submitLogin(page, ADMIN.username, ADMIN.password)
  await completeForcePasswordChange(page, ADMIN.password)
  await waitForDashboard(page)
  // The nav drawer shows the user's role badge — use exact match to avoid
  // hitting the display-name "Admin User" text as well.
  await expect(page.getByText('Admin', { exact: true }).first()).toBeVisible()
})

test('can log in again with the new password after force-change', async () => {
  // First login + password change
  await gotoLogin(page)
  await submitLogin(page, ADMIN.username, ADMIN.password)
  await completeForcePasswordChange(page, ADMIN.password)
  await waitForDashboard(page)

  // Sign out
  await page.click('button:has-text("Sign out")')
  await page.waitForSelector('#username')

  // Re-login with new password — no force-change this time
  await submitLogin(page, ADMIN.username, TEST_NEW_PASSWORD)
  await waitForDashboard(page)
})

// ── 4. Editor login flow ─────────────────────────────────────────────────────
// (Self-registration is covered at the unit level in auth store tests.)

test('editor account also requires a forced password change on first login', async () => {
  await gotoLogin(page)
  await submitLogin(page, EDITOR.username, EDITOR.password)
  await expect(page.locator('#fp-current')).toBeVisible()
})
