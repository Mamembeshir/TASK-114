/**
 * NotificationStore — reactive unread count + notification list.
 *
 * Kept lightweight: loads on demand, refreshed via `refresh()`.
 * BroadcastChannel sync ensures the bell updates when another tab
 * triggers a new notification.
 */

import { create } from 'zustand'
import { db } from '@/db'
import { markNotificationRead, markAllNotificationsRead } from '@/services/notificationService'
import type { Notification } from '@/types'

const CHANNEL_NAME = 'meridian_notifications'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  refresh: (userId: string) => Promise<void>
  markRead: (id: string, userId: string) => Promise<void>
  markAllRead: (userId: string) => Promise<void>
  /** Clear in-memory notification state. Call on logout to prevent data leaking to the next user. */
  reset: () => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  refresh: async (userId: string) => {
    set({ isLoading: true })
    const all = await db.notifications.where('userId').equals(userId).reverse().sortBy('createdAt')
    set({
      notifications: all,
      unreadCount: all.filter((n) => !n.isRead).length,
      isLoading: false,
    })
  },

  markRead: async (id: string, userId: string) => {
    await markNotificationRead(id)
    await get().refresh(userId)
    broadcastRefresh()
  },

  markAllRead: async (userId: string) => {
    await markAllNotificationsRead(userId)
    await get().refresh(userId)
    broadcastRefresh()
  },

  reset: () => {
    set({ notifications: [], unreadCount: 0, isLoading: false })
  },
}))

// ── BroadcastChannel sync ──────────────────────────────────────────────────────

let channel: BroadcastChannel | null = null

/** Broadcast a refresh signal to other tabs. */
function broadcastRefresh(): void {
  channel?.postMessage({ type: 'refresh' })
}

/**
 * Call once at app startup (after auth) to listen for cross-tab notification events.
 * Returns a cleanup function.
 */
export function startNotificationSync(userId: string): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined

  channel = new BroadcastChannel(CHANNEL_NAME)
  const handler = (e: MessageEvent<{ type: string }>) => {
    if (e.data.type === 'refresh') {
      void useNotificationStore.getState().refresh(userId)
    }
  }
  channel.addEventListener('message', handler)

  return () => {
    channel?.removeEventListener('message', handler)
    channel?.close()
    channel = null
  }
}

/** Broadcast a new notification event to other tabs (called after creating a notification). */
export function broadcastNewNotification(): void {
  if (typeof BroadcastChannel === 'undefined') return
  const ch = new BroadcastChannel(CHANNEL_NAME)
  ch.postMessage({ type: 'refresh' })
  ch.close()
}
