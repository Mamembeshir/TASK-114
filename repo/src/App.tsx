import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuthStore, seedDefaultAdmin } from '@/store/authStore'
import { LoginPage } from '@/pages/LoginPage'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/pages/DashboardPage'

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
        <DashboardPage />
      </AppShell>
    </>
  )
}
