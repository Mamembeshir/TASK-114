/**
 * SystemSettingsPage — org name, document numbering prefix, retention defaults,
 * auction anti-sniping config. Admin only.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { db } from '@/db'
import { saveSystemConfig } from '@/services/adminConfigService'
import { Button, Card, CardHeader, Input, Spinner } from '@/components/ui'
import type { SystemConfig } from '@/types'

type EditableConfig = Omit<SystemConfig, 'id' | 'documentNumberCounter' | 'updatedAt' | 'updatedBy'>

const DEFAULTS: EditableConfig = {
  orgName: 'Meridian',
  documentNumberPrefix: 'ORG',
  defaultRetentionYears: 7,
  antiSnipingWindowSeconds: 30,
  antiSnipingExtensionMinutes: 2,
  defaultMinimumIncrement: 100,
}

export function SystemSettingsPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const [config, setConfig] = useState(DEFAULTS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const cfg = await db.systemConfig.get('singleton')
    if (cfg) {
      setConfig({
        orgName: cfg.orgName,
        orgLogo: cfg.orgLogo,
        documentNumberPrefix: cfg.documentNumberPrefix,
        defaultRetentionYears: cfg.defaultRetentionYears,
        antiSnipingWindowSeconds: cfg.antiSnipingWindowSeconds,
        antiSnipingExtensionMinutes: cfg.antiSnipingExtensionMinutes,
        defaultMinimumIncrement: cfg.defaultMinimumIncrement,
      })
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!currentUser) return null

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!config.orgName.trim()) e.orgName = 'Required'
    if (!config.documentNumberPrefix.trim()) e.documentNumberPrefix = 'Required'
    if (config.defaultRetentionYears < 1) e.defaultRetentionYears = 'Must be ≥ 1'
    if (config.antiSnipingWindowSeconds < 1) e.antiSnipingWindowSeconds = 'Must be ≥ 1'
    if (config.antiSnipingExtensionMinutes < 1) e.antiSnipingExtensionMinutes = 'Must be ≥ 1'
    if (config.defaultMinimumIncrement < 1) e.defaultMinimumIncrement = 'Must be ≥ 1'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setIsSaving(true)
    try {
      await saveSystemConfig(config)
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">System Settings</h1>
        <p className="text-sm text-surface-500 mt-0.5">Global configuration for the portal</p>
      </div>

      <Card>
        <CardHeader title="Organisation" />
        <div className="space-y-4">
          <Input
            label="Organisation Name"
            value={config.orgName}
            onChange={(e) => {
              setConfig((c) => ({ ...c, orgName: e.target.value }))
            }}
            error={errors.orgName}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Document Numbering" />
        <div className="space-y-4">
          <Input
            label="Document Number Prefix"
            value={config.documentNumberPrefix}
            onChange={(e) => {
              setConfig((c) => ({ ...c, documentNumberPrefix: e.target.value }))
            }}
            error={errors.documentNumberPrefix}
            hint="e.g. ORG → generates ORG-2026-000001. Uppercase only."
          />
          <Input
            label="Default Retention Years"
            type="number"
            min="1"
            value={String(config.defaultRetentionYears)}
            onChange={(e) => {
              setConfig((c) => ({ ...c, defaultRetentionYears: Number(e.target.value) }))
            }}
            error={errors.defaultRetentionYears}
            hint="Default retention period applied when creating new documents."
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Auction Anti-Sniping"
          description="Auto-extend auctions when last-minute bids are placed."
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Sniping Window (seconds)"
            type="number"
            min="1"
            value={String(config.antiSnipingWindowSeconds)}
            onChange={(e) => {
              setConfig((c) => ({ ...c, antiSnipingWindowSeconds: Number(e.target.value) }))
            }}
            error={errors.antiSnipingWindowSeconds}
            hint="Bid placed within N seconds of end triggers extension."
          />
          <Input
            label="Extension Duration (minutes)"
            type="number"
            min="1"
            value={String(config.antiSnipingExtensionMinutes)}
            onChange={(e) => {
              setConfig((c) => ({ ...c, antiSnipingExtensionMinutes: Number(e.target.value) }))
            }}
            error={errors.antiSnipingExtensionMinutes}
            hint="Minutes added to end time. Triggered only once per auction."
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Auction Bidding" />
        <Input
          label="Default Minimum Increment"
          type="number"
          min="1"
          value={String(config.defaultMinimumIncrement)}
          onChange={(e) => {
            setConfig((c) => ({ ...c, defaultMinimumIncrement: Number(e.target.value) }))
          }}
          error={errors.defaultMinimumIncrement}
          hint="Default minimum bid increment applied to new auctions."
        />
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" onClick={() => void handleSave()} isLoading={isSaving}>
          Save Settings
        </Button>
      </div>
    </div>
  )
}
