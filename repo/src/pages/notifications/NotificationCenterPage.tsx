/**
 * NotificationCenterPage — notification history with filters/bulk actions + subscription preferences.
 */

import { useEffect, useState } from 'react'
import { Bell, CheckCheck, Settings, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import {
  deleteNotification,
  getOwnSubscription,
  setSubscription,
} from '@/services/notificationService'
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

// All notification types shown in the preferences table
const ALL_TYPES: NotificationType[] = [
  'BidOutbid',
  'AuctionWon',
  'AuctionNoSale',
  'AuctionStarted',
  'AuctionExtended',
  'PublicationApproved',
  'PublicationRejected',
  'PublicationPublished',
  'DocumentApproved',
  'DocumentRejected',
  'DocumentCheckoutExpiring',
  'DocumentRetentionDue',
  'DocumentDestructionRequested',
  'WalletCredited',
  'WalletDebited',
  'System',
]

interface Pref {
  inApp: boolean
  email: boolean
  sms: boolean
  officialAccount: boolean
}

type PrefMap = Record<string, Pref>

interface SubscriptionPrefsPanelProps {
  userId: string
}

function SubscriptionPrefsPanel({ userId }: SubscriptionPrefsPanelProps) {
  const [prefs, setPrefs] = useState<PrefMap>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const entries = await Promise.all(
        ALL_TYPES.map(async (type) => {
          const pref = await getOwnSubscription(userId, type)
          return [type, pref] as const
        }),
      )
      setPrefs(Object.fromEntries(entries))
    }
    void load()
  }, [userId])

  const handleToggle = async (type: string, channel: keyof Pref) => {
    const current = prefs[type] ?? { inApp: true, email: false, sms: false, officialAccount: false }
    const updated = { ...current, [channel]: !current[channel] }
    setSaving(`${type}-${channel}`)
    try {
      await setSubscription(userId, type, { [channel]: updated[channel] })
      setPrefs((prev) => ({ ...prev, [type]: updated }))
    } catch {
      toast.error('Failed to save preference')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-500">
        Control which notification types you receive and on which channels.
        In-app notifications are on by default. Email, SMS, and Official Account messages
        require an address configured in your profile and will be queued for manual export.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-800 text-surface-500 text-xs">
              <th className="text-left pb-2 font-medium pr-4">Notification</th>
              <th className="text-center pb-2 font-medium w-20">In-App</th>
              <th className="text-center pb-2 font-medium w-20">Email</th>
              <th className="text-center pb-2 font-medium w-20">SMS</th>
              <th className="text-center pb-2 font-medium w-24">Official Acct</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800/50">
            {ALL_TYPES.map((type) => {
              const pref = prefs[type] ?? { inApp: true, email: false, sms: false, officialAccount: false }
              return (
                <tr key={type} className="hover:bg-surface-800/30 transition-colors">
                  <td className="py-2.5 pr-4 text-surface-300 text-xs font-medium">
                    {TYPE_LABELS[type]}
                  </td>
                  {(['inApp', 'email', 'sms', 'officialAccount'] as (keyof Pref)[]).map((channel) => (
                    <td key={channel} className="py-2.5 text-center">
                      <button
                        onClick={() => void handleToggle(type, channel)}
                        disabled={saving === `${type}-${channel}`}
                        className={[
                          'w-8 h-4.5 rounded-full transition-colors relative inline-block',
                          pref[channel]
                            ? 'bg-primary-600 hover:bg-primary-500'
                            : 'bg-surface-700 hover:bg-surface-600',
                          saving === `${type}-${channel}` ? 'opacity-50' : '',
                        ].join(' ')}
                        title={`${pref[channel] ? 'Disable' : 'Enable'} ${channel} for ${TYPE_LABELS[type]}`}
                        aria-pressed={pref[channel]}
                      >
                        <span
                          className={[
                            'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform',
                            pref[channel] ? 'translate-x-4' : 'translate-x-0.5',
                          ].join(' ')}
                        />
                      </button>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
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
  const [activeTab, setActiveTab] = useState<'inbox' | 'preferences'>('inbox')
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
    await Promise.all([...selected].map((id) => deleteNotification(id)))
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
            {activeTab === 'inbox'
              ? unreadCount > 0 ? `${String(unreadCount)} unread` : 'All caught up'
              : 'Manage delivery preferences per notification type'}
          </p>
        </div>
        {activeTab === 'inbox' && unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={() => void markAllRead(currentUser.id)}>
            <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-surface-800/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => { setActiveTab('inbox') }}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            activeTab === 'inbox'
              ? 'bg-surface-700 text-surface-100'
              : 'text-surface-500 hover:text-surface-300',
          ].join(' ')}
        >
          <Bell className="w-3.5 h-3.5" />
          Inbox
          {unreadCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-xs bg-primary-600 text-white leading-none">
              {String(unreadCount)}
            </span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab('preferences') }}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            activeTab === 'preferences'
              ? 'bg-surface-700 text-surface-100'
              : 'text-surface-500 hover:text-surface-300',
          ].join(' ')}
        >
          <Settings className="w-3.5 h-3.5" />
          Preferences
        </button>
      </div>

      {/* Preferences panel */}
      {activeTab === 'preferences' && (
        <div className="bg-surface-900 border border-surface-800 rounded-xl p-4">
          <SubscriptionPrefsPanel userId={currentUser.id} />
        </div>
      )}

      {activeTab === 'inbox' && (
      <>
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
      </>
      )}
    </div>
  )
}
