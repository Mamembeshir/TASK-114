/**
 * Runtime permission enforcement for the service layer.
 *
 * Call `requirePermission(permission)` at the top of any service function
 * that mutates data. It reads the current user from the Zustand auth store
 * and throws if the role lacks the required permission.
 *
 * This provides defense-in-depth on top of the UI-level guards (usePermission
 * hook, NavDrawer item visibility).
 */

import { useAuthStore } from '@/store/authStore'
import { hasPermission } from '@/auth/permissions'
import type { Permission } from '@/auth/permissions'

/**
 * Throws an `Error` if the currently-authenticated user does not have
 * `permission`. Call at the top of any service mutation.
 */
export function requirePermission(permission: Permission): void {
  const user = useAuthStore.getState().currentUser
  if (!user || !hasPermission(user.role, permission)) {
    throw new Error(`Forbidden: '${permission}' permission required`)
  }
}
