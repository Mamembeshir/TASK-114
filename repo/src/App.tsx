import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { Loader2, Shield } from 'lucide-react'
import { useAuthStore, seedDefaultAdmin } from '@/store/authStore'
import { LoginPage } from '@/pages/LoginPage'
import { AppShell } from '@/components/layout/AppShell'

export default function App() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const isLoading = useAuthStore((s) => s.isLoading)

  // On mount: seed default admin (no-op if users exist), then restore persisted session
  useEffect(() => {
    const initialize = async () => {
      await seedDefaultAdmin()
      await useAuthStore.getState().restoreSession()
    }
    void initialize()
  }, [])

  // ── Full-screen loading (session restore in progress) ─────────────────────
  if (isLoading && !currentUser) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <div className="min-h-screen bg-surface-950 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            <p className="text-surface-500 text-sm">Loading…</p>
          </div>
        </div>
      </>
    )
  }

  // ── Not authenticated ─────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <LoginPage />
      </>
    )
  }

  // ── Authenticated — app shell ─────────────────────────────────────────────
  return (
    <>
      <Toaster position="top-right" richColors />
      <AppShell>
        {/* Dashboard placeholder — replaced in task 2.5 */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-600 mb-4">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-surface-50 mb-1">
              Welcome, {currentUser.displayName}
            </h1>
            <p className="text-surface-600 text-xs mt-6">Dashboard coming in task 2.5</p>
          </div>
        </div>
      </AppShell>
    </>
  )
}
