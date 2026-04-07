/**
 * NotificationBell — bell icon with unread badge + dropdown panel.
 * Placed in the TabBar header area.
 */

import { useEffect, useRef, useState } from 'react'
import { Bell, Check, CheckCheck, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { deleteNotification } from '@/services/notificationService'
import type { Notification } from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${String(Math.floor(diff / 60_000))}m ago`
  if (diff < 86_400_000) return `${String(Math.floor(diff / 3_600_000))}h ago`
  return `${String(Math.floor(diff / 86_400_000))}d ago`
}

// ── Single notification row ────────────────────────────────────────────────────

interface RowProps {
  n: Notification
  onMarkRead: () => void
  onDelete: () => void
}

function NotificationRow({ n, onMarkRead, onDelete }: RowProps) {
  return (
    <div
      className={[
        'flex items-start gap-3 px-4 py-3 hover:bg-surface-800/60 transition-colors group',
        !n.isRead ? 'bg-primary-950/30' : '',
      ].join(' ')}
    >
      {/* Unread dot */}
      <div className="mt-1.5 shrink-0">
        <span
          className={`block w-2 h-2 rounded-full ${!n.isRead ? 'bg-primary-500' : 'bg-surface-700'}`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-surface-100 leading-tight">{n.title}</p>
        <p className="text-xs text-surface-400 mt-0.5 leading-snug">{n.message}</p>
        <p className="text-xs text-surface-600 mt-1">{timeAgo(n.createdAt)}</p>
      </div>

      {/* Actions — shown on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {!n.isRead && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMarkRead()
            }}
            title="Mark as read"
            className="p-1 rounded text-surface-500 hover:text-primary-400 hover:bg-surface-700"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title="Delete"
          className="p-1 rounded text-surface-500 hover:text-red-400 hover:bg-surface-700"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── NotificationBell ───────────────────────────────────────────────────────────

export function NotificationBell() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { notifications, unreadCount, refresh, markRead, markAllRead } = useNotificationStore()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Refresh on mount and when opened
  useEffect(() => {
    if (currentUser) void refresh(currentUser.id)
  }, [currentUser, refresh])

  useEffect(() => {
    if (open && currentUser) void refresh(currentUser.id)
  }, [open, currentUser, refresh])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
    }
  }, [open])

  if (!currentUser) return null

  const recent = notifications.slice(0, 20)

  const handleDelete = async (id: string) => {
    await deleteNotification(id, currentUser.id)
    await refresh(currentUser.id)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => {
          setOpen((v) => !v)
        }}
        className={[
          'relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
          open
            ? 'bg-surface-700 text-surface-100'
            : 'text-surface-400 hover:bg-surface-800 hover:text-surface-200',
        ].join(' ')}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-10 w-96 max-h-[480px] bg-surface-900 border border-surface-700 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800 shrink-0">
            <h3 className="text-sm font-semibold text-surface-100">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => void markAllRead(currentUser.id)}
                className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-surface-800/50">
            {recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-surface-600">
                <Bell className="w-8 h-8 mb-3 opacity-40" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              recent.map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  onMarkRead={() => void markRead(n.id, currentUser.id)}
                  onDelete={() => void handleDelete(n.id)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-surface-800 shrink-0">
              <button
                onClick={() => {
                  setOpen(false)
                  // Navigate to full notification center
                  void import('@/store/tabStore').then(({ useTabStore }) => {
                    useTabStore.getState().openTab({
                      id: 'notifications',
                      title: 'Notifications',
                      path: '/notifications',
                    })
                  })
                }}
                className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
              >
                View all notifications →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
