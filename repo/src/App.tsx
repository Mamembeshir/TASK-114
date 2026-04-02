import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuthStore, seedDefaultAdmin } from '@/store/authStore'
import { seedDefaultCategories } from '@/db/seeds'
import { startAuctionLifecycleTimer } from '@/services/auctionLifecycle'
import { startNotificationSync, useNotificationStore } from '@/store/notificationStore'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { AppShell } from '@/components/layout/AppShell'

export default function App() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const isLoading = useAuthStore((s) => s.isLoading)
  const refreshNotifications = useNotificationStore((s) => s.refresh)
  const [view, setView] = useState<'login' | 'register'>('login')

  // On mount: seed defaults, restore session, start auction timer
  useEffect(() => {
    const initialize = async () => {
      // Show loading spinner for the entire init sequence — seeding PBKDF2
      // hashes for demo accounts can take ~1-2 s and must finish before login.
      useAuthStore.setState({ isLoading: true })
      try {
        await seedDefaultAdmin()
        await seedDefaultCategories()
        await useAuthStore.getState().restoreSession()
      } catch (err) {
        console.error('[Meridian] Initialization error:', err)
        useAuthStore.setState({ isLoading: false })
      }
    }
    void initialize()

    const stopTimer = startAuctionLifecycleTimer()
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

  // ── Authenticated — app shell with tab-based routing ─────────────────────
  return (
    <>
      <Toaster position="top-right" richColors />
      <AppShell />
    </>
  )
}
