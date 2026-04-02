import { useCallback, useEffect, useRef, useState } from 'react'
import { NavDrawer } from './NavDrawer'
import { TabBar } from './TabBar'
import { TabContent } from './TabContent'
import { useUrlSync } from '@/hooks/useUrlSync'

// ── Constants ──────────────────────────────────────────────────────────────────
const LS_DRAWER_KEY = 'meridian_drawer_open'
const DRAWER_WIDTH = 256 // px — keep in sync with Tailwind w-64
const RAIL_WIDTH = 64    // px — icon-only collapsed rail (desktop only)
const MOBILE_BP = 768    // px — md breakpoint

/** Read the persisted drawer preference; defaults to `true` (open). */
function readDrawerPref(): boolean {
  try {
    const stored = localStorage.getItem(LS_DRAWER_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

interface Props {
  children?: React.ReactNode
}

/**
 * Top-level app chrome: collapsible left Drawer + scrollable main content area.
 *
 * Desktop (≥ md): drawer collapses to 64 px icon rail; content shifts left margin.
 * Mobile  (< md): drawer slides in as a full overlay; content stays full-width;
 *                 a backdrop closes the drawer on tap.
 *
 * Open/closed preference is persisted to LocalStorage (desktop only).
 */
export function AppShell({ children }: Props) {
  const [open, setOpen] = useState<boolean>(readDrawerPref)
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BP,
  )
  const isFirstRender = useRef(true)

  // Sync active tab path ↔ window.location.hash
  useUrlSync()

  // Respond to viewport width changes
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BP - 1}px)`)
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      // Auto-close when switching to mobile so content isn't obscured
      if (e.matches) setOpen(false)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Persist desktop preference (skip initial render)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (!isMobile) localStorage.setItem(LS_DRAWER_KEY, String(open))
  }, [open, isMobile])

  const toggle = useCallback(() => setOpen((v) => !v), [])
  const close  = useCallback(() => setOpen(false), [])

  // Desktop: shift content; Mobile: no shift (overlay drawer)
  const contentMarginLeft = isMobile ? 0 : (open ? DRAWER_WIDTH : RAIL_WIDTH)
  // Desktop: rail or full; Mobile: full or hidden (0)
  const drawerWidth = isMobile ? (open ? DRAWER_WIDTH : 0) : (open ? DRAWER_WIDTH : RAIL_WIDTH)

  return (
    <div className="min-h-screen bg-surface-950 flex">
      {/* ── Mobile backdrop ─────────────────────────────────────────────────── */}
      {isMobile && open && (
        <div
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* ── Left Drawer ─────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-y-0 left-0 z-30 flex flex-col bg-surface-900 border-r border-surface-800 transition-[width] duration-200 ease-in-out overflow-hidden"
        style={{ width: drawerWidth }}
      >
        {/* Only render nav content when drawer has non-zero width to avoid
            focus-trap / invisible interactive elements on mobile */}
        {drawerWidth > 0 && <NavDrawer open={open} onToggle={toggle} />}
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main
        className="flex-1 flex flex-col min-h-screen transition-[margin-left] duration-200 ease-in-out"
        style={{ marginLeft: contentMarginLeft }}
      >
        <TabBar onMenuClick={toggle} isMobile={isMobile} />
        <div className="flex-1 overflow-y-auto">
          <TabContent />
          {children}
        </div>
      </main>
    </div>
  )
}
