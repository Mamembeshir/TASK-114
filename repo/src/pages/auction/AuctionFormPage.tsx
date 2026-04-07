/**
 * AuctionFormPage — create a new auction or edit an existing Draft.
 * Props passed via tab metadata (editId for edit mode).
 */
import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { db } from '@/db'
import { createAuction, updateAuction, publishAuction } from '@/services/auctionService'
import { DEFAULT_INCREMENT_TIERS } from '@/utils/increment'
import { useTabStore } from '@/store/tabStore'
import { Button, Input, Select, Textarea, Card, CardHeader } from '@/components/ui'
import type { Category, IncrementTier } from '@/types'

interface Props {
  /** If provided, loads the existing Draft for editing */
  editId?: string
  tabId?: string
}

function toDatetimeLocal(ts: number): string {
  const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

function fromDatetimeLocal(value: string): number {
  return new Date(value).getTime()
}

export function AuctionFormPage({ editId, tabId }: Props) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { markDirty, closeTab } = useTabStore()

  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Form fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [startPrice, setStartPrice] = useState('')
  const [minimumIncrement, setMinimumIncrement] = useState('10')
  const [useTiers, setUseTiers] = useState(false)
  // Tier rows stored as editable strings; converted to numbers on save
  const [tiers, setTiers] = useState<Array<{ upTo: string; increment: string }>>(
    DEFAULT_INCREMENT_TIERS.map((t) => ({
      upTo: t.upTo === null ? '' : String(t.upTo),
      increment: String(t.increment),
    })),
  )
  const [depositAmount, setDepositAmount] = useState('')
  const [depositUserEdited, setDepositUserEdited] = useState(false)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Track dirty state for tab unsaved-changes warning
  const isDirty = useRef(false)
  const setDirty = (v: boolean) => {
    isDirty.current = v
    if (tabId) markDirty(tabId, v)
  }

  useEffect(() => {
    void db.categories.toArray().then(setCategories)
    // Seed minimumIncrement from admin-configured default for new auctions.
    // Edit mode overwrites this via the separate editId effect below.
    if (!editId) {
      void db.systemConfig.get('singleton').then((cfg) => {
        if (cfg && cfg.defaultMinimumIncrement > 0) {
          setMinimumIncrement(String(cfg.defaultMinimumIncrement))
        }
      })
    }
  }, [editId])

  // Auto-compute default deposit when start price changes (10% of start, min $50)
  // Only applies when the user has not manually overridden the deposit field.
  useEffect(() => {
    if (depositUserEdited || editId) return
    const sp = Number(startPrice)
    if (!isNaN(sp) && sp > 0) {
      setDepositAmount(String(Math.max(50, Math.round(sp * 0.1))))
    }
  }, [startPrice, depositUserEdited, editId])

  // Load existing auction for edit mode
  useEffect(() => {
    if (!editId) return
    void db.auctions.get(editId).then((auction) => {
      if (!auction) return
      setTitle(auction.title)
      setDescription(auction.description)
      setCategoryId(auction.categoryId)
      setStartPrice(String(auction.startPrice))
      setMinimumIncrement(String(auction.minimumIncrement))
      if (auction.incrementTiers && auction.incrementTiers.length > 0) {
        setUseTiers(true)
        setTiers(
          auction.incrementTiers.map((t) => ({
            upTo: t.upTo === null ? '' : String(t.upTo),
            increment: String(t.increment),
          })),
        )
      }
      setDepositAmount(String(auction.depositAmount))
      setDepositUserEdited(true) // treat loaded value as user-confirmed
      setStartTime(toDatetimeLocal(auction.startTime))
      setEndTime(toDatetimeLocal(auction.endTime))
    })
  }, [editId])

  if (!currentUser) return null

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Title is required'
    if (!categoryId) e.categoryId = 'Category is required'
    const sp = Number(startPrice)
    if (isNaN(sp) || sp < 0) e.startPrice = 'Enter a valid start price'
    if (!useTiers) {
      const mi = Number(minimumIncrement)
      if (isNaN(mi) || mi <= 0) e.minimumIncrement = 'Minimum increment must be positive'
    } else {
      // Validate tier table
      if (tiers.length === 0) {
        e.tiers = 'Add at least one tier'
      } else {
        for (let i = 0; i < tiers.length; i++) {
          const inc = Number(tiers[i]?.increment)
          if (isNaN(inc) || inc <= 0) {
            e.tiers = `Tier ${String(i + 1)}: increment must be positive`
            break
          }
          const upTo = tiers[i]?.upTo
          if (i < tiers.length - 1 && (upTo === '' || isNaN(Number(upTo)))) {
            e.tiers = `Tier ${String(i + 1)}: upper bound is required for all tiers except the last`
            break
          }
          if (i > 0) {
            const prevUpTo = Number(tiers[i - 1]?.upTo)
            const curUpTo = Number(upTo)
            if (upTo !== '' && !isNaN(curUpTo) && curUpTo <= prevUpTo) {
              e.tiers = `Tier ${String(i + 1)}: upper bound must be greater than the previous tier`
              break
            }
          }
        }
        // Ensure last tier has empty upTo (open-ended)
        if (!e.tiers && tiers[tiers.length - 1]?.upTo !== '') {
          e.tiers = 'The last tier must have a blank "Up to" value (open-ended catch-all)'
        }
      }
    }
    const da = Number(depositAmount)
    if (isNaN(da) || da < 0) e.depositAmount = 'Enter a valid deposit amount'
    if (!startTime) e.startTime = 'Start time is required'
    if (!endTime) e.endTime = 'End time is required'
    if (startTime && endTime && fromDatetimeLocal(endTime) <= fromDatetimeLocal(startTime)) {
      e.endTime = 'End time must be after start time'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const buildIncrementTiers = (): IncrementTier[] | undefined => {
    if (!useTiers) return undefined
    return tiers.map((t) => ({
      upTo: t.upTo === '' ? null : Number(t.upTo),
      increment: Number(t.increment),
    }))
  }

  const handleSave = async (andPublish = false) => {
    if (!validate()) return
    setIsLoading(true)
    try {
      const input = {
        title: title.trim(),
        description: description.trim(),
        categoryId,
        imageUrls: [],
        startPrice: Number(startPrice),
        minimumIncrement: Number(minimumIncrement) || 1,
        incrementTiers: buildIncrementTiers(),
        depositAmount: Number(depositAmount),
        startTime: fromDatetimeLocal(startTime),
        endTime: fromDatetimeLocal(endTime),
      }

      if (editId) {
        await updateAuction(editId, input)
        if (andPublish) {
          await publishAuction(editId)
          toast.success('Auction published!')
        } else {
          toast.success('Auction saved')
        }
      } else {
        const auction = await createAuction(input)
        if (andPublish) {
          await publishAuction(auction.id)
          toast.success('Auction created and published!')
        } else {
          toast.success('Auction saved as Draft')
        }
      }

      setDirty(false)
      if (tabId) closeTab(tabId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save auction')
    } finally {
      setIsLoading(false)
    }
  }

  const fieldChange =
    (setter: (v: string) => void) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setter(e.target.value)
      setDirty(true)
    }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">
          {editId ? 'Edit Auction' : 'New Auction'}
        </h1>
        <p className="text-sm text-surface-500 mt-0.5">
          {editId
            ? 'Update the draft auction details below.'
            : 'Fill in the details to create a new auction listing.'}
        </p>
      </div>

      <Card>
        <CardHeader title="Auction Details" />
        <div className="space-y-4">
          <Input
            label="Title"
            id="title"
            value={title}
            onChange={fieldChange(setTitle)}
            error={errors.title}
            placeholder="e.g. 2022 Office Server Rack"
          />
          <Textarea
            label="Description"
            id="description"
            value={description}
            onChange={fieldChange(setDescription)}
            placeholder="Describe the item(s) being auctioned..."
            rows={4}
          />
          <Select
            label="Category"
            id="category"
            value={categoryId}
            onChange={fieldChange(setCategoryId)}
            error={errors.categoryId}
          >
            <option value="">Select a category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card>
        <CardHeader title="Pricing & Timing" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="Start price"
            id="startPrice"
            type="number"
            min={0}
            step={1}
            value={startPrice}
            onChange={fieldChange(setStartPrice)}
            error={errors.startPrice}
            placeholder="0"
          />
          {!useTiers ? (
            <Input
              label="Min increment"
              id="minimumIncrement"
              type="number"
              min={1}
              step={1}
              value={minimumIncrement}
              onChange={fieldChange(setMinimumIncrement)}
              error={errors.minimumIncrement}
              placeholder="10"
            />
          ) : (
            <div className="sm:col-span-2" />
          )}
          <Input
            label="Deposit amount"
            id="depositAmount"
            type="number"
            min={0}
            step={1}
            value={depositAmount}
            onChange={(e) => {
              setDepositUserEdited(true)
              fieldChange(setDepositAmount)(e)
            }}
            error={errors.depositAmount}
            hint="Default: 10% of start price, min $50"
          />
        </div>
        {/* Tiered increment toggle + editor */}
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={useTiers}
              onChange={(e) => {
                setUseTiers(e.target.checked)
                setDirty(true)
              }}
              className="accent-primary-600"
            />
            <span className="text-sm text-surface-300">Use tiered increment rules by price band</span>
          </label>

          {useTiers && (
            <div className="space-y-2">
              <p className="text-xs text-surface-500">
                Tiers are evaluated in order. The last row must have a blank "Up to" value
                (open-ended catch-all for any price above the preceding band).
              </p>
              <div className="space-y-1.5">
                {tiers.map((tier, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-32">
                      <Input
                        label={i === 0 ? 'Up to (price)' : ''}
                        type="number"
                        min={1}
                        step={1}
                        value={tier.upTo}
                        placeholder={i === tiers.length - 1 ? '∞ (leave blank)' : 'e.g. 500'}
                        onChange={(e) => {
                          const next = [...tiers]
                          next[i] = { ...tier, upTo: e.target.value }
                          setTiers(next)
                          setDirty(true)
                        }}
                      />
                    </div>
                    <div className="w-28">
                      <Input
                        label={i === 0 ? 'Increment' : ''}
                        type="number"
                        min={1}
                        step={1}
                        value={tier.increment}
                        placeholder="e.g. 25"
                        onChange={(e) => {
                          const next = [...tiers]
                          next[i] = { ...tier, increment: e.target.value }
                          setTiers(next)
                          setDirty(true)
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTiers(tiers.filter((_, idx) => idx !== i))
                        setDirty(true)
                      }}
                      className={`text-surface-500 hover:text-red-400 transition-colors ${i === 0 ? 'mt-5' : ''}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              {errors.tiers && <p className="text-xs text-red-400">{errors.tiers}</p>}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTiers([...tiers, { upTo: '', increment: '10' }])
                  setDirty(true)
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add tier
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Input
            label="Start time"
            id="startTime"
            type="datetime-local"
            value={startTime}
            onChange={fieldChange(setStartTime)}
            error={errors.startTime}
          />
          <Input
            label="End time"
            id="endTime"
            type="datetime-local"
            value={endTime}
            onChange={fieldChange(setEndTime)}
            error={errors.endTime}
          />
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            void handleSave(false)
          }}
          isLoading={isLoading}
        >
          Save as Draft
        </Button>
        <Button
          onClick={() => {
            void handleSave(true)
          }}
          isLoading={isLoading}
        >
          {editId ? 'Save & Publish' : 'Create & Publish'}
        </Button>
      </div>
    </div>
  )
}
