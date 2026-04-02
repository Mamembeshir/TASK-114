import { useAuthStore } from '@/store/authStore'
import { hasPermission, type Permission } from '@/auth/permissions'

/**
 * Returns true when the currently signed-in user holds the given permission.
 *
 * - When `permission` is `undefined` (no restriction), always returns `true`.
 * - When no user is authenticated, always returns `false`.
 *
 * @example
 * const canBid = usePermission('placeBid')
 * const alwaysVisible = usePermission(undefined) // true for any authenticated user
 */
export function usePermission(permission: Permission | undefined): boolean {
  const role = useAuthStore((s) => s.currentUser?.role)
  if (permission === undefined) return true
  if (!role) return false
  return hasPermission(role, permission)
}
