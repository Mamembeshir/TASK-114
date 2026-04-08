/**
 * DataExportPage — export all or per-module data as JSON or CSV (Admin only).
 */

import { useState } from 'react'
import { Download, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { db } from '@/db'
import { IMPORTABLE_TABLES } from '@/services/importService'
import { wrapAppKey } from '@/crypto/appKey'
import { Button, Card, CardHeader } from '@/components/ui'
import type { User } from '@/types'

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

/** Modules whose exported rows contain encrypted (ciphertext) fields. */
const ENCRYPTED_MODULES: ReadonlySet<Module> = new Set<Module>(['all', 'documents', 'auctions'])

interface ExportModule {
  key: Module
  label: string
  description: string
}

const MODULES: ExportModule[] = [
  { key: 'all', label: 'Full Export', description: 'All tables — complete backup (includes hashed credentials; store securely)' },
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

function sanitizeUser(user: User): Record<string, unknown> {
  const { passwordHash: _h, passwordSalt: _s, ...safe } = user
  return safe
}

async function gatherData(module: Module): Promise<Record<string, unknown[]>> {
  switch (module) {
    case 'all': {
      // Full backup: enumerate all importable domain tables from the central
      // IMPORTABLE_TABLES list so export and import stay synchronized.
      // Sessions are excluded (auth tokens must not leave the system).
      // Documents/documentVersions are exported as raw ciphertext rows.
      const data: Record<string, unknown[]> = {}
      for (const tableName of IMPORTABLE_TABLES) {
        const table = (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[tableName]
        if (table) data[tableName] = await table.toArray()
      }
      return data
    }
    case 'users':
      return { users: (await db.users.toArray()).map(sanitizeUser) }
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
        // Raw StoredDocument / StoredDocumentVersion rows (ciphertext) — see note above.
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

type ExportFormat = 'json' | 'csv'

function downloadJson(data: Record<string, unknown[]>, module: Module, wrappedAppKey?: string): void {
  const envelope: Record<string, unknown> = { exportedAt: new Date().toISOString(), module, data }
  if (wrappedAppKey) envelope._wrappedAppKey = wrappedAppKey
  const payload = JSON.stringify(envelope, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  triggerDownload(blob, `meridian-export-${module}-${String(Date.now())}.json`)
}

function downloadCsv(data: Record<string, unknown[]>, module: Module): void {
  const sheets = Object.entries(data)
  // For multi-table exports, concatenate sheets with a header separator
  const parts: string[] = []
  for (const [tableName, rows] of sheets) {
    if (rows.length === 0) continue
    // Collect all unique keys across rows as column headers
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r as Record<string, unknown>)))]
    const header = cols.map(escapeCsvField).join(',')
    const body = rows
      .map((row) => {
        const rec = row as Record<string, unknown>
        return cols.map((col) => escapeCsvField(formatCsvValue(rec[col]))).join(',')
      })
      .join('\n')
    if (sheets.length > 1) {
      parts.push(`# ${tableName}\n${header}\n${body}`)
    } else {
      parts.push(`${header}\n${body}`)
    }
  }
  const blob = new Blob([parts.join('\n\n')], { type: 'text/csv' })
  triggerDownload(blob, `meridian-export-${module}-${String(Date.now())}.csv`)
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function DataExportPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const [loading, setLoading] = useState<Module | null>(null)
  const [format, setFormat] = useState<ExportFormat>('json')
  const [passphrase, setPassphrase] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')

  if (!currentUser) return null

  const handleExport = async (module: Module) => {
    const hasEncryptedData = ENCRYPTED_MODULES.has(module)
    // For JSON exports containing encrypted data, require a passphrase to wrap the encryption key
    if (hasEncryptedData && format === 'json') {
      if (!passphrase || passphrase.length < 8) {
        toast.error('Enter a passphrase (min 8 characters) to protect the encryption key')
        return
      }
      if (passphrase !== passphraseConfirm) {
        toast.error('Passphrases do not match')
        return
      }
    }
    // CSV exports of encrypted modules warn about non-portability
    if (hasEncryptedData && format === 'csv') {
      toast.warning('CSV exports of encrypted data are not portable — encrypted fields are exported as raw ciphertext. Use JSON format with a passphrase for portable backups.')
    }
    setLoading(module)
    try {
      const data = await gatherData(module)
      const count = Object.values(data).reduce((sum, arr) => sum + arr.length, 0)
      if (format === 'csv') {
        downloadCsv(data, module)
      } else {
        // Wrap encryption key for exports with encrypted data so they are portable
        let wrappedKey: string | undefined
        if (hasEncryptedData && passphrase) {
          wrappedKey = await wrapAppKey(passphrase)
        }
        downloadJson(data, module, wrappedKey)
      }
      toast.success(`Exported ${count.toLocaleString()} records as ${format.toUpperCase()}`)
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
          Export portal data as JSON or CSV for backup or offline processing.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-surface-500">Format:</span>
        <div className="flex rounded-lg bg-surface-800 p-1 gap-1">
          {(['json', 'csv'] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFormat(f) }}
              className={[
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                format === f
                  ? 'bg-surface-700 text-surface-100'
                  : 'text-surface-500 hover:text-surface-300',
              ].join(' ')}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Passphrase for JSON exports containing encrypted data */}
      {format === 'json' && (
        <Card>
          <CardHeader
            title="Encryption Key Passphrase"
            description="Exports containing Documents or Auctions (wallets) include encrypted data. Enter a passphrase to wrap the encryption key so backups are portable across devices. Required for Full Export, Documents, and Auctions modules."
          />
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-surface-500 mb-1">Passphrase (min 8 characters)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => { setPassphrase(e.target.value) }}
                  placeholder="Enter passphrase…"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-surface-800 border border-surface-700 rounded-lg text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-primary-600"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-surface-500 mb-1">Confirm passphrase</label>
              <input
                type="password"
                value={passphraseConfirm}
                onChange={(e) => { setPassphraseConfirm(e.target.value) }}
                placeholder="Re-enter passphrase…"
                className="w-full px-3 py-2 text-sm bg-surface-800 border border-surface-700 rounded-lg text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-primary-600"
              />
            </div>
            {passphrase.length > 0 && passphrase.length < 8 && (
              <p className="text-xs text-warning-400">Passphrase must be at least 8 characters.</p>
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Export Modules"
          description="Full Export includes PBKDF2 password hashes for faithful backup/restore — store that file securely. Module-specific exports (e.g. Users only) strip credentials. Session tokens are never exported."
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
