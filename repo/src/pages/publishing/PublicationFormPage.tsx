/**
 * PublicationFormPage — create or edit a Draft/Rejected publication.
 * Auto-saves to IndexedDB every 30 seconds.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { db } from '@/db'
import {
  createPublication,
  updatePublication,
  submitForReview,
} from '@/services/publicationService'
import { Button, Card, CardHeader, Checkbox, Input, RichTextEditor, Select } from '@/components/ui'
import { decodeLocalFile, encodeLocalFile, fileToDataUrl, isExternalUrl } from '@/utils/fileUtils'
import { Role } from '@/types'
import type { PublicationType } from '@/types'

const PUBLICATION_TYPES: PublicationType[] = ['Announcement', 'Notice', 'Bulletin', 'Carousel']
const ALL_ROLES: Role[] = [Role.Administrator, Role.ContentEditor, Role.ReviewerApprover, Role.Participant]
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
  const [audienceRoles, setAudienceRoles] = useState<Role[]>([])
  const [audienceOrgsInput, setAudienceOrgsInput] = useState('')
  const [audienceTagsInput, setAudienceTagsInput] = useState('')
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
      setAudienceRoles(pub.audienceRoles ?? [])
      setAudienceOrgsInput((pub.audienceOrgs ?? []).join(', '))
      setAudienceTagsInput((pub.audienceTags ?? []).join(', '))
      setModerationFlags(pub.moderationFlags)
    })
  }, [editId])

  const handleSave = useCallback(async () => {
    if (!currentUser || !title.trim()) return // Don't auto-save if no user or empty title
    setIsLoading(true)
    try {
      const audienceOrgs = audienceOrgsInput
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
      const audienceTags = audienceTagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const input = {
        title: title.trim(),
        type,
        body,
        attachmentUrls: attachmentUrls.filter((u) => u.trim() && !isExternalUrl(u)),
        audienceRoles,
        audienceOrgs,
        audienceTags,
      }
      if (currentIdRef.current) {
        await updatePublication(
          currentIdRef.current,
          input,
        )
        const fresh = await db.publications.get(currentIdRef.current)
        if (fresh) setModerationFlags(fresh.moderationFlags)
      } else {
        const pub = await createPublication(input)
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
  }, [title, type, body, attachmentUrls, audienceRoles, audienceOrgsInput, audienceTagsInput, currentUser, tabId, closeTab, markDirty])

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
      await submitForReview(currentIdRef.current)
      toast.success('Submitted for review')
      setDirty(false)
      if (tabId) closeTab(tabId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAttachmentFilePick = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    try {
      const encoded = await Promise.all(
        Array.from(files).map(async (f) => encodeLocalFile(f.name, await fileToDataUrl(f))),
      )
      setAttachmentUrls((prev) => {
        // Drop the initial placeholder empty string on first pick
        const nonEmpty = prev.filter((u) => u.trim() !== '')
        return [...nonEmpty, ...encoded]
      })
      setDirty(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read file')
    }
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
        <CardHeader title="Attachments" description="Upload files from your device (stored locally, no internet required)" />
        <div className="space-y-3">
          {/* Uploaded attachment chips */}
          {attachmentUrls.filter((u) => u.trim() && !isExternalUrl(u)).length > 0 && (
            <div className="space-y-1.5">
              {attachmentUrls.filter((u) => u.trim() && !isExternalUrl(u)).map((stored, idx) => {
                const file = decodeLocalFile(stored)
                return (
                  <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-surface-800 rounded-lg">
                    <Paperclip className="w-3.5 h-3.5 text-surface-500 shrink-0" />
                    <span className="flex-1 text-xs text-surface-300 truncate">
                      {file?.name ?? 'file'}
                    </span>
                    <button
                      onClick={() => {
                        setAttachmentUrls(attachmentUrls.filter((u) => u !== stored))
                        setDirty(true)
                      }}
                      className="text-surface-500 hover:text-danger-400 shrink-0"
                      aria-label="Remove attachment"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {/* File picker */}
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-surface-600 hover:border-primary-500 cursor-pointer text-sm text-surface-400 hover:text-primary-400 transition-colors w-fit">
            <Paperclip className="w-4 h-4 shrink-0" />
            <span>Choose files…</span>
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => { void handleAttachmentFilePick(e.target.files) }}
            />
          </label>
          <p className="text-xs text-surface-600">Max 10 MB per file</p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Audience"
          description="Restrict visibility by role, organisation, or topic tag. Leave all fields empty to broadcast to everyone."
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {ALL_ROLES.map((role) => (
              <Checkbox
                key={role}
                label={role}
                checked={audienceRoles.includes(role)}
                onChange={(e) => {
                  setAudienceRoles(
                    e.target.checked
                      ? [...audienceRoles, role]
                      : audienceRoles.filter((r) => r !== role),
                  )
                  setDirty(true)
                }}
              />
            ))}
          </div>
          <Input
            label="Organisations (comma-separated)"
            value={audienceOrgsInput}
            onChange={(e) => {
              setAudienceOrgsInput(e.target.value)
              setDirty(true)
            }}
            placeholder="e.g. Finance, Engineering, HR"
            hint="Leave blank to include all organisations"
          />
          <Input
            label="Topic tags (comma-separated)"
            value={audienceTagsInput}
            onChange={(e) => {
              setAudienceTagsInput(e.target.value)
              setDirty(true)
            }}
            placeholder="e.g. finance, compliance, hr"
          />
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
