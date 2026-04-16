import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuthStore, seedDefaultAdmin } from '@/store/authStore'
import { seedDefaultCategories } from '@/db/seeds'
import { db } from '@/db'
import { startAuctionLifecycleTimer } from '@/services/auctionLifecycle'
import { startNotificationSync, useNotificationStore } from '@/store/notificationStore'
import { startOutboundRetryTimer } from '@/services/notificationService'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { BootstrapAdminPage } from '@/pages/BootstrapAdminPage'
import { ForcePasswordChangePage } from '@/pages/ForcePasswordChangePage'
import { AppShell } from '@/components/layout/AppShell'

export default function App() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const isLoading = useAuthStore((s) => s.isLoading)
  const refreshNotifications = useNotificationStore((s) => s.refresh)
  const [view, setView] = useState<'login' | 'register'>('login')
  // True when the users table is empty and a first Administrator must be created.
  const [needsBootstrap, setNeedsBootstrap] = useState(false)

  // On mount: seed defaults, restore session, start auction timer
  useEffect(() => {
    const initialize = async () => {
      // Show loading spinner for the entire init sequence — seeding PBKDF2
      // hashes for demo accounts can take ~1-2 s and must finish before login.
      useAuthStore.setState({ isLoading: true })
      try {
        // Gate demo account seeding: skip in production builds unless explicitly enabled.
        // Set VITE_SEED_DEMO=true at build time to include demo accounts.
        // The skip_seed URL param bypasses seeding so that E2E tests can reach
        // the BootstrapAdminPage in any build (seeded or not).
        const skipSeed = new URLSearchParams(window.location.search).has('skip_seed')
        if (!skipSeed && (import.meta.env.DEV || import.meta.env.VITE_SEED_DEMO === 'true')) {
          await seedDefaultAdmin()
        }
        await seedDefaultCategories()
        await useAuthStore.getState().restoreSession()

        // First-run bootstrap check: if no users exist after seeding/restore,
        // show the BootstrapAdminPage so a production install can create its
        // initial Administrator without any build-time flags.
        const userCount = await db.users.count()
        if (userCount === 0) {
          setNeedsBootstrap(true)
        }
      } catch (err) {
        // Log message only — never log the raw error object in case it contains
        // crypto or DB internals (stack traces, key material references, etc.)
        console.error(
          '[Meridian] Initialization error:',
          err instanceof Error ? err.message : String(err),
        )
        useAuthStore.setState({ isLoading: false })
      }
    }
    void initialize()

    const stopTimer = startAuctionLifecycleTimer()
    startOutboundRetryTimer()
    return stopTimer
  }, [])

  // Start notification sync when user is authenticated
  useEffect(() => {
    if (!currentUser) return
    void refreshNotifications(currentUser.id)
    const stopSync = startNotificationSync(currentUser.id)
    return stopSync
  }, [currentUser, refreshNotifications])

  // ── Full-screen loading ───────────────────────────────────────────────────
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
    // First-run: no users exist — show the admin bootstrap wizard.
    // Once the administrator is created and logged in, currentUser becomes
    // non-null and this branch is skipped forever.
    if (needsBootstrap) {
      return (
        <>
          <Toaster position="top-right" richColors />
          <BootstrapAdminPage />
        </>
      )
    }

    return (
      <>
        <Toaster position="top-right" richColors />
        {view === 'register' ? (
          <RegisterPage
            onBackToLogin={() => {
              setView('login')
            }}
          />
        ) : (
          <LoginPage
            onRegister={() => {
              setView('register')
            }}
          />
        )}
      </>
    )
  }

  // ── Force password change before entering the app ────────────────────────
  if (currentUser.isTemporaryPassword) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <ForcePasswordChangePage />
      </>
    )
  }

  // ── Authenticated — app shell with tab-based routing ─────────────────────
  return (
    <>
      <Toaster position="top-right" richColors />
      <AppShell />
    </>
  )
}
