/**
 * TabContent — renders the correct page component for the currently active tab.
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
 *  /catalog                  → CatalogManagementPage
 */

import { useTabStore } from '@/store/tabStore'
import { DashboardPage } from '@/pages/DashboardPage'
import { AuctionListPage } from '@/pages/auction/AuctionListPage'
import { AuctionFormPage } from '@/pages/auction/AuctionFormPage'
import { AuctionDetailPage } from '@/pages/auction/AuctionDetailPage'
import { AuctionBrowsePage } from '@/pages/auction/AuctionBrowsePage'
import { WalletPage } from '@/pages/auction/WalletPage'
import { MyBidsPage } from '@/pages/auction/MyBidsPage'
import { CatalogManagementPage } from '@/pages/catalog/CatalogManagementPage'
import { CatalogItemFormPage } from '@/pages/catalog/CatalogItemFormPage'
import { CatalogBrowsePage } from '@/pages/catalog/CatalogBrowsePage'

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

  // /catalog (management)
  if (path === '/catalog') return <CatalogManagementPage />

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
          {matchRoute(tab.path)}
        </div>
      ))}
    </div>
  )
}
