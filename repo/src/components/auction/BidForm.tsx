import { useState } from 'react'
import { toast } from 'sonner'
import { Gavel, TrendingUp } from 'lucide-react'
import { generateId } from '@/crypto'
import { placeBid, setProxyBid } from '@/services/biddingEngine'
import { useAuthStore } from '@/store/authStore'
import { Button, Input } from '@/components/ui'
import type { Auction } from '@/types'

interface Props {
  auction: Auction
  /** Amount the current user already has reserved for this auction (0 if first bid) */
  userDepositHeld: number
  onBidPlaced: () => void
}

export function BidForm({ auction, userDepositHeld, onBidPlaced }: Props) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const [tab, setTab] = useState<'manual' | 'proxy'>('manual')
  const [amount, setAmount] = useState('')
  const [proxyMax, setProxyMax] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!currentUser) return null

  const minBid = auction.currentPrice + auction.minimumIncrement
  const isOpen = auction.status === 'Active' || auction.status === 'Extended'

  const handleManualBid = async () => {
    const parsed = Number(amount)
    if (isNaN(parsed) || parsed < minBid) {
      toast.error(`Minimum bid is ${String(minBid)}`)
      return
    }

    setIsSubmitting(true)
    try {
      const result = await placeBid(
        auction.id,
        currentUser.id,
        currentUser.displayName,
        parsed,
        generateId(),
        auction.depositAmount,
        userDepositHeld,
      )
      if (result.success) {
        toast.success(result.message)
        if (result.extended) toast.info('⏱ Auction extended by 2 minutes (anti-sniping)')
        setAmount('')
        onBidPlaced()
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('Failed to place bid. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleProxyBid = async () => {
    const parsed = Number(proxyMax)
    if (isNaN(parsed) || parsed <= auction.currentPrice) {
      toast.error(`Proxy max must exceed current price (${String(auction.currentPrice)})`)
      return
    }

    setIsSubmitting(true)
    try {
      const result = await setProxyBid(
        auction.id,
        currentUser.id,
        currentUser.displayName,
        parsed,
        auction.depositAmount,
        userDepositHeld,
      )
      if (result.success) {
        toast.success(result.message)
        setProxyMax('')
        onBidPlaced()
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('Failed to set proxy bid. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) {
    return (
      <div className="rounded-xl bg-surface-800/50 border border-surface-700 px-4 py-3 text-center text-sm text-surface-500">
        This auction is not currently accepting bids.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Tab toggle */}
      <div className="flex rounded-lg bg-surface-800 p-1 gap-1">
        {(['manual', 'proxy'] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t)
            }}
            className={[
              'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
              tab === t
                ? 'bg-surface-700 text-surface-100'
                : 'text-surface-500 hover:text-surface-300',
            ].join(' ')}
          >
            {t === 'manual' ? 'Manual Bid' : 'Proxy Bid'}
          </button>
        ))}
      </div>

      {tab === 'manual' ? (
        <div className="space-y-3">
          <Input
            label="Your bid"
            type="number"
            min={minBid}
            step={auction.minimumIncrement}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
            }}
            placeholder={`Min: ${String(minBid)}`}
            hint={`Current price: ${String(auction.currentPrice)} · Min increment: ${String(auction.minimumIncrement)}`}
            leftIcon={<Gavel className="w-4 h-4" />}
          />
          <Button
            className="w-full"
            isLoading={isSubmitting}
            onClick={() => {
              void handleManualBid()
            }}
          >
            Place Bid
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Input
            label="Maximum proxy amount"
            type="number"
            min={minBid}
            step={auction.minimumIncrement}
            value={proxyMax}
            onChange={(e) => {
              setProxyMax(e.target.value)
            }}
            placeholder={`Above ${String(auction.currentPrice)}`}
            hint="The engine will auto-bid on your behalf up to this amount"
            leftIcon={<TrendingUp className="w-4 h-4" />}
          />
          <Button
            className="w-full"
            variant="secondary"
            isLoading={isSubmitting}
            onClick={() => {
              void handleProxyBid()
            }}
          >
            Set Proxy Bid
          </Button>
        </div>
      )}

      <p className="text-xs text-surface-600 text-center">
        Deposit hold: {auction.depositAmount} · Deducted only on win
      </p>
    </div>
  )
}
