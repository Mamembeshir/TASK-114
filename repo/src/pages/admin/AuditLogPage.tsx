/**
 * AuditLogPage — append-only audit log viewer with filters and CSV export.
 * Admin only.
 */

import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { db } from '@/db'
import { Button, Card, EmptyState, Table } from '@/components/ui'
import type { ColumnDef } from '@/components/ui'
import type { AuditLog, AuditEventType } from '@/types'
import { ScrollText } from 'lucide-react'

// ── CSV export ─────────────────────────────────────────────────────────────────

function toCsv(logs: AuditLog[]): string {
  const headers = [
    'id',
    'eventType',
    'actorId',
    'actorName',
    'entityType',
    'entityId',
    'description',
    'createdAt',
  ]
  const escape = (v: string | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
  const rows = logs.map((l) =>
    [
      escape(l.id),
      escape(l.eventType),
      escape(l.actorId),
      escape(l.actorName),
      escape(l.entityType),
      escape(l.entityId),
      escape(l.description),
      escape(new Date(l.createdAt).toISOString()),
    ].join(','),
  )
  return [headers.join(','), ...rows].join('\n')
}

function downloadCsv(logs: AuditLog[]): void {
  const blob = new Blob([toCsv(logs)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-log-${String(Date.now())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Page ───────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

export function AuditLogPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  // Filters
  const [actorFilter, setActorFilter] = useState('')
  const [entityTypeFilter, setEntityTypeFilter] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    const query = db.auditLogs.orderBy('createdAt').reverse()

    const all = await query.toArray()
    const filtered = all.filter((l) => {
      if (actorFilter && !l.actorName.toLowerCase().includes(actorFilter.toLowerCase()))
        return false
      if (entityTypeFilter && l.entityType !== entityTypeFilter) return false
      if (eventTypeFilter && !l.eventType.startsWith(eventTypeFilter)) return false
      return true
    })
    setTotal(filtered.length)
    setLogs(filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE))
    setIsLoading(false)
  }, [actorFilter, entityTypeFilter, eventTypeFilter, page])

  useEffect(() => {
    void load()
  }, [load])

  // Reset page when filters change
  useEffect(() => {
    setPage(0)
  }, [actorFilter, entityTypeFilter, eventTypeFilter])

  if (!currentUser) return null

  const allLogs = async (): Promise<AuditLog[]> => {
    return db.auditLogs.orderBy('createdAt').reverse().toArray()
  }

  const handleExport = async () => {
    const all = await allLogs()
    downloadCsv(all)
  }

  const ENTITY_TYPES = [
    '',
    'User',
    'Auction',
    'CatalogItem',
    'Publication',
    'Document',
    'SystemConfig',
    'SensitiveWord',
    'Wallet',
  ]
  const EVENT_PREFIXES: (AuditEventType | '')[] = [
    '',
    'user.',
    'auction.',
    'document.',
    'publication.',
    'catalog.',
    'system.',
    'wallet.',
    'bid.',
  ] as (AuditEventType | '')[]

  const columns: ColumnDef<AuditLog>[] = [
    {
      key: 'time',
      header: 'Time',
      width: 'w-40',
      cell: (l) => (
        <span className="text-xs text-surface-500 font-mono">
          {new Date(l.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'event',
      header: 'Event',
      width: 'w-56',
      cell: (l) => <span className="text-xs font-mono text-primary-400">{l.eventType}</span>,
    },
    {
      key: 'actor',
      header: 'Actor',
      width: 'w-36',
      cell: (l) => (
        <div>
          <p className="text-sm text-surface-200">{l.actorName}</p>
          <p className="text-xs text-surface-600 font-mono">{l.actorId.slice(-8)}</p>
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      width: 'w-32',
      cell: (l) => (
        <div>
          <p className="text-xs text-surface-400">{l.entityType}</p>
          <p className="text-xs text-surface-600 font-mono">{l.entityId.slice(-8)}</p>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      cell: (l) => <span className="text-xs text-surface-400">{l.description}</span>,
    },
  ]

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-surface-100">Audit Log</h1>
          <p className="text-sm text-surface-500 mt-0.5">
            {total.toLocaleString()} events — append-only, immutable
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void handleExport()}>
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500 w-48"
          placeholder="Filter by actor…"
          value={actorFilter}
          onChange={(e) => {
            setActorFilter(e.target.value)
          }}
        />
        <select
          className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-primary-500"
          value={entityTypeFilter}
          onChange={(e) => {
            setEntityTypeFilter(e.target.value)
          }}
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t || 'All entity types'}
            </option>
          ))}
        </select>
        <select
          className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-primary-500"
          value={eventTypeFilter}
          onChange={(e) => {
            setEventTypeFilter(e.target.value)
          }}
        >
          {EVENT_PREFIXES.map((p) => (
            <option key={p} value={p}>
              {p || 'All event types'}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <Card padded={false}>
        {logs.length === 0 && !isLoading ? (
          <EmptyState
            icon={ScrollText}
            title="No audit events"
            description="Nothing matches your filters."
          />
        ) : (
          <Table columns={columns} data={logs} rowKey={(l) => l.id} isLoading={isLoading} />
        )}
      </Card>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-surface-400">
          <span>
            {String(page * PAGE_SIZE + 1)}–{String(Math.min((page + 1) * PAGE_SIZE, total))} of{' '}
            {total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPage((p) => Math.max(0, p - 1))
              }}
              disabled={page === 0}
            >
              ← Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPage((p) => p + 1)
              }}
              disabled={(page + 1) * PAGE_SIZE >= total}
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
