import { useState } from 'react'
import { Eye, EyeOff, Loader2, Lock, Mail, Shield, User, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/db'
import { hashPassword } from '@/crypto'
import { generateId } from '@/crypto'
import { Role } from '@/types'
import { useAuthStore } from '@/store/authStore'
import { writeAuditLog } from '@/utils/audit'

interface Props {
  onBackToLogin: () => void
}

interface FormState {
  username: string
  displayName: string
  email: string
  password: string
  confirm: string
}

const empty = (): FormState => ({
  username: '',
  displayName: '',
  email: '',
  password: '',
  confirm: '',
})

type TouchedState = Record<keyof FormState, boolean>

const allTouched: TouchedState = {
  username: true,
  displayName: true,
  email: true,
  password: true,
  confirm: true,
}

function validate(form: FormState) {
  const errors: Partial<Record<keyof FormState, string>> = {}
  if (!form.username.trim()) errors.username = 'Username is required'
  else if (!/^[a-z0-9_]{3,30}$/.test(form.username.trim()))
    errors.username = 'Lowercase letters, numbers, underscores only (3–30 chars)'

  if (!form.displayName.trim()) errors.displayName = 'Display name is required'

  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
    errors.email = 'Enter a valid email address'

  if (!form.password) errors.password = 'Password is required'
  else if (form.password.length < 12) errors.password = 'At least 12 characters required'

  if (!form.confirm) errors.confirm = 'Please confirm your password'
  else if (form.confirm !== form.password) errors.confirm = 'Passwords do not match'

  return errors
}

export function RegisterPage({ onBackToLogin }: Props) {
  const [form, setForm] = useState(empty())
  const [touched, setTouched] = useState<TouchedState>({
    username: false,
    displayName: false,
    email: false,
    password: false,
    confirm: false,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const errors = validate(form)

  const field = (name: keyof FormState) => ({
    value: form[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [name]: e.target.value }))
    },
    onBlur: () => {
      setTouched((t) => ({ ...t, [name]: true }))
    },
    'aria-invalid': touched[name] && !!errors[name],
  })

  const inputClass = (name: keyof FormState) =>
    [
      'w-full pl-10 pr-4 py-2.5 bg-surface-800 border rounded-xl',
      'text-surface-100 placeholder:text-surface-600 text-sm',
      'outline-none transition-colors',
      'focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50',
      touched[name] && errors[name] ? 'border-red-500/70' : 'border-surface-700',
    ].join(' ')

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setTouched(allTouched)

    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)
    try {
      const username = form.username.trim().toLowerCase()

      // Check username uniqueness
      const existing = await db.users.where('username').equals(username).first()
      if (existing) {
        toast.error('Username already taken — choose another')
        setIsSubmitting(false)
        return
      }

      const { hash, salt } = await hashPassword(form.password)
      const now = Date.now()
      const id = generateId()

      await db.users.add({
        id,
        username,
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        passwordHash: hash,
        passwordSalt: salt,
        role: Role.Participant,
        isActive: true,
        isTemporaryPassword: false,
        createdAt: now,
        updatedAt: now,
        createdBy: 'self',
      })

      await writeAuditLog({
        eventType: 'user.created',
        actorId: id,
        actorName: form.displayName.trim(),
        entityType: 'User',
        entityId: id,
        description: `Buyer account self-registered: ${username}`,
      })

      toast.success('Account created! Signing you in…')
      await useAuthStore.getState().login(username, form.password)
    } catch {
      toast.error('Registration failed — please try again')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* ── Branding ─────────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-600 mb-4 shadow-lg">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-surface-50 tracking-tight">Meridian Portal</h1>
          <p className="text-surface-500 text-sm mt-1">Create a Buyer Account</p>
        </div>

        {/* ── Card ─────────────────────────────────────────────────────── */}
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-8 shadow-xl">
          <div className="flex items-center gap-2 mb-6">
            <UserPlus className="w-4 h-4 text-primary-400" />
            <h2 className="text-base font-semibold text-surface-200">Register as a Buyer</h2>
          </div>

          <form
            onSubmit={(e) => {
              void handleSubmit(e)
            }}
            noValidate
            className="space-y-4"
          >
            {/* Username */}
            <div>
              <label
                htmlFor="reg-username"
                className="block text-sm font-medium text-surface-400 mb-1.5"
              >
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-600 pointer-events-none" />
                <input
                  id="reg-username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  placeholder="e.g. john_doe"
                  {...field('username')}
                  className={inputClass('username')}
                />
              </div>
              {touched.username && errors.username && (
                <p className="text-red-400 text-xs mt-1.5">{errors.username}</p>
              )}
            </div>

            {/* Display name */}
            <div>
              <label
                htmlFor="reg-display"
                className="block text-sm font-medium text-surface-400 mb-1.5"
              >
                Display Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-600 pointer-events-none" />
                <input
                  id="reg-display"
                  type="text"
                  autoComplete="name"
                  placeholder="Your full name"
                  {...field('displayName')}
                  className={inputClass('displayName')}
                />
              </div>
              {touched.displayName && errors.displayName && (
                <p className="text-red-400 text-xs mt-1.5">{errors.displayName}</p>
              )}
            </div>

            {/* Email (optional) */}
            <div>
              <label
                htmlFor="reg-email"
                className="block text-sm font-medium text-surface-400 mb-1.5"
              >
                Email <span className="text-surface-600">(optional)</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-600 pointer-events-none" />
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  {...field('email')}
                  className={inputClass('email')}
                />
              </div>
              {touched.email && errors.email && (
                <p className="text-red-400 text-xs mt-1.5">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="reg-password"
                className="block text-sm font-medium text-surface-400 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-600 pointer-events-none" />
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Min. 12 characters"
                  {...field('password')}
                  className={[inputClass('password'), 'pr-10'].join(' ')}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowPassword((v) => !v)
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-600 hover:text-surface-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {touched.password && errors.password && (
                <p className="text-red-400 text-xs mt-1.5">{errors.password}</p>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label
                htmlFor="reg-confirm"
                className="block text-sm font-medium text-surface-400 mb-1.5"
              >
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-600 pointer-events-none" />
                <input
                  id="reg-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  {...field('confirm')}
                  className={[inputClass('confirm'), 'pr-10'].join(' ')}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirm((v) => !v)
                  }}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-600 hover:text-surface-300 transition-colors"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {touched.confirm && errors.confirm && (
                <p className="text-red-400 text-xs mt-1.5">{errors.confirm}</p>
              )}
            </div>

            {/* Role badge */}
            <div className="flex items-center gap-2 py-2.5 px-3 rounded-xl bg-surface-800/60 border border-surface-700">
              <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
              <span className="text-surface-400 text-xs">Account type: </span>
              <span className="text-blue-300 text-xs font-medium">Buyer (Participant)</span>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={[
                'w-full py-2.5 rounded-xl text-sm font-semibold text-white mt-2',
                'bg-primary-600 hover:bg-primary-500 active:bg-primary-700',
                'transition-colors focus:outline-none',
                'focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-900',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-2',
              ].join(' ')}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Back to login */}
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={onBackToLogin}
              className="text-sm text-surface-500 hover:text-primary-400 transition-colors"
            >
              Already have an account? <span className="font-medium">Sign in</span>
            </button>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <p className="text-center text-surface-700 text-xs mt-6">
          100% offline system · All data stored locally in your browser
        </p>
      </div>
    </div>
  )
}
