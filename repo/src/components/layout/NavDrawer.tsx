import {
  Archive,
  BarChart2,
  Bell,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  Gavel,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MailCheck,
  Package,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  Upload,
  Users,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePermission } from '@/hooks/usePermission'
import { useTabStore } from '@/store/tabStore'
import { Role } from '@/types'
import type { Permission } from '@/auth/permissions'

// ── Role badge colours ─────────────────────────────────────────────────────────

const ROLE_BADGE: Record<Role, { label: string; className: string }> = {
  [Role.Administrator]: {
    label: 'Admin',
    className: 'bg-primary-600/20 text-primary-400 border border-primary-600/30',
  },
  [Role.ContentEditor]: {
    label: 'Editor',
    className: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  },
  [Role.ReviewerApprover]: {
    label: 'Reviewer',
    className: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  },
  [Role.Participant]: {
    label: 'Participant',
    className: 'bg-surface-700/50 text-surface-400 border border-surface-700',
  },
}

// ── Nav item definition ────────────────────────────────────────────────────────

interface NavItem {
  label: string
  icon: React.ElementType
  /** Canonical base path — used for active-state detection */
  to: string
  /**
   * Optional role-aware resolver for the actual navigation target.
   * Allows lower-privilege roles to land on a browse/view page instead of
   * the management page that would show "Access Denied".
   */
  toFn?: (role: Role) => string
  /** If set, item is hidden when the user lacks this permission */
  permission?: Permission
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    to: '/',
  },
  {
    label: 'Auctions',
    icon: Gavel,
    to: '/auctions',
    toFn: (role) =>
      role === Role.Participant ? '/auctions/browse' : '/auctions',
    permission: 'viewAuctions',
  },
  {
    label: 'Catalog',
    icon: Package,
    to: '/catalog',
    toFn: (role) => {
      if (role === Role.Administrator || role === Role.ContentEditor) return '/catalog'
      if (role === Role.ReviewerApprover) return '/catalog/moderation'
      return '/catalog/browse'
    },
    permission: 'viewCatalog',
  },
  {
    label: 'Publishing',
    icon: FileText,
    to: '/publishing',
    toFn: (role) => {
      if (role === Role.Administrator || role === Role.ContentEditor) return '/publishing'
      if (role === Role.ReviewerApprover) return '/publishing/queue'
      return '/publishing/feed'
    },
    permission: 'viewPublications',
  },
  {
    label: 'Readership Analytics',
    icon: BarChart2,
    to: '/publishing/analytics',
    permission: 'managePublications',
  },
  {
    label: 'Documents',
    icon: Archive,
    to: '/documents',
    permission: 'viewDocuments',
  },
  {
    label: 'Training',
    icon: GraduationCap,
    to: '/training',
    permission: 'viewTraining',
  },
  {
    label: 'Notifications',
    icon: Bell,
    to: '/notifications',
    permission: 'viewMessages',
  },
  {
    label: 'Outbound Queue',
    icon: MailCheck,
    to: '/outbound-queue',
    permission: 'manageMessages',
  },
  {
    label: 'Users',
    icon: Users,
    to: '/admin/users',
    permission: 'manageUsers',
  },
  {
    label: 'System Settings',
    icon: Settings,
    to: '/admin/settings',
    permission: 'manageSystem',
  },
  {
    label: 'Sensitive Words',
    icon: ShieldAlert,
    to: '/admin/sensitive-words',
    permission: 'manageSystem',
  },
  {
    label: 'Audit Log',
    icon: ScrollText,
    to: '/admin/audit-log',
    permission: 'viewAuditLog',
  },
  {
    label: 'Data Export',
    icon: Database,
    to: '/admin/export',
    permission: 'manageSystem',
  },
  {
    label: 'Data Import',
    icon: Upload,
    to: '/admin/import',
    permission: 'manageSystem',
  },
]

// ── Sub-components ─────────────────────────────────────────────────────────────

interface NavItemRowProps {
  item: NavItem
  open: boolean
  active: boolean
}

function NavItemRow({ item, open, active }: NavItemRowProps) {
  const allowed = usePermission(item.permission)
  const currentUser = useAuthStore((s) => s.currentUser)
  const { openTab, activateTab, tabs } = useTabStore()

  if (!allowed || !currentUser) return null

  const Icon = item.icon
  // Resolve the actual navigation target — may differ from the canonical `to`
  const resolvedPath = item.toFn ? item.toFn(currentUser.role) : item.to

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    // If a tab for this path already exists, activate it; otherwise open a new tab
    const existing = tabs.find((t) => t.path === resolvedPath)
    if (existing) {
      activateTab(existing.id)
    } else {
      openTab({ id: resolvedPath, title: item.label, path: resolvedPath })
    }
  }

  return (
    <button
      onClick={handleClick}
      title={!open ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={[
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-sm font-medium group',
        active
          ? 'bg-primary-600/15 text-primary-400'
          : 'text-surface-400 hover:bg-surface-800 hover:text-surface-200',
      ].join(' ')}
    >
      <Icon
        className={[
          'w-5 h-5 shrink-0 transition-colors',
          active ? 'text-primary-400' : 'text-surface-500 group-hover:text-surface-300',
        ].join(' ')}
      />
      {open && <span className="truncate">{item.label}</span>}
    </button>
  )
}

// ── NavDrawer ──────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onToggle: () => void
}

export function NavDrawer({ open, onToggle }: Props) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const tabs = useTabStore((s) => s.tabs)
  const activePath = tabs.find((t) => t.id === activeTabId)?.path ?? '/'

  if (!currentUser) return null

  const badge = ROLE_BADGE[currentUser.role]
  const initials = currentUser.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex flex-col h-full">
      {/* ── Header / Logo ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-surface-800 shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-600 shrink-0">
          <Shield className="w-4 h-4 text-white" />
        </div>
        {open && (
          <span className="text-surface-100 font-semibold text-sm truncate">Meridian Portal</span>
        )}
      </div>

      {/* ── Nav items ──────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <NavItemRow
            key={item.to}
            item={item}
            open={open}
            active={activePath === item.to || activePath.startsWith(item.to + '/')}
          />
        ))}
      </nav>

      {/* ── Collapse toggle ────────────────────────────────────────────────── */}
      <div className="px-2 pb-2 shrink-0">
        <button
          onClick={onToggle}
          title={open ? 'Collapse sidebar' : 'Expand sidebar'}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl
            text-surface-500 hover:bg-surface-800 hover:text-surface-300 transition-colors text-sm"
        >
          {open ? (
            <>
              <ChevronLeft className="w-4 h-4 shrink-0" />
              <span>Collapse</span>
            </>
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0" />
          )}
        </button>
      </div>

      {/* ── User footer ────────────────────────────────────────────────────── */}
      <div className="border-t border-surface-800 px-2 py-3 shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-lg bg-surface-700 flex items-center justify-center text-surface-300 text-xs font-semibold shrink-0">
            {initials}
          </div>
          {open && (
            <div className="flex-1 min-w-0">
              <p className="text-surface-200 text-xs font-medium truncate">
                {currentUser.displayName}
              </p>
              <span
                className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={() => {
            void useAuthStore.getState().logout()
          }}
          title="Sign out"
          className="mt-1 w-full flex items-center gap-3 px-3 py-2 rounded-xl
            text-surface-500 hover:bg-surface-800 hover:text-red-400 transition-colors text-sm"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {open && <span>Sign out</span>}
        </button>
      </div>
    </div>
  )
}
