/**
 * ReadershipsAnalyticsPage — aggregated readership analytics for all publications.
 *
 * Aggregates the raw `viewEvents` table recorded by PublicationFeedPage into:
 *  - Unique reader count (distinct userIds per publication)
 *  - Total view count
 *  - Average time-on-page (mean durationSeconds across sessions that have a close event)
 *
 * Evidence: src/pages/publishing/PublicationFeedPage.tsx:66
 *           src/pages/admin/DataExportPage.tsx:39,120
 *           SPEC §9 — Readership Analytics (Offline)
 */

import { useEffect, useMemo, useState } from 'react'
import { BarChart2, Clock, Eye, Users } from 'lucide-react'
import { db } from '@/db'
import { EmptyState, Skeleton } from '@/components/ui'
import type { Publication, ViewEvent } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PublicationStats {
  publication: Publication
  uniqueReaders: number
  totalViews: number
  avgDurationSeconds: number | null
}

type SortKey = 'title' | 'uniqueReaders' | 'totalViews' | 'avgDuration'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${String(m)}m ${String(s)}s`
}

function aggregateEvents(pubs: Publication[], events: ViewEvent[]): PublicationStats[] {
  // Group events by entityId
  const byPub = new Map<string, ViewEvent[]>()
  for (const ev of events) {
    if (ev.entityType !== 'Publication') continue
    const list = byPub.get(ev.entityId) ?? []
    list.push(ev)
    byPub.set(ev.entityId, list)
  }

  return pubs.map((pub) => {
    const evs = byPub.get(pub.id) ?? []
    const uniqueReaders = new Set(evs.map((e) => e.userId)).size
    const totalViews = evs.length
    const timed = evs.filter((e) => typeof e.durationSeconds === 'number' && e.durationSeconds > 0)
    const avgDurationSeconds =
      timed.length > 0
        ? timed.reduce((sum, e) => sum + (e.durationSeconds ?? 0), 0) / timed.length
        : null
    return { publication: pub, uniqueReaders, totalViews, avgDurationSeconds }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReadershipsAnalyticsPage() {
  const [stats, setStats] = useState<PublicationStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('totalViews')
  const [sortDesc, setSortDesc] = useState(true)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      const [pubs, events] = await Promise.all([
        db.publications.where('status').equals('Published').toArray(),
        db.viewEvents.toArray(),
      ])
      setStats(aggregateEvents(pubs, events))
      setIsLoading(false)
    }
    void load()
  }, [])

  const sorted = useMemo(() => {
    const copy = [...stats]
    copy.sort((a, b) => {
      let diff = 0
      switch (sortKey) {
        case 'title':
          diff = a.publication.title.localeCompare(b.publication.title)
          break
        case 'uniqueReaders':
          diff = a.uniqueReaders - b.uniqueReaders
          break
        case 'totalViews':
          diff = a.totalViews - b.totalViews
          break
        case 'avgDuration':
          diff = (a.avgDurationSeconds ?? -1) - (b.avgDurationSeconds ?? -1)
          break
      }
      return sortDesc ? -diff : diff
    })
    return copy
  }, [stats, sortKey, sortDesc])

  // Summary totals
  const totalUniqueReaders = useMemo(() => {
    return new Set(stats.flatMap((s) => Array(s.uniqueReaders))).size
  }, [stats])

  const totalViews = useMemo(() => stats.reduce((s, r) => s + r.totalViews, 0), [stats])

  const overallAvgDuration = useMemo(() => {
    const withTime = stats.filter((s) => s.avgDurationSeconds !== null)
    if (withTime.length === 0) return null
    return withTime.reduce((s, r) => s + (r.avgDurationSeconds ?? 0), 0) / withTime.length
  }, [stats])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d)
    else { setSortKey(key); setSortDesc(true) }
  }

  const SortIndicator = ({ col }: { col: SortKey }) => (
    <span className="ml-1 text-surface-600">
      {sortKey === col ? (sortDesc ? '▼' : '▲') : '⇅'}
    </span>
  )

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">Readership Analytics</h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Aggregated view statistics for all published publications.
        </p>
      </div>

      {/* Summary cards */}
      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface-900 border border-surface-800 rounded-xl p-4 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary-600/10">
              <Eye className="w-4 h-4 text-primary-400" />
            </div>
            <div>
              <p className="text-xs text-surface-500 font-medium">Total Views</p>
              <p className="text-2xl font-bold text-surface-100 mt-0.5">{String(totalViews)}</p>
            </div>
          </div>

          <div className="bg-surface-900 border border-surface-800 rounded-xl p-4 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-green-600/10">
              <Users className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-surface-500 font-medium">Publications Reached</p>
              <p className="text-2xl font-bold text-surface-100 mt-0.5">
                {String(stats.filter((s) => s.totalViews > 0).length)}
              </p>
            </div>
          </div>

          <div className="bg-surface-900 border border-surface-800 rounded-xl p-4 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-600/10">
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-surface-500 font-medium">Avg Time-on-Page</p>
              <p className="text-2xl font-bold text-surface-100 mt-0.5">
                {overallAvgDuration !== null ? formatDuration(overallAvgDuration) : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Per-publication table */}
      <div className="bg-surface-900 border border-surface-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={BarChart2}
            title="No data yet"
            description="Readership data appears once published publications are viewed."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-800 text-surface-500 text-xs">
                <th className="text-left px-4 py-3 font-medium">
                  <button onClick={() => { handleSort('title') }} className="flex items-center hover:text-surface-300">
                    Publication <SortIndicator col="title" />
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-medium">
                  <button onClick={() => { handleSort('totalViews') }} className="flex items-center justify-end gap-0.5 hover:text-surface-300 w-full">
                    Views <SortIndicator col="totalViews" />
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-medium">
                  <button onClick={() => { handleSort('uniqueReaders') }} className="flex items-center justify-end gap-0.5 hover:text-surface-300 w-full">
                    Unique Readers <SortIndicator col="uniqueReaders" />
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-medium">
                  <button onClick={() => { handleSort('avgDuration') }} className="flex items-center justify-end gap-0.5 hover:text-surface-300 w-full">
                    Avg Time-on-Page <SortIndicator col="avgDuration" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800/50">
              {sorted.map((row) => (
                <tr
                  key={row.publication.id}
                  className="hover:bg-surface-800/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-surface-100 truncate max-w-xs">
                      {row.publication.title}
                    </p>
                    <p className="text-xs text-surface-600 mt-0.5">
                      {row.publication.type}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-surface-300">
                    {String(row.totalViews)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-surface-300">
                    {String(row.uniqueReaders)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-surface-400">
                    {row.avgDurationSeconds !== null
                      ? formatDuration(row.avgDurationSeconds)
                      : <span className="text-surface-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-surface-600">
        Only published publications are shown. Time-on-page is calculated from sessions where
        the reader closed or navigated away (not all sessions capture a close event).
      </p>
    </div>
  )
}
