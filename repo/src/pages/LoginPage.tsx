import { useEffect, useState } from 'react'
import { Eye, EyeOff, Loader2, Lock, Shield, User } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'

interface Props {
  onRegister: () => void
}

export function LoginPage({ onRegister }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState({ username: false, password: false })

  const isLoading = useAuthStore((s) => s.isLoading)
  const error = useAuthStore((s) => s.error)

  // Surface store errors as toasts
  useEffect(() => {
    if (error) {
      toast.error(error)
      useAuthStore.getState().clearError()
    }
  }, [error])

  const usernameInvalid = touched.username && !username.trim()
  const passwordInvalid = touched.password && !password

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>): void => {
    e.preventDefault()
    setTouched({ username: true, password: true })
    if (!username.trim() || !password) return
    void useAuthStore.getState().login(username.trim(), password)
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
          <p className="text-surface-500 text-sm mt-1">Offline Commerce &amp; Compliance</p>
        </div>

        {/* ── Card ─────────────────────────────────────────────────────── */}
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-8 shadow-xl">
          <h2 className="text-base font-semibold text-surface-200 mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Username */}
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-surface-400 mb-1.5"
              >
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-600 pointer-events-none" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value)
                  }}
                  onBlur={() => {
                    setTouched((t) => ({ ...t, username: true }))
                  }}
                  placeholder="Enter your username"
                  aria-invalid={usernameInvalid}
                  aria-describedby={usernameInvalid ? 'username-error' : undefined}
                  className={[
                    'w-full pl-10 pr-4 py-2.5 bg-surface-800 border rounded-xl',
                    'text-surface-100 placeholder:text-surface-600 text-sm',
                    'outline-none transition-colors',
                    'focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50',
                    usernameInvalid ? 'border-red-500/70' : 'border-surface-700',
                  ].join(' ')}
                />
              </div>
              {usernameInvalid && (
                <p id="username-error" className="text-red-400 text-xs mt-1.5">
                  Username is required
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-surface-400 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-600 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                  }}
                  onBlur={() => {
                    setTouched((t) => ({ ...t, password: true }))
                  }}
                  placeholder="Enter your password"
                  aria-invalid={passwordInvalid}
                  aria-describedby={passwordInvalid ? 'password-error' : undefined}
                  className={[
                    'w-full pl-10 pr-10 py-2.5 bg-surface-800 border rounded-xl',
                    'text-surface-100 placeholder:text-surface-600 text-sm',
                    'outline-none transition-colors',
                    'focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50',
                    passwordInvalid ? 'border-red-500/70' : 'border-surface-700',
                  ].join(' ')}
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
              {passwordInvalid && (
                <p id="password-error" className="text-red-400 text-xs mt-1.5">
                  Password is required
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className={[
                'w-full py-2.5 rounded-xl text-sm font-semibold text-white',
                'bg-primary-600 hover:bg-primary-500 active:bg-primary-700',
                'transition-colors focus:outline-none',
                'focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-900',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-2',
              ].join(' ')}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* ── Register link ────────────────────────────────────────────── */}
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={onRegister}
            className="text-sm text-surface-500 hover:text-primary-400 transition-colors"
          >
            New buyer? <span className="font-medium">Create an account</span>
          </button>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <p className="text-center text-surface-700 text-xs mt-6">
          100% offline system · All data stored locally in your browser
        </p>
      </div>
    </div>
  )
}
