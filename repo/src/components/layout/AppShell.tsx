import { useEffect, useRef, useState } from 'react'
import { NavDrawer } from './NavDrawer'

// ── LocalStorage key ───────────────────────────────────────────────────────────
const LS_DRAWER_KEY = 'meridian_drawer_open'

const DRAWER_WIDTH = 256 // px — keep in sync with Tailwind w-64

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
  children: React.ReactNode
}

/**
 * Top-level app chrome: collapsible left Drawer + scrollable main content area.
 *
 * The drawer collapses to an icon-only rail (w-16) and expands to full width
 * (w-64) with a CSS transition.  The main content area shifts its left margin
 * in sync so there is never any content overlap.
 *
 * Open/closed preference is persisted to LocalStorage.
 */
export function AppShell({ children }: Props) {
  const [open, setOpen] = useState<boolean>(readDrawerPref)
  const isFirstRender = useRef(true)

  // Persist preference whenever it changes (skip initial render to avoid
  // an unnecessary write on every app load)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    localStorage.setItem(LS_DRAWER_KEY, String(open))
  }, [open])

  const toggle = () => {
    setOpen((v) => !v)
  }

  return (
    <div className="min-h-screen bg-surface-950 flex">
      {/* ── Left Drawer ─────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-y-0 left-0 z-30 flex flex-col bg-surface-900 border-r border-surface-800 transition-[width] duration-200 ease-in-out overflow-hidden"
        style={{ width: open ? DRAWER_WIDTH : 64 }}
      >
        <NavDrawer open={open} onToggle={toggle} />
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main
        className="flex-1 flex flex-col min-h-screen transition-[margin-left] duration-200 ease-in-out"
        style={{ marginLeft: open ? DRAWER_WIDTH : 64 }}
      >
        {children}
      </main>
    </div>
  )
}
