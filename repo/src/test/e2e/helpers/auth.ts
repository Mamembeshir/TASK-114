/**
 * Shared authentication helpers for Playwright E2E tests.
 *
 * Demo accounts are seeded by seedDefaultAdmin() on every fresh app load when
 * VITE_SEED_DEMO=true (set at Docker build time). All demo accounts start with
 * isTemporaryPassword: true, so every first login triggers the force-password-
 * change screen.
 *
 * TEST_NEW_PASSWORD is the password all demo accounts are changed to during the
 * E2E setup phase.  Subsequent logins within the same browser context (same
 * IndexedDB) use TEST_NEW_PASSWORD directly.
 */

import { type Page } from '@playwright/test'

// ── Demo account credentials (matches src/store/authStore.ts seedDefaultAdmin) ─

export const ADMIN = { username: 'admin', password: 'adminPass1!@2' }
export const EDITOR = { username: 'editor', password: 'editorPass1!@' }
export const REVIEWER = { username: 'reviewer', password: 'reviewerPass1!' }

/** Password that all demo accounts are changed to during E2E test setup */
export const TEST_NEW_PASSWORD = 'E2eNewPass1!'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Navigate to the app root and wait for the login form to appear.
 * Handles the initial PBKDF2 seeding delay (up to 15 s).
 */
export async function gotoLogin(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForSelector('#username', { timeout: 15_000 })
}

/**
 * Fill and submit the login form.
 * Does NOT wait for any subsequent page — use waitForDashboard() or
 * waitForForcePasswordChange() after calling this.
 */
export async function submitLogin(page: Page, username: string, password: string): Promise<void> {
  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.click('button[type="submit"]')
}

/**
 * Complete the forced-password-change screen that all demo accounts trigger
 * on their very first login in a fresh IndexedDB context.
 */
export async function completeForcePasswordChange(
  page: Page,
  currentPassword: string,
  newPassword: string = TEST_NEW_PASSWORD,
): Promise<void> {
  // Wait for the force-change form (identified by the #fp-current input)
  await page.waitForSelector('#fp-current', { timeout: 10_000 })
  await page.fill('#fp-current', currentPassword)
  await page.fill('#fp-next', newPassword)
  await page.fill('#fp-confirm', newPassword)
  await page.click('button[type="submit"]')
}

/** Wait until the Dashboard tab is visible (confirms successful login). */
export async function waitForDashboard(page: Page): Promise<void> {
  await page.waitForSelector('text=Dashboard', { timeout: 10_000 })
}

// ── Full login flows ──────────────────────────────────────────────────────────

/**
 * Full admin login flow — handles forced password change on first login.
 * After this resolves, the page is on the Dashboard.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await gotoLogin(page)
  await submitLogin(page, ADMIN.username, ADMIN.password)
  await completeForcePasswordChange(page, ADMIN.password)
  await waitForDashboard(page)
}

/**
 * Full editor login — handles forced password change on first login.
 */
export async function loginAsEditor(page: Page): Promise<void> {
  await gotoLogin(page)
  await submitLogin(page, EDITOR.username, EDITOR.password)
  await completeForcePasswordChange(page, EDITOR.password)
  await waitForDashboard(page)
}

/**
 * Full reviewer login — handles forced password change on first login.
 */
export async function loginAsReviewer(page: Page): Promise<void> {
  await gotoLogin(page)
  await submitLogin(page, REVIEWER.username, REVIEWER.password)
  await completeForcePasswordChange(page, REVIEWER.password)
  await waitForDashboard(page)
}

/**
 * Log out the current user via the UI (clicks the Sign Out button in the nav).
 */
export async function logout(page: Page): Promise<void> {
  // The sign-out button lives in the NavDrawer
  await page.click('button:has-text("Sign out")')
  // Wait until we're back at the login form
  await page.waitForSelector('#username', { timeout: 10_000 })
}

/**
 * Re-login with an account whose password was already changed to TEST_NEW_PASSWORD
 * in this browser context's IndexedDB.  Skips the force-change step.
 */
export async function reloginAsAdmin(page: Page): Promise<void> {
  await submitLogin(page, ADMIN.username, TEST_NEW_PASSWORD)
  await waitForDashboard(page)
}

/**
 * Re-login as reviewer after the force-change has already been completed in this
 * browser context.  Skips the force-change step.
 */
export async function reloginAsReviewer(page: Page): Promise<void> {
  await submitLogin(page, REVIEWER.username, TEST_NEW_PASSWORD)
  await waitForDashboard(page)
}

/**
 * Re-login as editor after the force-change has already been completed in this
 * browser context.  Skips the force-change step.
 */
export async function reloginAsEditor(page: Page): Promise<void> {
  await submitLogin(page, EDITOR.username, TEST_NEW_PASSWORD)
  await waitForDashboard(page)
}

/**
 * Navigate to a named nav section (e.g. "Catalog", "Auctions", "Training").
 * The NavDrawer must be visible (it is open by default on desktop viewports).
 */
export async function openSection(page: Page, label: string): Promise<void> {
  await page.click(`text="${label}"`)
}
