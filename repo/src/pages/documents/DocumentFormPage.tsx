/**
 * DocumentFormPage — create or edit a Draft/Rejected document.
 * Requires exclusive checkout before editing an existing document.
 */
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Lock, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { db } from '@/db'
import {
  createDocument,
  updateDocument,
  submitDocumentForReview,
  checkoutDocument,
  checkinDocument,
  getDocumentById,
  listDocumentTemplates,
} from '@/services/documentService'
import { Button, Card, CardHeader, Input, RichTextEditor, Select, Spinner } from '@/components/ui'
import type { Category, Document, DocumentTemplate } from '@/types'

const DOCUMENT_TYPES = ['Policy', 'Procedure', 'Form', 'Manual', 'Report', 'Other']

interface Props {
  editId?: string
  tabId?: string
}

export function DocumentFormPage({ editId, tabId }: Props) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { markDirty, closeTab } = useTabStore()

  const [categories, setCategories] = useState<Category[]>([])
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDoc, setIsLoadingDoc] = useState(!!editId)
  const [doc, setDoc] = useState<Document | null>(null)
  const [isCheckedOut, setIsCheckedOut] = useState(false)
  /** Display name of whoever currently holds the checkout lock (if not the current user). */
  const [checkedOutByName, setCheckedOutByName] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [type, setType] = useState(DOCUMENT_TYPES[0] ?? 'Policy')
  const [categoryId, setCategoryId] = useState('')
  const [body, setBody] = useState('')
  const [attachmentUrls, setAttachmentUrls] = useState([''])
  const [retentionYears, setRetentionYears] = useState('7')
  const [tagsInput, setTagsInput] = useState('')
  const [metadataRows, setMetadataRows] = useState<{ key: string; value: string }[]>([])
  const [templateId, setTemplateId] = useState<string | undefined>(undefined)
  const [moderationFlags, setModerationFlags] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isDirty = useRef(false)
  const setDirty = (v: boolean) => {
    isDirty.current = v
    if (tabId) markDirty(tabId, v)
  }
  const currentIdRef = useRef(editId)

  useEffect(() => {
    void db.categories.toArray().then(setCategories)
    if (!editId) void listDocumentTemplates().then(setTemplates)
  }, [editId])

  useEffect(() => {
    if (!editId || !currentUser) return
    const load = async () => {
      const d = await getDocumentById(editId)
      if (!d) {
        setIsLoadingDoc(false)
        return
      }
      setDoc(d)
      setTitle(d.title)
      setType(d.type)
      setCategoryId(d.categoryId)
      setBody(d.body)
      setAttachmentUrls(d.attachmentUrls.length ? d.attachmentUrls : [''])
      setRetentionYears(String(d.retentionYears))
      setTagsInput((d.tags ?? []).join(', '))
      setMetadataRows(Object.entries(d.metadata ?? {}).map(([key, value]) => ({ key, value })))
      setTemplateId(d.templateId)
      setModerationFlags(d.moderationFlags)
      const myCheckout = d.checkedOutBy === currentUser.id
      setIsCheckedOut(myCheckout)
      if (d.checkedOutBy && !myCheckout) {
        const editor = await db.users.get(d.checkedOutBy)
        setCheckedOutByName(editor?.displayName ?? d.checkedOutBy)
      }
      setIsLoadingDoc(false)
    }
    void load()
  }, [editId, currentUser])

  if (!currentUser) return null

  if (isLoadingDoc) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    )
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Title is required'
    if (!categoryId) e.categoryId = 'Category is required'
    if (!body || body === '<p></p>') e.body = 'Body is required'
    const ry = Number(retentionYears)
    if (!retentionYears || isNaN(ry) || ry < 1) e.retentionYears = 'Retention years must be ≥ 1'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const buildInput = () => {
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const metadata = Object.fromEntries(
      metadataRows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]),
    )
    return {
      title: title.trim(),
      type,
      categoryId,
      body,
      attachmentUrls: attachmentUrls.filter((u) => u.trim()),
      retentionYears: Number(retentionYears),
      tags,
      metadata,
      templateId,
    }
  }

  const handleApplyTemplate = (tmplId: string) => {
    const tmpl = templates.find((t) => t.id === tmplId)
    if (!tmpl) return
    setTemplateId(tmplId)
    setType(tmpl.type)
    if (tmpl.categoryId) setCategoryId(tmpl.categoryId)
    setBody(tmpl.body)
    setRetentionYears(String(tmpl.defaultRetentionYears))
    setTagsInput(tmpl.tags.join(', '))
    setDirty(true)
  }

  const handleSaveDraft = async () => {
    if (!validate()) return
    setIsLoading(true)
    try {
      if (currentIdRef.current) {
        await updateDocument(currentIdRef.current, buildInput())
        const fresh = await getDocumentById(currentIdRef.current)
        if (fresh) setModerationFlags(fresh.moderationFlags)
        toast.success('Document saved')
      } else {
        const created = await createDocument(buildInput())
        currentIdRef.current = created.id
        setModerationFlags(created.moderationFlags)
        toast.success('Draft created')
        setDirty(false)
        if (tabId) closeTab(tabId)
        useTabStore.getState().openTab({
          id: `doc-edit-${created.id}`,
          title: created.title,
          path: `/documents/${created.id}/edit`,
        })
        return
      }
      setDirty(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCheckout = async () => {
    if (!currentIdRef.current) return
    setIsLoading(true)
    try {
      await checkoutDocument(currentIdRef.current)
      setIsCheckedOut(true)
      toast.success('Document checked out — you can now edit')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to checkout')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCheckin = async () => {
    if (!currentIdRef.current) return
    setIsLoading(true)
    try {
      await checkinDocument(currentIdRef.current)
      setIsCheckedOut(false)
      toast.success('Document checked in')
      setDirty(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to check in')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmitForReview = async () => {
    if (!validate()) return
    if (!currentIdRef.current) {
      await handleSaveDraft()
      if (!currentIdRef.current) return
    }
    setIsLoading(true)
    try {
      await submitDocumentForReview(currentIdRef.current)
      toast.success('Submitted for review')
      setDirty(false)
      if (tabId) closeTab(tabId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setIsLoading(false)
    }
  }

  // For existing docs, require checkout to edit
  const canEdit = !editId || isCheckedOut

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-bold text-surface-50">
          {editId ? 'Edit Document' : 'New Document'}
        </h1>
        {editId && (
          <div className="flex gap-2">
            {!isCheckedOut ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleCheckout()}
                isLoading={isLoading}
                leftIcon={<Lock className="w-3.5 h-3.5" />}
              >
                Check Out
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleCheckin()}
                isLoading={isLoading}
              >
                Check In
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Lock indicator for other users */}
      {editId && doc?.checkedOutBy && !isCheckedOut && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-400 text-sm">
          <Lock className="w-4 h-4 shrink-0" />
          <span>
            This document is currently checked out
            {checkedOutByName ? (
              <> by <span className="font-semibold">{checkedOutByName}</span></>
            ) : null}
            . You cannot edit it until it is checked in.
          </span>
        </div>
      )}

      {/* Moderation warning */}
      {moderationFlags.length > 0 && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Moderation flags — submission is blocked</p>
            <p className="mt-1 text-red-400/80">
              Flagged words: <span className="font-mono">{moderationFlags.join(', ')}</span>
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader title="Document Details" />
        <div className="space-y-4">
          <Input
            label="Title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setDirty(true)
            }}
            error={errors.title}
            disabled={!canEdit}
          />
          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Type"
              value={type}
              onChange={(e) => {
                setType(e.target.value)
                setDirty(true)
              }}
              disabled={!canEdit}
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select
              label="Category"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value)
                setDirty(true)
              }}
              error={errors.categoryId}
              disabled={!canEdit}
            >
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input
              label="Retention (years)"
              type="number"
              min="1"
              value={retentionYears}
              onChange={(e) => {
                setRetentionYears(e.target.value)
                setDirty(true)
              }}
              error={errors.retentionYears}
              disabled={!canEdit}
            />
          </div>
        </div>
      </Card>

      {/* Template picker — only for new documents */}
      {!editId && templates.length > 0 && (
        <Card>
          <CardHeader
            title="Start from Template"
            description="Pre-fill type, body, tags, and retention from a saved template."
          />
          <Select
            label="Template"
            value={templateId ?? ''}
            onChange={(e) => {
              if (e.target.value) handleApplyTemplate(e.target.value)
              else setTemplateId(undefined)
            }}
          >
            <option value="">None — start from scratch</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.type})
              </option>
            ))}
          </Select>
        </Card>
      )}

      <Card>
        <CardHeader title="Tags &amp; Metadata" />
        <div className="space-y-4">
          <Input
            label="Tags (comma-separated)"
            value={tagsInput}
            onChange={(e) => {
              setTagsInput(e.target.value)
              setDirty(true)
            }}
            placeholder="e.g. hr, compliance, finance"
            disabled={!canEdit}
          />
          <div>
            <p className="text-xs font-medium text-surface-400 mb-2">Custom metadata</p>
            <div className="space-y-2">
              {metadataRows.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    className="w-36 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500 disabled:opacity-50"
                    placeholder="Key"
                    value={row.key}
                    onChange={(e) => {
                      const next = [...metadataRows]
                      next[idx] = { ...row, key: e.target.value }
                      setMetadataRows(next)
                      setDirty(true)
                    }}
                    disabled={!canEdit}
                  />
                  <input
                    className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500 disabled:opacity-50"
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) => {
                      const next = [...metadataRows]
                      next[idx] = { ...row, value: e.target.value }
                      setMetadataRows(next)
                      setDirty(true)
                    }}
                    disabled={!canEdit}
                  />
                  {canEdit && (
                    <button
                      onClick={() => {
                        setMetadataRows(metadataRows.filter((_, i) => i !== idx))
                      }}
                      className="text-surface-500 hover:text-danger-400 shrink-0"
                      aria-label="Remove metadata row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMetadataRows([...metadataRows, { key: '', value: '' }])
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add field
                </Button>
              )}
            </div>
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
          disabled={!canEdit}
        />
      </Card>

      <Card>
        <CardHeader title="Attachments" description="Link URLs (optional)" />
        <div className="space-y-2">
          {attachmentUrls.map((url, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500 disabled:opacity-50"
                value={url}
                onChange={(e) => {
                  const next = [...attachmentUrls]
                  next[idx] = e.target.value
                  setAttachmentUrls(next)
                  setDirty(true)
                }}
                placeholder="https://example.com/file.pdf"
                disabled={!canEdit}
              />
              {attachmentUrls.length > 1 && canEdit && (
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
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAttachmentUrls([...attachmentUrls, ''])
              }}
            >
              + Add attachment
            </Button>
          )}
        </div>
      </Card>

      {canEdit && (
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => void handleSaveDraft()} isLoading={isLoading}>
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
      )}
    </div>
  )
}
