/**
 * TabContent — renders the correct page component for the currently active tab.
 * All page components are lazy-loaded to keep the initial bundle small.
 *
 * Route matching rules (evaluated top-to-bottom, first match wins):
 *  /                         → DashboardPage
 *  /auctions/new             → AuctionFormPage (create)
 *  /auctions/:id/edit        → AuctionFormPage (edit, id extracted)
 *  /auctions/browse          → AuctionBrowsePage
 *  /auctions/my-bids         → MyBidsPage
 *  /auctions/wallet          → WalletPage
 *  /auctions/:id             → AuctionDetailPage (id extracted)
 *  /auctions                 → AuctionListPage
 *  /catalog/new              → CatalogItemFormPage (create)
 *  /catalog/:id/edit         → CatalogItemFormPage (edit, id extracted)
 *  /catalog/browse           → CatalogBrowsePage
 *  /catalog/moderation       → ModerationQueuePage
 *  /catalog                  → CatalogManagementPage
 *  /publishing/new           → PublicationFormPage (create)
 *  /publishing/:id/edit      → PublicationFormPage (edit)
 *  /publishing/:id/review    → ReviewDetailPage
 *  /publishing/queue         → ReviewQueuePage
 *  /publishing/feed          → PublicationFeedPage
 *  /publishing               → PublicationListPage
 *  /documents/new            → DocumentFormPage (create)
 *  /documents/:id/edit       → DocumentFormPage (edit)
 *  /documents/:id/review     → DocumentDetailPage
 *  /documents/:id            → DocumentDetailPage
 *  /documents                → DocumentListPage
 *  /notifications            → NotificationCenterPage
 *  /outbound-queue           → OutboundQueuePage
 *  /admin/users              → UserManagementPage
 *  /admin/settings           → SystemSettingsPage
 *  /admin/sensitive-words    → SensitiveWordListPage
 *  /admin/audit-log          → AuditLogPage
 *  /admin/export             → DataExportPage
 */

import { lazy, Suspense } from 'react'
import { Loader2, ShieldX } from 'lucide-react'
import { useTabStore } from '@/store/tabStore'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, type Permission } from '@/auth/permissions'

// ── Lazy page imports ──────────────────────────────────────────────────────────

const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const AuctionListPage = lazy(() =>
  import('@/pages/auction/AuctionListPage').then((m) => ({ default: m.AuctionListPage })),
)
const AuctionFormPage = lazy(() =>
  import('@/pages/auction/AuctionFormPage').then((m) => ({ default: m.AuctionFormPage })),
)
const AuctionDetailPage = lazy(() =>
  import('@/pages/auction/AuctionDetailPage').then((m) => ({ default: m.AuctionDetailPage })),
)
const AuctionBrowsePage = lazy(() =>
  import('@/pages/auction/AuctionBrowsePage').then((m) => ({ default: m.AuctionBrowsePage })),
)
const WalletPage = lazy(() =>
  import('@/pages/auction/WalletPage').then((m) => ({ default: m.WalletPage })),
)
const MyBidsPage = lazy(() =>
  import('@/pages/auction/MyBidsPage').then((m) => ({ default: m.MyBidsPage })),
)
const CatalogManagementPage = lazy(() =>
  import('@/pages/catalog/CatalogManagementPage').then((m) => ({
    default: m.CatalogManagementPage,
  })),
)
const CatalogItemFormPage = lazy(() =>
  import('@/pages/catalog/CatalogItemFormPage').then((m) => ({ default: m.CatalogItemFormPage })),
)
const CatalogBrowsePage = lazy(() =>
  import('@/pages/catalog/CatalogBrowsePage').then((m) => ({ default: m.CatalogBrowsePage })),
)
const ModerationQueuePage = lazy(() =>
  import('@/pages/catalog/ModerationQueuePage').then((m) => ({ default: m.ModerationQueuePage })),
)
const PublicationListPage = lazy(() =>
  import('@/pages/publishing/PublicationListPage').then((m) => ({
    default: m.PublicationListPage,
  })),
)
const PublicationFormPage = lazy(() =>
  import('@/pages/publishing/PublicationFormPage').then((m) => ({
    default: m.PublicationFormPage,
  })),
)
const ReviewQueuePage = lazy(() =>
  import('@/pages/publishing/ReviewQueuePage').then((m) => ({ default: m.ReviewQueuePage })),
)
const ReviewDetailPage = lazy(() =>
  import('@/pages/publishing/ReviewDetailPage').then((m) => ({ default: m.ReviewDetailPage })),
)
const PublicationFeedPage = lazy(() =>
  import('@/pages/publishing/PublicationFeedPage').then((m) => ({
    default: m.PublicationFeedPage,
  })),
)
const DocumentListPage = lazy(() =>
  import('@/pages/documents/DocumentListPage').then((m) => ({ default: m.DocumentListPage })),
)
const DocumentFormPage = lazy(() =>
  import('@/pages/documents/DocumentFormPage').then((m) => ({ default: m.DocumentFormPage })),
)
const DocumentDetailPage = lazy(() =>
  import('@/pages/documents/DocumentDetailPage').then((m) => ({ default: m.DocumentDetailPage })),
)
const NotificationCenterPage = lazy(() =>
  import('@/pages/notifications/NotificationCenterPage').then((m) => ({
    default: m.NotificationCenterPage,
  })),
)
const OutboundQueuePage = lazy(() =>
  import('@/pages/notifications/OutboundQueuePage').then((m) => ({
    default: m.OutboundQueuePage,
  })),
)
const UserManagementPage = lazy(() =>
  import('@/pages/admin/UserManagementPage').then((m) => ({ default: m.UserManagementPage })),
)
const SystemSettingsPage = lazy(() =>
  import('@/pages/admin/SystemSettingsPage').then((m) => ({ default: m.SystemSettingsPage })),
)
const SensitiveWordListPage = lazy(() =>
  import('@/pages/admin/SensitiveWordListPage').then((m) => ({
    default: m.SensitiveWordListPage,
  })),
)
const AuditLogPage = lazy(() =>
  import('@/pages/admin/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
)
const DataExportPage = lazy(() =>
  import('@/pages/admin/DataExportPage').then((m) => ({ default: m.DataExportPage })),
)

// ── Loading fallback ───────────────────────────────────────────────────────────

function PageLoader() {
  return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
    </div>
  )
}

// ── Permission guard ───────────────────────────────────────────────────────────

/**
 * Renders children only when the authenticated user holds `permission`.
 * Otherwise shows an access-denied message. This enforces the permission
 * matrix at the page level, preventing tab-system bypass via DevTools.
 */
function PermissionGuard({
  permission,
  children,
}: {
  permission: Permission
  children: React.ReactNode
}) {
  const currentUser = useAuthStore((s) => s.currentUser)
  if (!currentUser || !hasPermission(currentUser.role, permission)) {
    return (
      <div className="p-12 flex flex-col items-center gap-4 text-center">
        <ShieldX className="w-12 h-12 text-red-500/50" />
        <p className="text-surface-300 text-base font-semibold">Access Denied</p>
        <p className="text-surface-500 text-sm">
          You don&apos;t have permission to view this page.
        </p>
      </div>
    )
  }
  return <>{children}</>
}

// ── Route matching ─────────────────────────────────────────────────────────────

function matchRoute(path: string): React.ReactNode {
  if (path === '/') return <DashboardPage />

  // /auctions/new
  if (path === '/auctions/new') return <AuctionFormPage />

  // /auctions/:id/edit
  const auctionEditMatch = /^\/auctions\/([^/]+)\/edit$/.exec(path)
  if (auctionEditMatch) {
    const [, id] = auctionEditMatch
    return <AuctionFormPage editId={id} tabId={id} />
  }

  // /auctions/browse
  if (path === '/auctions/browse') return <AuctionBrowsePage />

  // /auctions/my-bids
  if (path === '/auctions/my-bids') return <MyBidsPage />

  // /auctions/wallet
  if (path === '/auctions/wallet') return <WalletPage />

  // /auctions/:id (detail)
  const detailMatch = /^\/auctions\/([^/]+)$/.exec(path)
  if (detailMatch) {
    const [, id] = detailMatch
    return <AuctionDetailPage auctionId={id} />
  }

  // /auctions (list)
  if (path === '/auctions') return <AuctionListPage />

  // /catalog/new
  if (path === '/catalog/new') return <CatalogItemFormPage />

  // /catalog/:id/edit
  const catalogEditMatch = /^\/catalog\/([^/]+)\/edit$/.exec(path)
  if (catalogEditMatch) {
    const [, id] = catalogEditMatch
    return <CatalogItemFormPage editId={id} tabId={id} />
  }

  // /catalog/browse
  if (path === '/catalog/browse') return <CatalogBrowsePage />

  // /catalog/moderation
  if (path === '/catalog/moderation') return <ModerationQueuePage />

  // /catalog (management)
  if (path === '/catalog') return <CatalogManagementPage />

  // /publishing/new
  if (path === '/publishing/new') return <PublicationFormPage />

  // /publishing/:id/edit
  const pubEditMatch = /^\/publishing\/([^/]+)\/edit$/.exec(path)
  if (pubEditMatch) {
    const [, id] = pubEditMatch
    return <PublicationFormPage editId={id} tabId={id} />
  }

  // /publishing/:id/review
  const pubReviewMatch = /^\/publishing\/([^/]+)\/review$/.exec(path)
  if (pubReviewMatch) {
    const [, id] = pubReviewMatch
    return <ReviewDetailPage publicationId={id} />
  }

  // /publishing/queue
  if (path === '/publishing/queue') return <ReviewQueuePage />

  // /publishing/feed
  if (path === '/publishing/feed') return <PublicationFeedPage />

  // /publishing (list)
  if (path === '/publishing') return <PublicationListPage />

  // /documents/new
  if (path === '/documents/new') return <DocumentFormPage />

  // /documents/:id/edit
  const docEditMatch = /^\/documents\/([^/]+)\/edit$/.exec(path)
  if (docEditMatch) {
    const [, id] = docEditMatch
    return <DocumentFormPage editId={id} tabId={id} />
  }

  // /documents/:id/review  (same detail page, reviewer sees actions based on role)
  const docReviewMatch = /^\/documents\/([^/]+)\/review$/.exec(path)
  if (docReviewMatch) {
    const [, id] = docReviewMatch
    return <DocumentDetailPage documentId={id} />
  }

  // /documents/:id
  const docDetailMatch = /^\/documents\/([^/]+)$/.exec(path)
  if (docDetailMatch) {
    const [, id] = docDetailMatch
    return <DocumentDetailPage documentId={id} />
  }

  // /documents (list)
  if (path === '/documents') return <DocumentListPage />

  // /notifications
  if (path === '/notifications')
    return (
      <PermissionGuard permission="viewMessages">
        <NotificationCenterPage />
      </PermissionGuard>
    )

  // /outbound-queue
  if (path === '/outbound-queue')
    return (
      <PermissionGuard permission="manageMessages">
        <OutboundQueuePage />
      </PermissionGuard>
    )

  // /admin/users
  if (path === '/admin/users')
    return (
      <PermissionGuard permission="manageUsers">
        <UserManagementPage />
      </PermissionGuard>
    )

  // /admin/settings
  if (path === '/admin/settings')
    return (
      <PermissionGuard permission="manageSystem">
        <SystemSettingsPage />
      </PermissionGuard>
    )

  // /admin/sensitive-words
  if (path === '/admin/sensitive-words')
    return (
      <PermissionGuard permission="manageSystem">
        <SensitiveWordListPage />
      </PermissionGuard>
    )

  // /admin/audit-log
  if (path === '/admin/audit-log')
    return (
      <PermissionGuard permission="viewAuditLog">
        <AuditLogPage />
      </PermissionGuard>
    )

  // /admin/export
  if (path === '/admin/export')
    return (
      <PermissionGuard permission="manageSystem">
        <DataExportPage />
      </PermissionGuard>
    )

  // Fallback
  return (
    <div className="p-8 text-surface-500 text-sm">
      Page not found: <code className="text-surface-400">{path}</code>
    </div>
  )
}

export function TabContent() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)

  return (
    <div className="flex-1">
      {tabs.map((tab) => (
        <div key={tab.id} className={tab.id === activeTabId ? 'block' : 'hidden'} role="tabpanel">
          <Suspense fallback={<PageLoader />}>{matchRoute(tab.path)}</Suspense>
        </div>
      ))}
    </div>
  )
}
