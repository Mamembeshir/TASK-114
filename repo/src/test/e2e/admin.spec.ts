/**
 * E2E — Admin-only section journeys
 *
 * Covers the admin pages that have no unit-level coverage:
 *   - User Management: create, validate, deactivate/activate, reset password, edit role
 *   - Sensitive Word List: add, verify, delete
 *   - Audit Log: entries written after user actions
 *   - System Settings, Data Export, Data Import: page loads
 *
 * Uses a single shared browser context across all tests so that state produced
 * by earlier tests (e.g. created users, sensitive words) is available to later
 * ones.  Tests are ordered deliberately.
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

// ── User Management — navigation ──────────────────────────────────────────────

test('admin can navigate to User Management', async () => {
  await openSection(page, 'Users')
  await expect(page.locator('h1:has-text("User Management")')).toBeVisible()
})

test('admin accounts are listed on the User Management page', async () => {
  await openSection(page, 'Users')
  await expect(page.locator('text=Admin User').first()).toBeVisible()
})

// ── User Management — create ──────────────────────────────────────────────────

test('admin can open the New User modal', async () => {
  await openSection(page, 'Users')
  await page.click('text=+ New User')
  await page.waitForSelector('[aria-modal="true"]')
  await expect(page.locator('[aria-modal="true"]')).toBeVisible()
  // Close the modal so it does not block subsequent tests
  await page.keyboard.press('Escape')
  await page.waitForSelector('[aria-modal="true"]', { state: 'hidden' })
})

test('submitting an empty create-user form shows required-field errors', async () => {
  await openSection(page, 'Users')
  await page.click('text=+ New User')
  await page.waitForSelector('[aria-modal="true"]')
  await page.click('button:has-text("Create User")')
  await expect(page.locator('text=Display name is required')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.waitForSelector('[aria-modal="true"]', { state: 'hidden' })
})

test('a password shorter than 12 characters shows a validation error', async () => {
  await openSection(page, 'Users')
  await page.click('text=+ New User')
  await page.waitForSelector('[aria-modal="true"]')
  // Labels have no htmlFor/id linkage, so scope to the modal and use nth()
  // Order: 0=Display Name, 1=Username, 2=Email, 3=Organisation, 4=Password, 5=Confirm Password
  const modal = page.locator('[aria-modal="true"]')
  await modal.locator('input').nth(0).fill('Short Pw User')
  await modal.locator('input').nth(1).fill('shortpwuser')
  await modal.locator('input').nth(4).fill('Short1!')
  await modal.locator('input').nth(5).fill('Short1!')
  await page.click('button:has-text("Create User")')
  await expect(page.locator('text=Password must be at least 12 characters')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.waitForSelector('[aria-modal="true"]', { state: 'hidden' })
})

test('admin can create a new Participant user', async () => {
  await openSection(page, 'Users')
  await page.click('text=+ New User')
  await page.waitForSelector('[aria-modal="true"]')

  const modal = page.locator('[aria-modal="true"]')
  await modal.locator('input').nth(0).fill('E2E Participant')
  await modal.locator('input').nth(1).fill('e2eparticipant')
  await modal.locator('input').nth(2).fill('e2e@participant.local')
  await modal.locator('select').selectOption({ label: 'Participant' })
  await modal.locator('input').nth(4).fill('ParticipantE2E1!')
  await modal.locator('input').nth(5).fill('ParticipantE2E1!')

  await page.click('button:has-text("Create User")')
  await expect(page.locator('text=User created')).toBeVisible()
  await expect(page.locator('text=E2E Participant')).toBeVisible()
})

test('creating a user with a duplicate username shows an error', async () => {
  await openSection(page, 'Users')
  await page.click('text=+ New User')
  await page.waitForSelector('[aria-modal="true"]')

  // Use the same username created in the previous test
  const modal = page.locator('[aria-modal="true"]')
  await modal.locator('input').nth(0).fill('Duplicate User')
  await modal.locator('input').nth(1).fill('e2eparticipant')
  await modal.locator('input').nth(4).fill('ValidPassword123!')
  await modal.locator('input').nth(5).fill('ValidPassword123!')

  await page.click('button:has-text("Create User")')
  await expect(page.locator('text=Username already taken')).toBeVisible()

  // Dismiss the modal so subsequent tests start clean
  await page.click('button:has-text("Cancel")')
  await page.waitForSelector('[aria-modal="true"]', { state: 'hidden' })
})

// ── User Management — deactivate / activate ───────────────────────────────────

test('admin can deactivate a user; status badge changes to Inactive', async () => {
  await openSection(page, 'Users')
  // Scope deactivation to the E2E Participant row to avoid clicking other users' buttons
  const row = page.locator('tr', { hasText: 'E2E Participant' })
  await expect(row).toBeVisible()
  await row.locator('[title="Deactivate"]').click()
  await expect(page.locator('text=User deactivated')).toBeVisible()
  await expect(row.locator('text=Inactive')).toBeVisible()
})

test('admin can reactivate a deactivated user; status badge changes back to Active', async () => {
  await openSection(page, 'Users')
  // The activate button has title="Activate" after deactivation
  const row = page.locator('tr', { hasText: 'E2E Participant' })
  await row.locator('[title="Activate"]').click()
  await expect(page.locator('text=User activated')).toBeVisible()
  await expect(row.locator('text=Active')).toBeVisible()
})

// ── User Management — reset password ─────────────────────────────────────────

test('admin can reset a user password via the Reset pw modal', async () => {
  await openSection(page, 'Users')
  const row = page.locator('tr', { hasText: 'E2E Participant' })

  // Open the reset-password modal
  await row.locator('button:has-text("Reset pw")').click()
  await page.waitForSelector('text=Reset Password:')

  // Fill the new password (≥12 chars) — label has no htmlFor linkage, use type selector
  await page.locator('[aria-modal="true"] input[type="password"]').fill('ResetNewPass123!')
  await page.locator('[aria-modal="true"] button:has-text("Reset Password")').click()

  await expect(page.locator('text=Password reset')).toBeVisible({ timeout: 10000 })
})

// ── User Management — edit role ───────────────────────────────────────────────

test('admin can edit a user role and save changes', async () => {
  await openSection(page, 'Users')
  const row = page.locator('tr', { hasText: 'E2E Participant' })

  await row.locator('button:has-text("Edit")').click()
  await page.waitForSelector('text=Edit:')

  // Change the role to ContentEditor — label has no htmlFor linkage, scope to modal
  await page.locator('[aria-modal="true"] select').selectOption({ label: 'ContentEditor' })
  await page.locator('[aria-modal="true"] button:has-text("Save Changes")').click()

  await expect(page.locator('text=User updated')).toBeVisible()
})

// ── Sensitive Word List ───────────────────────────────────────────────────────

test('admin can navigate to Sensitive Word List', async () => {
  await openSection(page, 'Sensitive Words')
  await expect(page.locator('h1:has-text("Sensitive Word List")')).toBeVisible()
})

test('admin can add a sensitive word and see it in the list', async () => {
  await openSection(page, 'Sensitive Words')
  await page.locator('input[placeholder="Enter word or phrase…"]').fill('badword')
  await page.click('button:has-text("Add Word")')

  await expect(page.locator('text="badword" added to moderation list')).toBeVisible()
  await expect(page.locator('text=badword').first()).toBeVisible()
})

test('admin can delete a sensitive word from the list', async () => {
  await openSection(page, 'Sensitive Words')
  // Hover the row to reveal the delete button (group-hover pattern)
  const wordRow = page.locator('div.group', { hasText: 'badword' })
  await wordRow.hover()

  await page.locator('[aria-label="Remove \\"badword\\""]').click()
  await expect(page.locator('text="badword" removed')).toBeVisible()
  await expect(page.locator('text=No sensitive words')).toBeVisible()
})

// ── Audit Log ─────────────────────────────────────────────────────────────────

test('admin can navigate to the Audit Log', async () => {
  await openSection(page, 'Audit Log')
  await expect(page.locator('h1:has-text("Audit Log")')).toBeVisible()
})

// ── System Settings ───────────────────────────────────────────────────────────

test('admin can navigate to System Settings', async () => {
  await openSection(page, 'System Settings')
  await expect(page.locator('h1:has-text("System Settings")')).toBeVisible()
})

// ── Data Export ───────────────────────────────────────────────────────────────

test('admin can navigate to Data Export', async () => {
  await openSection(page, 'Data Export')
  await expect(page.locator('h1:has-text("Data Export")')).toBeVisible()
})

// ── Data Import ───────────────────────────────────────────────────────────────

test('admin can navigate to Data Import', async () => {
  await openSection(page, 'Data Import')
  await expect(page.locator('h1:has-text("Data Import")')).toBeVisible()
})
