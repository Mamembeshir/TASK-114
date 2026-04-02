/**
 * PublicationFormPage — create or edit a Draft/Rejected publication.
 * Auto-saves to IndexedDB every 30 seconds.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { db } from '@/db'
import {
  createPublication,
  updatePublication,
  submitForReview,
} from '@/services/publicationService'
import { Button, Card, CardHeader, Input, RichTextEditor, Select } from '@/components/ui'
import type { PublicationType } from '@/types'

const PUBLICATION_TYPES: PublicationType[] = ['Announcement', 'Notice', 'Bulletin', 'Carousel']
const AUTO_SAVE_INTERVAL = 30_000

interface Props {
  editId?: string
  tabId?: string
}

export function PublicationFormPage({ editId, tabId }: Props) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { markDirty, closeTab } = useTabStore()

  const [isLoading, setIsLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<PublicationType>('Announcement')
  const [body, setBody] = useState('')
  const [attachmentUrls, setAttachmentUrls] = useState([''])
  const [moderationFlags, setModerationFlags] = useState<string[]>([])
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isDirty = useRef(false)
  const currentIdRef = useRef(editId)

  const setDirty = (v: boolean) => {
    isDirty.current = v
    if (tabId) markDirty(tabId, v)
  }

  // Load existing publication for edit mode
  useEffect(() => {
    if (!editId) return
    void db.publications.get(editId).then((pub) => {
      if (!pub) return
      setTitle(pub.title)
      setType(pub.type)
      setBody(pub.body)
      setAttachmentUrls(pub.attachmentUrls.length ? pub.attachmentUrls : [''])
      setModerationFlags(pub.moderationFlags)
    })
  }, [editId])

  const handleSave = useCallback(async () => {
    if (!currentUser || !title.trim()) return // Don't auto-save if no user or empty title
    setIsLoading(true)
    try {
      const input = {
        title: title.trim(),
        type,
        body,
        attachmentUrls: attachmentUrls.filter((u) => u.trim()),
      }
      if (currentIdRef.current) {
        await updatePublication(
          currentIdRef.current,
          input,
          currentUser.id,
          currentUser.displayName,
        )
        const fresh = await db.publications.get(currentIdRef.current)
        if (fresh) setModerationFlags(fresh.moderationFlags)
      } else {
        const pub = await createPublication(input, currentUser.id, currentUser.displayName)
        currentIdRef.current = pub.id
        setModerationFlags(pub.moderationFlags)
        // Reopen as edit tab
        if (tabId) closeTab(tabId)
        useTabStore.getState().openTab({
          id: `pub-edit-${pub.id}`,
          title: pub.title,
          path: `/publishing/${pub.id}/edit`,
        })
      }
      isDirty.current = false
      if (tabId) markDirty(tabId, false)
      setLastSaved(new Date())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsLoading(false)
    }
  }, [title, type, body, attachmentUrls, currentUser, tabId, closeTab, markDirty])

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirty.current) void handleSave()
    }, AUTO_SAVE_INTERVAL)
    return () => {
      clearInterval(interval)
    }
  }, [handleSave])

  if (!currentUser) return null

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Title is required'
    if (!body || body === '<p></p>') e.body = 'Body is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmitForReview = async () => {
    if (!validate()) return
    if (!currentIdRef.current) {
      // Save first
      await handleSave()
      if (!currentIdRef.current) return
    }
    setIsLoading(true)
    try {
      await submitForReview(currentIdRef.current, currentUser.id, currentUser.displayName)
      toast.success('Submitted for review')
      setDirty(false)
      if (tabId) closeTab(tabId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setIsLoading(false)
    }
  }

  const updateAttachmentUrl = (idx: number, value: string) => {
    const next = [...attachmentUrls]
    next[idx] = value
    setAttachmentUrls(next)
    setDirty(true)
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-bold text-surface-50">
          {editId ? 'Edit Publication' : 'New Publication'}
        </h1>
        {lastSaved && (
          <span className="text-xs text-surface-500 mt-1 shrink-0">
            Last saved {lastSaved.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Moderation warning */}
      {moderationFlags.length > 0 && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Moderation flags — submission is blocked</p>
            <p className="mt-1 text-red-400/80">
              Remove flagged words: <span className="font-mono">{moderationFlags.join(', ')}</span>
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader title="Publication Details" />
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Input
                label="Title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setDirty(true)
                }}
                error={errors.title}
                placeholder="Publication title"
              />
            </div>
            <Select
              label="Type"
              value={type}
              onChange={(e) => {
                setType(e.target.value as PublicationType)
                setDirty(true)
              }}
            >
              {PUBLICATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Body" />
        {errors.body && <p className="text-xs text-red-400 mb-2">{errors.body}</p>}
        <RichTextEditor
          value={body}
          onChange={(html) => {
            setBody(html)
            setDirty(true)
          }}
          placeholder="Write your content here…"
        />
      </Card>

      <Card>
        <CardHeader title="Attachments" description="Link URLs (optional)" />
        <div className="space-y-2">
          {attachmentUrls.map((url, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500"
                value={url}
                onChange={(e) => {
                  updateAttachmentUrl(idx, e.target.value)
                }}
                placeholder="https://example.com/attachment.pdf"
              />
              {attachmentUrls.length > 1 && (
                <button
                  onClick={() => {
                    setAttachmentUrls(attachmentUrls.filter((_, i) => i !== idx))
                  }}
                  className="text-surface-500 hover:text-danger-400"
                  aria-label="Remove attachment"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAttachmentUrls([...attachmentUrls, ''])
            }}
          >
            + Add attachment
          </Button>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => void handleSave()} isLoading={isLoading}>
          Save Draft
        </Button>
        <Button
          variant="primary"
          onClick={() => void handleSubmitForReview()}
          isLoading={isLoading}
          disabled={moderationFlags.length > 0}
        >
          Submit for Review
        </Button>
      </div>
    </div>
  )
}
