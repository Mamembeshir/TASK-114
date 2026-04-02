import { useAuthStore } from '@/store/authStore'
import { hasPermission, type Permission } from '@/auth/permissions'

/**
 * Returns true when the currently signed-in user holds the given permission.
 * Always returns false when no user is authenticated.
 *
 * @example
 * const canBid = usePermission('placeBid')
 * if (!canBid) return null
 */
export function usePermission(permission: Permission): boolean {
  const role = useAuthStore((s) => s.currentUser?.role)
  if (!role) return false
  return hasPermission(role, permission)
}
