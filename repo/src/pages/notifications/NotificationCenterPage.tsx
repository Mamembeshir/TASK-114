/**
 * NotificationCenterPage — full notification history with filters and bulk actions.
 */

import { useEffect, useState } from 'react'
import { Bell, CheckCheck, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { deleteNotification } from '@/services/notificationService'
import { Badge, Button, EmptyState } from '@/components/ui'
import type { NotificationType } from '@/types'

const TYPE_LABELS: Record<NotificationType, string> = {
  BidOutbid: 'Outbid',
  AuctionWon: 'Auction Won',
  AuctionNoSale: 'No Sale',
  AuctionStarted: 'Auction Started',
  AuctionExtended: 'Auction Extended',
  PublicationApproved: 'Publication Approved',
  PublicationRejected: 'Publication Rejected',
  PublicationPublished: 'Publication Published',
  DocumentApproved: 'Document Approved',
  DocumentRejected: 'Document Rejected',
  DocumentCheckoutExpiring: 'Checkout Expiring',
  DocumentRetentionDue: 'Retention Due',
  DocumentDestructionRequested: 'Destruction Request',
  WalletCredited: 'Wallet Credited',
  WalletDebited: 'Wallet Debited',
  System: 'System',
}

type FilterType = 'all' | 'unread' | NotificationType

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${String(Math.floor(diff / 60_000))}m ago`
  if (diff < 86_400_000) return `${String(Math.floor(diff / 3_600_000))}h ago`
  return new Date(ts).toLocaleDateString()
}

export function NotificationCenterPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { notifications, unreadCount, refresh, markRead, markAllRead } = useNotificationStore()
  const [filter, setFilter] = useState<FilterType>('all')
  const [selected, setSelected] = useState(new Set<string>())

  useEffect(() => {
    if (currentUser) void refresh(currentUser.id)
  }, [currentUser, refresh])

  if (!currentUser) return null

  const filtered =
    filter === 'all'
      ? notifications
      : filter === 'unread'
        ? notifications.filter((n) => !n.isRead)
        : notifications.filter((n) => n.type === filter)

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(filtered.map((n) => n.id)))
  }

  const clearSelection = () => {
    setSelected(new Set())
  }

  const handleDeleteSelected = async () => {
    await Promise.all([...selected].map(deleteNotification))
    setSelected(new Set())
    void refresh(currentUser.id)
  }

  const handleMarkSelectedRead = async () => {
    await Promise.all(
      [...selected]
        .filter((id) => {
          const n = notifications.find((x) => x.id === id)
          return n && !n.isRead
        })
        .map((id) => markRead(id, currentUser.id)),
    )
    setSelected(new Set())
  }

  const handleDeleteOne = async (id: string) => {
    await deleteNotification(id)
    void refresh(currentUser.id)
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-surface-100">Notifications</h1>
          <p className="text-sm text-surface-500 mt-0.5">
            {unreadCount > 0 ? `${String(unreadCount)} unread` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={() => void markAllRead(currentUser.id)}>
            <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'unread'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => {
              setFilter(f)
            }}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize',
              filter === f
                ? 'bg-primary-600 text-white'
                : 'bg-surface-800 text-surface-400 hover:bg-surface-700',
            ].join(' ')}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-800 rounded-xl">
          <span className="text-xs text-surface-400">{selected.size} selected</span>
          <Button variant="ghost" size="sm" onClick={() => void handleMarkSelectedRead()}>
            Mark read
          </Button>
          <Button variant="danger" size="sm" onClick={() => void handleDeleteSelected()}>
            Delete
          </Button>
          <button
            onClick={clearSelection}
            className="text-xs text-surface-500 hover:text-surface-300 ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {/* List */}
      <div className="bg-surface-900 border border-surface-800 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications"
            description={filter === 'unread' ? 'No unread notifications.' : 'Nothing here yet.'}
          />
        ) : (
          <>
            {/* Select all */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-surface-800 bg-surface-900/80">
              <input
                type="checkbox"
                checked={selected.size === filtered.length && filtered.length > 0}
                onChange={() => {
                  if (selected.size === filtered.length) clearSelection()
                  else selectAll()
                }}
                className="accent-primary-600"
              />
              <span className="text-xs text-surface-500">Select all</span>
            </div>

            <div className="divide-y divide-surface-800/50">
              {filtered.map((n) => (
                <div
                  key={n.id}
                  className={[
                    'flex items-start gap-3 px-4 py-3 hover:bg-surface-800/40 transition-colors group',
                    !n.isRead ? 'bg-primary-950/20' : '',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(n.id)}
                    onChange={() => {
                      toggleSelect(n.id)
                    }}
                    className="mt-1 accent-primary-600 shrink-0"
                  />
                  <div className="mt-1.5 shrink-0">
                    <span
                      className={`block w-2 h-2 rounded-full ${!n.isRead ? 'bg-primary-500' : 'bg-surface-700'}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-surface-100">{n.title}</p>
                      <Badge variant="default">{TYPE_LABELS[n.type]}</Badge>
                    </div>
                    <p className="text-xs text-surface-400 mt-0.5">{n.message}</p>
                    <p className="text-xs text-surface-600 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {!n.isRead && (
                      <button
                        onClick={() => void markRead(n.id, currentUser.id)}
                        title="Mark read"
                        className="p-1.5 rounded text-surface-500 hover:text-primary-400 hover:bg-surface-700"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => void handleDeleteOne(n.id)}
                      title="Delete"
                      className="p-1.5 rounded text-surface-500 hover:text-red-400 hover:bg-surface-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
