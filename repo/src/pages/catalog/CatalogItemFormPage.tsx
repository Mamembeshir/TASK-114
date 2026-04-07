/**
 * CatalogItemFormPage — create a new catalog item or edit an existing Draft.
 */
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { db } from '@/db'
import { createCatalogItem, updateCatalogItem, publishCatalogItem } from '@/services/catalogService'
import { Button, Card, CardHeader, Input, Select, Textarea } from '@/components/ui'
import type { Category } from '@/types'

interface Props {
  editId?: string
  tabId?: string
}

export function CatalogItemFormPage({ editId, tabId }: Props) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { markDirty, closeTab } = useTabStore()

  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [imageUrls, setImageUrls] = useState([''])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [moderationFlags, setModerationFlags] = useState<string[]>([])

  const isDirty = useRef(false)
  const setDirty = (v: boolean) => {
    isDirty.current = v
    if (tabId) markDirty(tabId, v)
  }

  useEffect(() => {
    void db.categories.toArray().then(setCategories)
  }, [])

  useEffect(() => {
    if (!editId) return
    void db.catalogItems.get(editId).then((item) => {
      if (!item) return
      setTitle(item.title)
      setDescription(item.description)
      setCategoryId(item.categoryId)
      setPrice(String(item.price))
      setStock(String(item.stock))
      setTags(item.tags)
      setImageUrls(item.imageUrls.length ? item.imageUrls : [''])
      setModerationFlags(item.moderationFlags)
    })
  }, [editId])

  if (!currentUser) return null

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Title is required'
    if (!categoryId) e.categoryId = 'Category is required'
    const p = Number(price)
    if (!price || isNaN(p) || p < 0) e.price = 'Price must be a non-negative number'
    const s = Number(stock)
    if (!stock || isNaN(s) || s < 0 || !Number.isInteger(s))
      e.stock = 'Stock must be a non-negative integer'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const buildInput = () => ({
    title: title.trim(),
    description: description.trim(),
    categoryId,
    tags,
    price: Number(price),
    stock: Number(stock),
    imageUrls: imageUrls.filter((u) => u.trim()),
  })

  const refreshFlags = async (id: string) => {
    const fresh = await db.catalogItems.get(id)
    if (fresh) setModerationFlags(fresh.moderationFlags)
  }

  const handleSaveDraft = async () => {
    if (!validate()) return
    setIsLoading(true)
    try {
      if (editId) {
        await updateCatalogItem(editId, buildInput())
        await refreshFlags(editId)
        toast.success('Item updated')
      } else {
        const item = await createCatalogItem(buildInput())
        setModerationFlags(item.moderationFlags)
        if (item.moderationFlags.length > 0) {
          toast.warning('Draft saved with moderation flags — resolve before publishing')
        } else {
          toast.success('Draft saved')
        }
        setDirty(false)
        if (tabId) closeTab(tabId)
        // Reopen as edit tab
        useTabStore.getState().openTab({
          id: `catalog-edit-${item.id}`,
          title: item.title,
          path: `/catalog/${item.id}/edit`,
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

  const handlePublish = async () => {
    if (!validate()) return
    setIsLoading(true)
    try {
      let id = editId
      if (!id) {
        const item = await createCatalogItem(buildInput())
        id = item.id
      } else {
        await updateCatalogItem(id, buildInput())
      }
      await publishCatalogItem(id)
      toast.success('Item published successfully')
      setDirty(false)
      if (tabId) closeTab(tabId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish')
    } finally {
      setIsLoading(false)
    }
  }

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t)) {
      const next = [...tags, t]
      setTags(next)
      setDirty(true)
    }
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
    setDirty(true)
  }

  const updateImageUrl = (idx: number, value: string) => {
    const next = [...imageUrls]
    next[idx] = value
    setImageUrls(next)
    setDirty(true)
  }

  const addImageUrl = () => {
    setImageUrls([...imageUrls, ''])
  }
  const removeImageUrl = (idx: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== idx))
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-surface-50">
        {editId ? 'Edit Catalog Item' : 'New Catalog Item'}
      </h1>

      {moderationFlags.length > 0 && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Moderation flags detected — publishing is blocked</p>
            <p className="mt-1 text-red-400/80">
              Remove or replace the following flagged words:{' '}
              <span className="font-mono">{moderationFlags.join(', ')}</span>
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader title="Item Details" />
        <div className="space-y-4">
          <Input
            label="Title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setDirty(true)
            }}
            error={errors.title}
            placeholder="Enter item title"
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              setDirty(true)
            }}
            rows={4}
            placeholder="Describe the item"
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Category"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value)
                setDirty(true)
              }}
              error={errors.categoryId}
            >
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input
              label="Stock"
              type="number"
              min="0"
              step="1"
              value={stock}
              onChange={(e) => {
                setStock(e.target.value)
                setDirty(true)
              }}
              error={errors.stock}
              placeholder="0"
            />
          </div>
          <Input
            label="Price"
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value)
              setDirty(true)
            }}
            error={errors.price}
            placeholder="0.00"
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Tags" description="Press Enter or comma to add a tag" />
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500"
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addTag()
                }
              }}
              placeholder="Add a tag…"
            />
            <Button variant="secondary" size="sm" onClick={addTag}>
              Add
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-600/20 text-primary-300 border border-primary-600/30"
                >
                  {tag}
                  <button
                    onClick={() => {
                      removeTag(tag)
                    }}
                    className="text-primary-400 hover:text-primary-200 ml-0.5"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Images" description="Paste image URLs (optional)" />
        <div className="space-y-2">
          {imageUrls.map((url, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500"
                value={url}
                onChange={(e) => {
                  updateImageUrl(idx, e.target.value)
                }}
                placeholder="https://example.com/image.jpg"
              />
              {imageUrls.length > 1 && (
                <button
                  onClick={() => {
                    removeImageUrl(idx)
                  }}
                  className="text-surface-500 hover:text-danger-400"
                  aria-label="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addImageUrl}>
            + Add another image
          </Button>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => void handleSaveDraft()} isLoading={isLoading}>
          Save Draft
        </Button>
        <Button
          variant="primary"
          onClick={() => void handlePublish()}
          isLoading={isLoading}
          disabled={moderationFlags.length > 0}
        >
          {editId ? 'Save & Publish' : 'Create & Publish'}
        </Button>
      </div>
    </div>
  )
}
