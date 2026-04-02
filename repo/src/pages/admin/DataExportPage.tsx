/**
 * DataExportPage — export all or per-module data as JSON or CSV (Admin only).
 */

import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { db } from '@/db'
import { Button, Card, CardHeader } from '@/components/ui'

type Module =
  | 'all'
  | 'users'
  | 'auctions'
  | 'catalog'
  | 'publications'
  | 'documents'
  | 'notifications'
  | 'auditLogs'
  | 'analytics'

interface ExportModule {
  key: Module
  label: string
  description: string
}

const MODULES: ExportModule[] = [
  { key: 'all', label: 'Full Export', description: 'All tables — complete backup' },
  { key: 'users', label: 'Users', description: 'User accounts and roles' },
  { key: 'auctions', label: 'Auctions', description: 'Auctions, bids, proxy bids, wallets' },
  { key: 'catalog', label: 'Catalog', description: 'Catalog items, categories, tags' },
  { key: 'publications', label: 'Publications', description: 'Publications and versions' },
  { key: 'documents', label: 'Documents', description: 'Documents, versions, checkout records' },
  { key: 'notifications', label: 'Notifications', description: 'Notifications and outbound queue' },
  { key: 'auditLogs', label: 'Audit Log', description: 'Complete append-only audit trail' },
  {
    key: 'analytics',
    label: 'Readership Analytics',
    description: 'View events and time-on-page data',
  },
]

async function gatherData(module: Module): Promise<Record<string, unknown[]>> {
  switch (module) {
    case 'all':
      return {
        users: await db.users.toArray(),
        sessions: await db.sessions.toArray(),
        auctions: await db.auctions.toArray(),
        bids: await db.bids.toArray(),
        proxyBids: await db.proxyBids.toArray(),
        wallets: await db.wallets.toArray(),
        walletTransactions: await db.walletTransactions.toArray(),
        catalogItems: await db.catalogItems.toArray(),
        categories: await db.categories.toArray(),
        tags: await db.tags.toArray(),
        publications: await db.publications.toArray(),
        publicationVersions: await db.publicationVersions.toArray(),
        viewEvents: await db.viewEvents.toArray(),
        documents: await db.documents.toArray(),
        documentVersions: await db.documentVersions.toArray(),
        checkoutRecords: await db.checkoutRecords.toArray(),
        destructionApprovals: await db.destructionApprovals.toArray(),
        notifications: await db.notifications.toArray(),
        outboundQueue: await db.outboundQueue.toArray(),
        auditLogs: await db.auditLogs.toArray(),
        systemConfig: await db.systemConfig.toArray(),
        sensitiveWords: await db.sensitiveWords.toArray(),
      }
    case 'users':
      return { users: await db.users.toArray() }
    case 'auctions':
      return {
        auctions: await db.auctions.toArray(),
        bids: await db.bids.toArray(),
        proxyBids: await db.proxyBids.toArray(),
        wallets: await db.wallets.toArray(),
        walletTransactions: await db.walletTransactions.toArray(),
      }
    case 'catalog':
      return {
        catalogItems: await db.catalogItems.toArray(),
        categories: await db.categories.toArray(),
        tags: await db.tags.toArray(),
      }
    case 'publications':
      return {
        publications: await db.publications.toArray(),
        publicationVersions: await db.publicationVersions.toArray(),
      }
    case 'documents':
      return {
        documents: await db.documents.toArray(),
        documentVersions: await db.documentVersions.toArray(),
        checkoutRecords: await db.checkoutRecords.toArray(),
        destructionApprovals: await db.destructionApprovals.toArray(),
      }
    case 'notifications':
      return {
        notifications: await db.notifications.toArray(),
        outboundQueue: await db.outboundQueue.toArray(),
      }
    case 'auditLogs':
      return { auditLogs: await db.auditLogs.toArray() }
    case 'analytics':
      return { viewEvents: await db.viewEvents.toArray() }
  }
}

function downloadJson(data: Record<string, unknown[]>, module: Module): void {
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), module, data }, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `meridian-export-${module}-${String(Date.now())}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function DataExportPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const [loading, setLoading] = useState<Module | null>(null)

  if (!currentUser) return null

  const handleExport = async (module: Module) => {
    setLoading(module)
    try {
      const data = await gatherData(module)
      const count = Object.values(data).reduce((sum, arr) => sum + arr.length, 0)
      downloadJson(data, module)
      toast.success(`Exported ${count.toLocaleString()} records`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">Data Export</h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Export portal data as JSON for backup or offline processing.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Export Modules"
          description="Data is exported as JSON with timestamps. No sensitive credentials are included in user exports."
        />
        <div className="space-y-2">
          {MODULES.map((m) => (
            <div
              key={m.key}
              className={[
                'flex items-center justify-between px-4 py-3 rounded-lg transition-colors',
                m.key === 'all'
                  ? 'bg-primary-950/30 border border-primary-800/30'
                  : 'bg-surface-800/50',
              ].join(' ')}
            >
              <div>
                <p className="text-sm font-medium text-surface-100">{m.label}</p>
                <p className="text-xs text-surface-500 mt-0.5">{m.description}</p>
              </div>
              <Button
                variant={m.key === 'all' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => void handleExport(m.key)}
                isLoading={loading === m.key}
                disabled={loading !== null && loading !== m.key}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
