/**
 * OutboundQueuePage — Admin view of the offline outbound message queue.
 * No real sends happen; queue is exported as CSV/JSON for manual processing.
 */

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Download, MailCheck, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { db } from '@/db'
import {
  bulkMarkOutboundSent,
  bulkDeleteOutbound,
  markOutboundFailed,
  markOutboundSent,
  requeueOutbound,
  queueOutboundMessage,
  renderTemplate,
} from '@/services/notificationService'
import { Badge, Button, EmptyState, Table } from '@/components/ui'
import type { ColumnDef } from '@/components/ui'
import type { NotificationTemplate, OutboundChannel, OutboundQueueItem, OutboundStatus } from '@/types'

const STATUS_VARIANTS: Record<OutboundStatus, 'default' | 'success' | 'danger' | 'warning'> = {
  Scheduled: 'info' as 'default', // closest available variant
  Queued: 'warning',
  Sent: 'success',
  Failed: 'danger',
  Retrying: 'default',
}

const ALL_STATUSES: (OutboundStatus | 'All')[] = ['All', 'Scheduled', 'Queued', 'Sent', 'Failed']

function toCsv(items: OutboundQueueItem[]): string {
  const headers = [
    'id',
    'channel',
    'recipientUserId',
    'recipientAddress',
    'subject',
    'body',
    'status',
    'queuedAt',
    'sentAt',
  ]
  const escape = (v: string | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
  const rows = items.map((item) =>
    [
      escape(item.id),
      escape(item.channel),
      escape(item.recipientUserId),
      escape(item.recipientAddress),
      escape(item.subject),
      escape(item.body),
      escape(item.status),
      escape(new Date(item.queuedAt).toISOString()),
      escape(item.sentAt ? new Date(item.sentAt).toISOString() : ''),
    ].join(','),
  )
  return [headers.join(','), ...rows].join('\n')
}

function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function OutboundQueuePage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const [items, setItems] = useState<OutboundQueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<OutboundStatus | 'All'>('All')
  const [selected, setSelected] = useState(new Set<string>())

  // ── Compose / Schedule state ────────────────────────────────────────────────
  const [templates, setTemplates] = useState<NotificationTemplate[]>([])
  const [showCompose, setShowCompose] = useState(false)
  const [composeTemplateId, setComposeTemplateId] = useState('')
  const [composeChannel, setComposeChannel] = useState<OutboundChannel>('Email')
  const [composeRecipientUserId, setComposeRecipientUserId] = useState('')
  const [composeRecipientAddress, setComposeRecipientAddress] = useState('')
  const [composeScheduledAt, setComposeScheduledAt] = useState('')
  const [composeVars, setComposeVars] = useState<Record<string, string>>({})
  const [composing, setComposing] = useState(false)

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === composeTemplateId) ?? null,
    [templates, composeTemplateId],
  )

  const load = async () => {
    setIsLoading(true)
    const [all, tpls] = await Promise.all([
      db.outboundQueue.orderBy('queuedAt').reverse().toArray(),
      db.notificationTemplates.filter((t) => t.isActive).toArray(),
    ])
    setItems(all)
    setTemplates(tpls)
    setIsLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const handleCompose = async () => {
    if (!selectedTemplate) { toast.error('Select a template'); return }
    if (!composeRecipientUserId.trim()) { toast.error('Recipient user ID is required'); return }
    if (!composeRecipientAddress.trim()) { toast.error('Recipient address is required'); return }

    const scheduledAt = composeScheduledAt
      ? new Date(composeScheduledAt).getTime()
      : undefined

    setComposing(true)
    try {
      await queueOutboundMessage({
        channel: composeChannel,
        recipientUserId: composeRecipientUserId.trim(),
        recipientAddress: composeRecipientAddress.trim(),
        templateKey: selectedTemplate.key,
        templateVariables: composeVars,
        scheduledAt,
      })
      const isScheduled = scheduledAt !== undefined && scheduledAt > Date.now()
      toast.success(isScheduled ? 'Message scheduled' : 'Message queued')
      setShowCompose(false)
      setComposeTemplateId('')
      setComposeRecipientUserId('')
      setComposeRecipientAddress('')
      setComposeScheduledAt('')
      setComposeVars({})
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to queue message')
    } finally {
      setComposing(false)
    }
  }

  if (!currentUser) return null

  const filtered = statusFilter === 'All' ? items : items.filter((i) => i.status === statusFilter)

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(filtered.map((i) => i.id)))
  }
  const clearSelection = () => {
    setSelected(new Set())
  }

  const handleBulkSent = async () => {
    await bulkMarkOutboundSent([...selected])
    clearSelection()
    void load()
    toast.success(`${String(selected.size)} items marked as sent`)
  }

  const handleBulkDelete = async () => {
    await bulkDeleteOutbound([...selected])
    clearSelection()
    void load()
    toast.success(`${String(selected.size)} items deleted`)
  }

  const exportCsv = () => {
    downloadFile(toCsv(filtered), `outbound-queue-${String(Date.now())}.csv`, 'text/csv')
  }

  const exportJson = () => {
    downloadFile(
      JSON.stringify(filtered, null, 2),
      `outbound-queue-${String(Date.now())}.json`,
      'application/json',
    )
  }

  const columns: ColumnDef<OutboundQueueItem>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={selected.size === filtered.length && filtered.length > 0}
          onChange={() => {
            if (selected.size === filtered.length) clearSelection()
            else selectAll()
          }}
          className="accent-primary-600"
        />
      ),
      width: 'w-10',
      cell: (item) => (
        <input
          type="checkbox"
          checked={selected.has(item.id)}
          onChange={() => {
            toggleSelect(item.id)
          }}
          className="accent-primary-600"
        />
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      width: 'w-20',
      cell: (item) => (
        <Badge variant={item.channel === 'Email' ? 'info' : 'primary'}>{item.channel}</Badge>
      ),
    },
    {
      key: 'recipient',
      header: 'Recipient',
      width: 'w-44',
      cell: (item) => (
        <span className="text-xs text-surface-300 font-mono truncate block">
          {item.recipientAddress}
        </span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject / Body',
      cell: (item) => (
        <div>
          {item.subject && (
            <p className="text-sm font-medium text-surface-100 truncate">{item.subject}</p>
          )}
          <p className="text-xs text-surface-400 truncate">{item.body}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-24',
      cell: (item) => <Badge variant={STATUS_VARIANTS[item.status]}>{item.status}</Badge>,
    },
    {
      key: 'queued',
      header: 'Queued / Scheduled',
      width: 'w-40',
      cell: (item) => (
        <div>
          <span className="text-xs text-surface-500">{new Date(item.queuedAt).toLocaleString()}</span>
          {item.scheduledAt && (
            <div className="flex items-center gap-1 text-xs text-primary-400 mt-0.5">
              <Calendar className="w-3 h-3" />
              {new Date(item.scheduledAt).toLocaleString()}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-28',
      cell: (item) => (
        <div className="flex justify-end gap-1">
          {item.status === 'Scheduled' && (
            <button
              onClick={() => {
                void requeueOutbound(item.id).then(() => void load())
              }}
              title="Release to queue now"
              className="p-1.5 rounded text-surface-500 hover:text-amber-400 hover:bg-surface-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          {item.status === 'Queued' && (
            <button
              onClick={() => {
                void markOutboundSent(item.id).then(() => void load())
              }}
              title="Mark as sent"
              className="p-1.5 rounded text-surface-500 hover:text-emerald-400 hover:bg-surface-700"
            >
              <MailCheck className="w-3.5 h-3.5" />
            </button>
          )}
          {item.status === 'Failed' && (
            <button
              onClick={() => {
                void requeueOutbound(item.id).then(() => void load())
              }}
              title="Re-queue"
              className="p-1.5 rounded text-surface-500 hover:text-amber-400 hover:bg-surface-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          {item.status === 'Queued' && (
            <button
              onClick={() => {
                void markOutboundFailed(item.id).then(() => void load())
              }}
              title="Mark as failed"
              className="p-1.5 rounded text-surface-500 hover:text-red-400 hover:bg-surface-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-surface-100">Outbound Queue</h1>
          <p className="text-sm text-surface-500 mt-0.5">
            Offline queue — export for manual processing
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={exportCsv}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={exportJson}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            JSON
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setShowCompose((v) => !v)
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Compose
          </Button>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s)
            }}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              statusFilter === s
                ? 'bg-primary-600 text-white'
                : 'bg-surface-800 text-surface-400 hover:bg-surface-700',
            ].join(' ')}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Compose & Schedule panel */}
      {showCompose && (
        <div className="bg-surface-800 border border-surface-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-surface-100">Compose & Schedule Message</h2>

          <div className="grid grid-cols-2 gap-4">
            {/* Template */}
            <div className="col-span-2 sm:col-span-1 space-y-1">
              <label className="text-xs text-surface-400 font-medium">Template</label>
              <select
                value={composeTemplateId}
                onChange={(e) => {
                  setComposeTemplateId(e.target.value)
                  setComposeVars({})
                }}
                className="w-full bg-surface-900 border border-surface-700 text-surface-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">— Select template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Channel */}
            <div className="space-y-1">
              <label className="text-xs text-surface-400 font-medium">Channel</label>
              <select
                value={composeChannel}
                onChange={(e) => {
                  setComposeChannel(e.target.value as OutboundChannel)
                }}
                className="w-full bg-surface-900 border border-surface-700 text-surface-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="Email">Email</option>
                <option value="SMS">SMS</option>
              </select>
            </div>

            {/* Recipient user ID */}
            <div className="space-y-1">
              <label className="text-xs text-surface-400 font-medium">Recipient User ID</label>
              <input
                type="text"
                value={composeRecipientUserId}
                onChange={(e) => {
                  setComposeRecipientUserId(e.target.value)
                }}
                placeholder="user-uuid"
                className="w-full bg-surface-900 border border-surface-700 text-surface-100 placeholder-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* Recipient address */}
            <div className="space-y-1">
              <label className="text-xs text-surface-400 font-medium">
                {composeChannel === 'Email' ? 'Email Address' : 'Phone Number'}
              </label>
              <input
                type={composeChannel === 'Email' ? 'email' : 'tel'}
                value={composeRecipientAddress}
                onChange={(e) => {
                  setComposeRecipientAddress(e.target.value)
                }}
                placeholder={composeChannel === 'Email' ? 'user@example.com' : '+1 555 000 0000'}
                className="w-full bg-surface-900 border border-surface-700 text-surface-100 placeholder-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* Schedule datetime */}
            <div className="space-y-1">
              <label className="text-xs text-surface-400 font-medium flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Schedule (optional)
              </label>
              <input
                type="datetime-local"
                value={composeScheduledAt}
                onChange={(e) => {
                  setComposeScheduledAt(e.target.value)
                }}
                className="w-full bg-surface-900 border border-surface-700 text-surface-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Template variable inputs */}
          {selectedTemplate && selectedTemplate.variables.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-surface-500 font-medium uppercase tracking-wide">
                Template Variables
              </p>
              <div className="grid grid-cols-2 gap-3">
                {selectedTemplate.variables.map((varName) => (
                  <div key={varName} className="space-y-1">
                    <label className="text-xs text-surface-400 font-mono">{`{{${varName}}}`}</label>
                    <input
                      type="text"
                      value={composeVars[varName] ?? ''}
                      onChange={(e) => {
                        setComposeVars((prev) => ({ ...prev, [varName]: e.target.value }))
                      }}
                      placeholder={varName}
                      className="w-full bg-surface-900 border border-surface-700 text-surface-100 placeholder-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleCompose()}
              disabled={composing}
            >
              {composing
                ? 'Queuing…'
                : composeScheduledAt && new Date(composeScheduledAt).getTime() > Date.now()
                  ? 'Schedule Message'
                  : 'Queue Message'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowCompose(false)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-800 rounded-xl">
          <span className="text-xs text-surface-400">{selected.size} selected</span>
          <Button variant="secondary" size="sm" onClick={() => void handleBulkSent()}>
            Mark as sent
          </Button>
          <Button variant="danger" size="sm" onClick={() => void handleBulkDelete()}>
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

      <div className="bg-surface-900 border border-surface-800 rounded-xl overflow-hidden">
        {filtered.length === 0 && !isLoading ? (
          <EmptyState
            icon={MailCheck}
            title="Queue is empty"
            description={
              statusFilter === 'All'
                ? 'No messages in the outbound queue.'
                : `No ${statusFilter} messages.`
            }
          />
        ) : (
          <Table
            columns={columns}
            data={filtered}
            rowKey={(item) => item.id}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  )
}
