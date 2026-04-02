import { useEffect, useState } from 'react'
import { Archive, Bell, FileText, Gavel, Package, PlusCircle, Settings, Upload } from 'lucide-react'
import { db } from '@/db'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { usePermission } from '@/hooks/usePermission'
import { Role } from '@/types'
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui'

// ── Stat widget ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ElementType
  accent?: string
  isLoading?: boolean
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent = 'text-primary-400',
  isLoading,
}: StatCardProps) {
  return (
    <Card className="flex items-center gap-4">
      <div className={`shrink-0 p-2.5 rounded-xl bg-surface-800 ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-surface-500 mb-0.5">{label}</p>
        {isLoading ? (
          <Skeleton className="h-5 w-12" />
        ) : (
          <p className="text-xl font-semibold text-surface-100">{value}</p>
        )}
      </div>
    </Card>
  )
}

// ── Quick-action button ────────────────────────────────────────────────────────

interface QuickActionProps {
  label: string
  icon: React.ElementType
  onClick: () => void
}

function QuickAction({ label, icon: Icon, onClick }: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface-800 hover:bg-surface-700 border border-surface-700 hover:border-surface-600 transition-colors text-center"
    >
      <Icon className="w-5 h-5 text-primary-400" />
      <span className="text-xs text-surface-400 font-medium">{label}</span>
    </button>
  )
}

// ── Dashboard stats shape ──────────────────────────────────────────────────────

interface DashStats {
  activeAuctions: number
  pendingApprovals: number
  unreadMessages: number
  openDocuments: number
  catalogItems: number
}

// ── DashboardPage ──────────────────────────────────────────────────────────────

export function DashboardPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const openTab = useTabStore((s) => s.openTab)
  const [stats, setStats] = useState<DashStats | null>(null)

  // Permissions for conditional rendering
  const canViewAuctions = usePermission('viewAuctions')
  const canCreateAuction = usePermission('createAuction')
  const canApprove = usePermission('approvePublication')
  const canViewDocuments = usePermission('viewDocuments')
  const canCreateDocument = usePermission('createDocument')
  const canViewMessages = usePermission('viewMessages')
  const canViewCatalog = usePermission('viewCatalog')
  const canCreateCatalog = usePermission('createCatalogItem')
  const canManageUsers = usePermission('manageUsers')

  useEffect(() => {
    const load = async () => {
      const [activeAuctions, unreadMessages, openDocuments, catalogItems, pendingAuctions] =
        await Promise.all([
          db.auctions.where('status').equals('Active').count(),
          db.notifications.where('isRead').equals(0).count(),
          db.documents.where('status').notEqual('Archived').count(),
          db.catalogItems.count(),
          db.auctions.where('status').equals('PendingApproval').count(),
        ])
      setStats({
        activeAuctions,
        pendingApprovals: pendingAuctions,
        unreadMessages,
        openDocuments,
        catalogItems,
      })
    }
    void load()
  }, [])

  if (!currentUser) return null

  const isLoading = stats === null
  const greeting = getGreeting()
  const roleBadgeVariant =
    currentUser.role === Role.Administrator
      ? ('primary' as const)
      : currentUser.role === Role.ContentEditor
        ? ('warning' as const)
        : currentUser.role === Role.ReviewerApprover
          ? ('success' as const)
          : ('default' as const)

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-surface-500 text-sm">{greeting}</p>
          <h1 className="text-xl font-bold text-surface-50 mt-0.5">{currentUser.displayName}</h1>
        </div>
        <Badge variant={roleBadgeVariant}>{currentUser.role}</Badge>
      </div>

      {/* ── Stat widgets ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {canViewAuctions && (
          <StatCard
            label="Active Auctions"
            value={stats?.activeAuctions ?? 0}
            icon={Gavel}
            accent="text-primary-400"
            isLoading={isLoading}
          />
        )}
        {canApprove && (
          <StatCard
            label="Pending Approvals"
            value={stats?.pendingApprovals ?? 0}
            icon={FileText}
            accent="text-amber-400"
            isLoading={isLoading}
          />
        )}
        {canViewMessages && (
          <StatCard
            label="Unread Messages"
            value={stats?.unreadMessages ?? 0}
            icon={Bell}
            accent="text-sky-400"
            isLoading={isLoading}
          />
        )}
        {canViewDocuments && (
          <StatCard
            label="Documents"
            value={stats?.openDocuments ?? 0}
            icon={Archive}
            accent="text-emerald-400"
            isLoading={isLoading}
          />
        )}
        {canViewCatalog && (
          <StatCard
            label="Catalog Items"
            value={stats?.catalogItems ?? 0}
            icon={Package}
            accent="text-violet-400"
            isLoading={isLoading}
          />
        )}
      </div>

      {/* ── Quick actions ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Quick Actions" description="Jump to your most common tasks" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {canCreateAuction && (
            <QuickAction
              label="New Auction"
              icon={PlusCircle}
              onClick={() => {
                openTab({ id: 'auctions-new', title: 'New Auction', path: '/auctions/new' })
              }}
            />
          )}
          {canCreateCatalog && (
            <QuickAction
              label="Add Catalog Item"
              icon={Package}
              onClick={() => {
                openTab({ id: 'catalog-new', title: 'New Item', path: '/catalog/new' })
              }}
            />
          )}
          {canCreateDocument && (
            <QuickAction
              label="Upload Document"
              icon={Upload}
              onClick={() => {
                openTab({ id: 'documents-new', title: 'New Document', path: '/documents/new' })
              }}
            />
          )}
          {canApprove && (
            <QuickAction
              label="Review Queue"
              icon={FileText}
              onClick={() => {
                openTab({
                  id: 'publishing-review-queue',
                  title: 'Review Queue',
                  path: '/publishing/review-queue',
                })
              }}
            />
          )}
          {canViewMessages && (
            <QuickAction
              label="Messages"
              icon={Bell}
              onClick={() => {
                openTab({ id: 'notifications', title: 'Notifications', path: '/notifications' })
              }}
            />
          )}
          {canManageUsers && (
            <QuickAction
              label="Admin Panel"
              icon={Settings}
              onClick={() => {
                openTab({ id: 'admin-users', title: 'Users', path: '/admin/users' })
              }}
            />
          )}
        </div>
      </Card>

      {/* ── Footer note ──────────────────────────────────────────────────────── */}
      <p className="text-surface-700 text-xs">
        100% offline — all data stored locally in your browser
      </p>
    </div>
  )
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
