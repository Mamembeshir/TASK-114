/**
 * ForcePasswordChangePage — shown immediately after login when
 * `currentUser.isTemporaryPassword === true`.
 *
 * The user cannot access the app until they set a new password.
 */

import { useState } from 'react'
import { Eye, EyeOff, Lock, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/db'
import { hashPassword, verifyPassword } from '@/crypto'
import { writeAuditLog } from '@/utils/audit'
import { useAuthStore } from '@/store/authStore'

function validate(
  current: string,
  next: string,
  confirm: string,
): Partial<Record<'current' | 'next' | 'confirm', string>> {
  const e: Partial<Record<'current' | 'next' | 'confirm', string>> = {}
  if (!current) e.current = 'Current password is required'
  if (!next) e.next = 'New password is required'
  else if (next.length < 12) e.next = 'At least 12 characters required'
  else if (next === current) e.next = 'New password must differ from the current one'
  if (!confirm) e.confirm = 'Please confirm your new password'
  else if (confirm !== next) e.confirm = 'Passwords do not match'
  return e
}

export function ForcePasswordChangePage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const logout = useAuthStore((s) => s.logout)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [touched, setTouched] = useState({ current: false, next: false, confirm: false })
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!currentUser) return null

  const errors = validate(current, next, confirm)

  const inputClass = (name: 'current' | 'next' | 'confirm') =>
    [
      'w-full pl-10 pr-10 py-2.5 bg-surface-800 border rounded-xl',
      'text-surface-100 placeholder:text-surface-600 text-sm',
      'outline-none transition-colors',
      'focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50',
      touched[name] && errors[name] ? 'border-red-500/70' : 'border-surface-700',
    ].join(' ')

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setTouched({ current: true, next: true, confirm: true })
    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)
    try {
      // Verify current password
      const valid = await verifyPassword(
        current,
        currentUser.passwordHash,
        currentUser.passwordSalt,
      )
      if (!valid) {
        toast.error('Current password is incorrect')
        setIsSubmitting(false)
        return
      }

      const { hash, salt } = await hashPassword(next)
      const now = Date.now()
      await db.users.update(currentUser.id, {
        passwordHash: hash,
        passwordSalt: salt,
        isTemporaryPassword: false,
        updatedAt: now,
      })

      await writeAuditLog({
        eventType: 'user.password_reset',
        actorId: currentUser.id,
        actorName: currentUser.displayName,
        entityType: 'User',
        entityId: currentUser.id,
        description: `${currentUser.displayName} changed their password (forced on first login)`,
      })

      // Refresh current user in the store
      const updated = await db.users.get(currentUser.id)
      if (updated) useAuthStore.setState({ currentUser: updated })

      toast.success('Password updated — welcome to Meridian Portal!')
    } catch {
      toast.error('Failed to update password — please try again')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-600 mb-4 shadow-lg">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-surface-50 tracking-tight">Meridian Portal</h1>
          <p className="text-surface-500 text-sm mt-1">Security · Change Required</p>
        </div>

        {/* Card */}
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-8 shadow-xl">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-surface-200">Set a new password</h2>
            <p className="text-surface-500 text-sm mt-1">
              Your account uses a temporary password. Please set a permanent password before
              continuing.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              void handleSubmit(e)
            }}
            noValidate
            className="space-y-4"
          >
            {/* Current password */}
            <div>
              <label
                htmlFor="fp-current"
                className="block text-sm font-medium text-surface-400 mb-1.5"
              >
                Current password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-600 pointer-events-none" />
                <input
                  id="fp-current"
                  type={showCurrent ? 'text' : 'password'}
                  autoFocus
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => {
                    setCurrent(e.target.value)
                  }}
                  onBlur={() => {
                    setTouched((t) => ({ ...t, current: true }))
                  }}
                  placeholder="Your current password"
                  className={inputClass('current')}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowCurrent((v) => !v)
                  }}
                  aria-label={showCurrent ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-600 hover:text-surface-300 transition-colors"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {touched.current && errors.current && (
                <p className="text-red-400 text-xs mt-1.5">{errors.current}</p>
              )}
            </div>

            {/* New password */}
            <div>
              <label
                htmlFor="fp-next"
                className="block text-sm font-medium text-surface-400 mb-1.5"
              >
                New password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-600 pointer-events-none" />
                <input
                  id="fp-next"
                  type={showNext ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => {
                    setNext(e.target.value)
                  }}
                  onBlur={() => {
                    setTouched((t) => ({ ...t, next: true }))
                  }}
                  placeholder="Min. 12 characters"
                  className={inputClass('next')}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowNext((v) => !v)
                  }}
                  aria-label={showNext ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-600 hover:text-surface-300 transition-colors"
                >
                  {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {touched.next && errors.next && (
                <p className="text-red-400 text-xs mt-1.5">{errors.next}</p>
              )}
            </div>

            {/* Confirm */}
            <div>
              <label
                htmlFor="fp-confirm"
                className="block text-sm font-medium text-surface-400 mb-1.5"
              >
                Confirm new password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-600 pointer-events-none" />
                <input
                  id="fp-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value)
                  }}
                  onBlur={() => {
                    setTouched((t) => ({ ...t, confirm: true }))
                  }}
                  placeholder="Repeat new password"
                  className={inputClass('confirm')}
                />
              </div>
              {touched.confirm && errors.confirm && (
                <p className="text-red-400 text-xs mt-1.5">{errors.confirm}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={[
                'w-full py-2.5 rounded-xl text-sm font-semibold text-white mt-2',
                'bg-primary-600 hover:bg-primary-500 active:bg-primary-700',
                'transition-colors focus:outline-none',
                'focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-900',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              {isSubmitting ? 'Saving…' : 'Set New Password'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => {
                void logout()
              }}
              className="text-sm text-surface-600 hover:text-surface-400 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>

        <p className="text-center text-surface-700 text-xs mt-6">
          100% offline system · All data stored locally in your browser
        </p>
      </div>
    </div>
  )
}
