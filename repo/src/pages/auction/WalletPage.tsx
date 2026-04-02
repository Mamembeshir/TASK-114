import { useEffect, useState } from 'react'
import { Wallet as WalletIcon } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/db'
import { creditWallet, debitWallet, ensureWallet } from '@/services/walletService'
import { useAuthStore } from '@/store/authStore'
import { usePermission } from '@/hooks/usePermission'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  Skeleton,
  Table,
} from '@/components/ui'
import type { ColumnDef } from '@/components/ui'
import type { Wallet, WalletTransaction } from '@/types'

export function WalletPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const canManageWallets = usePermission('manageWallets')

  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Admin credit/debit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState<'credit' | 'debit'>('credit')
  const [targetUserId, setTargetUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const load = async (userId: string) => {
    await ensureWallet(userId)
    const [w, txns] = await Promise.all([
      db.wallets.where('userId').equals(userId).first(),
      db.walletTransactions.where('userId').equals(userId).sortBy('createdAt'),
    ])
    setWallet(w ?? null)
    setTransactions(txns.reverse())
    setIsLoading(false)
  }

  useEffect(() => {
    if (currentUser) void load(currentUser.id)
  }, [currentUser])

  if (!currentUser) return null

  const available = (wallet?.balance ?? 0) - (wallet?.reservedAmount ?? 0)

  const txColumns: ColumnDef<WalletTransaction>[] = [
    {
      key: 'type',
      header: 'Type',
      width: 'w-32',
      cell: (t) => {
        const variant =
          t.type === 'Credit'
            ? ('success' as const)
            : t.type === 'Debit' || t.type === 'DepositDeducted'
              ? ('danger' as const)
              : t.type === 'Reserve'
                ? ('warning' as const)
                : ('default' as const)
        return <Badge variant={variant}>{t.type}</Badge>
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      width: 'w-24',
      cell: (t) => (
        <span
          className={[
            'font-mono text-sm font-semibold',
            t.type === 'Credit'
              ? 'text-emerald-400'
              : t.type === 'Debit' || t.type === 'DepositDeducted'
                ? 'text-red-400'
                : 'text-surface-400',
          ].join(' ')}
        >
          {['Credit'].includes(t.type) ? '+' : '-'}
          {t.amount}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      cell: (t) => <span className="text-surface-400 text-xs">{t.description}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      width: 'w-32',
      cell: (t) => (
        <span className="text-surface-600 text-xs">{new Date(t.createdAt).toLocaleString()}</span>
      ),
    },
  ]

  const handleAdminAction = async () => {
    const amt = Number(amount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    if (!targetUserId.trim()) {
      toast.error('User ID is required')
      return
    }
    if (!description.trim()) {
      toast.error('Description is required')
      return
    }

    setIsSubmitting(true)
    try {
      if (modalType === 'credit') {
        await creditWallet(targetUserId, amt, description, currentUser.id)
        toast.success('Wallet credited')
      } else {
        await debitWallet(targetUserId, amt, description, currentUser.id)
        toast.success('Wallet debited')
      }
      setModalOpen(false)
      setAmount('')
      setDescription('')
      void load(currentUser.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-lg font-semibold text-surface-100">My Wallet</h1>

      {/* Balance cards */}
      <div className="grid grid-cols-3 gap-4">
        {(['Balance', 'Reserved', 'Available'] as const).map((label) => {
          const value =
            label === 'Balance'
              ? wallet?.balance
              : label === 'Reserved'
                ? wallet?.reservedAmount
                : available
          return (
            <Card key={label}>
              <p className="text-xs text-surface-500 mb-1">{label}</p>
              {isLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <p
                  className={[
                    'text-2xl font-bold font-mono',
                    label === 'Available' ? 'text-emerald-400' : 'text-surface-100',
                  ].join(' ')}
                >
                  {value ?? 0}
                </p>
              )}
            </Card>
          )
        })}
      </div>

      {/* Admin actions */}
      {canManageWallets && (
        <Card>
          <CardHeader
            title="Admin Actions"
            description="Manually credit or debit participant wallets"
          />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setModalType('credit')
                setModalOpen(true)
              }}
            >
              Credit Wallet
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setModalType('debit')
                setModalOpen(true)
              }}
            >
              Debit Wallet
            </Button>
          </div>
        </Card>
      )}

      {/* Transaction history */}
      <Card padded={false}>
        <div className="p-4 border-b border-surface-800">
          <h2 className="text-sm font-semibold text-surface-200">Transaction History</h2>
        </div>
        {transactions.length === 0 && !isLoading ? (
          <EmptyState
            icon={WalletIcon}
            title="No transactions yet"
            description="Your wallet activity will appear here."
          />
        ) : (
          <Table
            columns={txColumns}
            data={transactions}
            rowKey={(t) => t.id}
            isLoading={isLoading}
          />
        )}
      </Card>

      {/* Admin credit/debit modal */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
        }}
        title={modalType === 'credit' ? 'Credit Wallet' : 'Debit Wallet'}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setModalOpen(false)
              }}
            >
              Cancel
            </Button>
            <Button
              variant={modalType === 'credit' ? 'primary' : 'danger'}
              isLoading={isSubmitting}
              onClick={() => {
                void handleAdminAction()
              }}
            >
              {modalType === 'credit' ? 'Credit' : 'Debit'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="User ID"
            value={targetUserId}
            onChange={(e) => {
              setTargetUserId(e.target.value)
            }}
            placeholder="Paste the user's ID"
          />
          <Input
            label="Amount"
            type="number"
            min={1}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
            }}
            placeholder="100"
          />
          <Input
            label="Description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
            }}
            placeholder="Reason for adjustment"
          />
        </div>
      </Modal>
    </div>
  )
}
