import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, type Permission } from '@/auth/permissions'

interface Props {
  /** Required permission to access this route. If omitted, any authenticated user may access it. */
  permission?: Permission
  children: React.ReactNode
}

/**
 * Wraps a route element and enforces authentication + optional permission checks.
 *
 * - Unauthenticated → redirects to `/login`
 * - Authenticated but missing permission → redirects to `/unauthorized`
 * - Otherwise → renders `children`
 */
export function ProtectedRoute({ permission, children }: Props) {
  const currentUser = useAuthStore((s) => s.currentUser)

  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  if (permission && !hasPermission(currentUser.role, permission)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
