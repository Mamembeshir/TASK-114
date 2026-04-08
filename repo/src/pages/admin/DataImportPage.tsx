/**
 * DataImportPage — restore a full-backup JSON file produced by DataExportPage.
 *
 * Security:
 *  - Guarded by requirePermission('manageSystem') at service level and
 *    PermissionGuard in TabContent (Admin only).
 *  - Every import is recorded in the append-only audit log.
 *
 * Behaviour:
 *  - Validates that the uploaded file matches the expected export envelope.
 *  - For each table, the operator chooses "skip" (default) or "overwrite" for
 *    conflicting records (same primary key already exists in IndexedDB).
 *  - auditLogs table is always skipped — it is append-only; we only add any
 *    audit rows from the backup that don't already exist (same id check).
 *  - sessions table is never imported (contains auth tokens).
 *  - User rows: existing users are never overwritten (credentials must not be
 *    clobbered). New user rows are only inserted when the backup row contains
 *    both passwordHash and passwordSalt — rows without credentials are skipped
 *    to prevent non-operable (unloggable) accounts being created.
 */

import { useRef, useState } from 'react'
import { Upload, AlertTriangle, CheckCircle, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { Button, Card, CardHeader } from '@/components/ui'
import { unwrapAppKey } from '@/crypto/appKey'
import {
  runImport,
  isValidBackup,
  SKIP_ALWAYS,
} from '@/services/importService'
import type { ConflictStrategy, ParsedBackup, ImportResult } from '@/services/importService'

export function DataImportPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const fileRef = useRef<HTMLInputElement>(null)

  const [backup, setBackup] = useState<ParsedBackup | null>(null)
  const [wrappedAppKey, setWrappedAppKey] = useState<string | null>(null)
  const [importPassphrase, setImportPassphrase] = useState('')
  const [keyRestored, setKeyRestored] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [strategy, setStrategy] = useState<ConflictStrategy>('skip')
  const [isImporting, setIsImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)

  if (!currentUser) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setParseError('')
    setBackup(null)
    setResults(null)
    setWrappedAppKey(null)
    setKeyRestored(false)
    setImportPassphrase('')
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed: unknown = JSON.parse(ev.target?.result as string)
        if (!isValidBackup(parsed)) {
          setParseError(
            'Invalid backup file. Expected a Meridian export JSON with { exportedAt, data: { ... } }.',
          )
          return
        }
        setBackup(parsed)
        // Detect wrapped encryption key in the backup envelope
        const envelope = parsed as unknown as Record<string, unknown>
        if (typeof envelope._wrappedAppKey === 'string') {
          setWrappedAppKey(envelope._wrappedAppKey)
        }
      } catch {
        setParseError('Failed to parse JSON. Make sure the file is a valid Meridian export.')
      }
    }
    reader.readAsText(file)
  }

  const handleRestoreKey = async () => {
    if (!wrappedAppKey) return
    try {
      await unwrapAppKey(wrappedAppKey, importPassphrase)
      setKeyRestored(true)
      toast.success('Encryption key restored — encrypted data will be readable after import')
    } catch {
      toast.error('Failed to restore encryption key — check your passphrase')
    }
  }

  const handleImport = async () => {
    if (!backup) return
    // If backup has a wrapped key that hasn't been restored yet, warn the user
    if (wrappedAppKey && !keyRestored) {
      toast.error('Restore the encryption key first, or encrypted data will be unreadable')
      return
    }
    setIsImporting(true)
    setResults(null)
    try {
      const res = await runImport(
        backup,
        strategy,
      )
      setResults(res)
      const total = res.reduce((s, r) => s + r.inserted + r.overwritten, 0)
      toast.success(`Import complete — ${total.toLocaleString()} records written`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsImporting(false)
    }
  }

  const tableCount = backup
    ? Object.values(backup.data).reduce((s, arr) => s + arr.length, 0)
    : 0

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">Data Import / Restore</h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Restore data from a Meridian JSON backup. Sessions are never imported. User accounts
          are only restored when the backup contains hashed credentials (Full Export); rows
          without credentials are skipped to prevent non-operable accounts.
        </p>
      </div>

      {/* File picker */}
      <Card>
        <CardHeader
          title="Select Backup File"
          description="Upload a .json file exported from the Data Export page."
        />
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-surface-700 rounded-lg py-8 text-surface-500 hover:border-primary-600 hover:text-primary-400 transition-colors"
          >
            <Upload className="w-6 h-6" />
            <span className="text-sm">
              {fileName ? fileName : 'Click to select a backup file'}
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileChange}
          />

          {parseError && (
            <div className="flex items-start gap-2 rounded-lg bg-danger-950/30 border border-danger-800/40 px-4 py-3 text-sm text-danger-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {parseError}
            </div>
          )}

          {backup && (
            <div className="rounded-lg bg-surface-800/50 px-4 py-3 text-sm space-y-1">
              <p className="text-surface-300 font-medium">Backup validated</p>
              <p className="text-surface-500">
                Exported at:{' '}
                <span className="text-surface-400">
                  {new Date(backup.exportedAt).toLocaleString()}
                </span>
              </p>
              <p className="text-surface-500">
                Module:{' '}
                <span className="text-surface-400">{backup.module ?? 'unknown'}</span>
              </p>
              <p className="text-surface-500">
                Total records:{' '}
                <span className="text-surface-400">{tableCount.toLocaleString()}</span>
              </p>
              <p className="text-surface-500">
                Tables:{' '}
                <span className="text-surface-400">
                  {Object.keys(backup.data)
                    .filter((t) => !SKIP_ALWAYS.has(t))
                    .join(', ')}
                </span>
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Encryption key restore — shown when backup contains a wrapped key */}
      {backup && wrappedAppKey && (
        <Card>
          <CardHeader
            title="Restore Encryption Key"
            description="This backup contains encrypted data with a passphrase-protected encryption key. Enter the passphrase used during export to restore the key before importing."
          />
          {keyRestored ? (
            <div className="flex items-center gap-2 text-success-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              Encryption key restored successfully.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
                <input
                  type="password"
                  value={importPassphrase}
                  onChange={(e) => { setImportPassphrase(e.target.value) }}
                  placeholder="Enter export passphrase…"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-surface-800 border border-surface-700 rounded-lg text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-primary-600"
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleRestoreKey()}
                disabled={!importPassphrase}
              >
                <Lock className="w-3.5 h-3.5 mr-1.5" />
                Restore Key
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Conflict strategy */}
      {backup && (
        <Card>
          <CardHeader
            title="Conflict Strategy"
            description="How to handle records whose ID already exists in the database."
          />
          <div className="space-y-2">
            {(['skip', 'overwrite'] as ConflictStrategy[]).map((s) => (
              <label
                key={s}
                className="flex items-start gap-3 cursor-pointer rounded-lg px-4 py-3 bg-surface-800/50 hover:bg-surface-800 transition-colors"
              >
                <input
                  type="radio"
                  name="strategy"
                  value={s}
                  checked={strategy === s}
                  onChange={() => { setStrategy(s) }}
                  className="mt-0.5 accent-primary-500"
                />
                <div>
                  <p className="text-sm font-medium text-surface-200 capitalize">{s}</p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {s === 'skip'
                      ? 'Existing records are left untouched. Only new records are inserted.'
                      : 'Existing records are replaced with the imported version. Use with caution.'}
                  </p>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-4">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleImport()}
              isLoading={isImporting}
              disabled={isImporting}
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Run Import
            </Button>
          </div>
        </Card>
      )}

      {/* Results */}
      {results && (
        <Card>
          <CardHeader
            title="Import Results"
            description="Per-table summary of the completed import."
          />
          <div className="flex items-center gap-2 mb-3 text-success-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            Import complete — audit log entry written.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-surface-400">
              <thead>
                <tr className="border-b border-surface-700 text-surface-500">
                  <th className="text-left pb-2 font-medium">Table</th>
                  <th className="text-right pb-2 font-medium">Inserted</th>
                  <th className="text-right pb-2 font-medium">Overwritten</th>
                  <th className="text-right pb-2 font-medium">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.table} className="border-b border-surface-800/50">
                    <td className="py-1.5 font-mono text-surface-300">{r.table}</td>
                    <td className="py-1.5 text-right text-success-400">{r.inserted}</td>
                    <td className="py-1.5 text-right text-warning-400">{r.overwritten}</td>
                    <td className="py-1.5 text-right">{r.skipped}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-surface-300 font-medium">
                  <td className="pt-2">Total</td>
                  <td className="pt-2 text-right text-success-400">
                    {results.reduce((s, r) => s + r.inserted, 0)}
                  </td>
                  <td className="pt-2 text-right text-warning-400">
                    {results.reduce((s, r) => s + r.overwritten, 0)}
                  </td>
                  <td className="pt-2 text-right">
                    {results.reduce((s, r) => s + r.skipped, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
