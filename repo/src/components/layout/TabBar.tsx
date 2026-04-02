import { useEffect, useRef } from 'react'
import { Menu, X } from 'lucide-react'
import { useTabStore, type Tab } from '@/store/tabStore'
import { NotificationBell } from './NotificationBell'

// ── Close-tab guard ────────────────────────────────────────────────────────────

function confirmClose(tab: Tab): boolean {
  if (!tab.isDirty) return true
  return window.confirm(`"${tab.title}" has unsaved changes. Close anyway?`)
}

// ── Single tab pill ────────────────────────────────────────────────────────────

interface TabPillProps {
  tab: Tab
  isActive: boolean
}

function TabPill({ tab, isActive }: TabPillProps) {
  const { activateTab, closeTab } = useTabStore()
  const isHome = tab.id === 'home'

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmClose(tab)) closeTab(tab.id)
  }

  return (
    <div
      role="tab"
      aria-selected={isActive}
      onClick={() => {
        activateTab(tab.id)
      }}
      // Middle-click to close
      onAuxClick={(e) => {
        if (e.button === 1) handleClose(e)
      }}
      className={[
        'group relative flex items-center gap-1.5 pl-3 pr-1 py-1.5 rounded-lg cursor-pointer',
        'select-none text-sm max-w-48 shrink-0 transition-colors',
        isActive
          ? 'bg-surface-800 text-surface-100 shadow-sm'
          : 'text-surface-500 hover:bg-surface-800/60 hover:text-surface-300',
      ].join(' ')}
    >
      {/* Dirty indicator */}
      {tab.isDirty && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-400" />
      )}

      <span className="truncate">{tab.title}</span>

      {/* Close button — hidden for home tab */}
      {!isHome && (
        <button
          onClick={handleClose}
          aria-label={`Close ${tab.title}`}
          className={[
            'rounded p-0.5 transition-colors shrink-0',
            isActive
              ? 'text-surface-400 hover:text-surface-100 hover:bg-surface-700'
              : 'text-transparent group-hover:text-surface-500 hover:!text-surface-200 hover:bg-surface-700',
          ].join(' ')}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ── TabBar ─────────────────────────────────────────────────────────────────────

interface TabBarProps {
  /** Called when the mobile hamburger is tapped */
  onMenuClick?: () => void
  /** Whether the viewport is currently in mobile mode */
  isMobile?: boolean
}

/**
 * Horizontal tab strip rendered at the top of the main content area.
 *
 * Keyboard shortcut: Ctrl+W closes the active tab (with dirty-state guard).
 * On mobile, renders a hamburger button to open the drawer overlay.
 */
export function TabBar({ onMenuClick, isMobile }: TabBarProps) {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const { closeTab } = useTabStore()

  // Stable ref so the keyboard handler always sees the latest store state
  const stateRef = useRef({ tabs, activeTabId, closeTab })
  useEffect(() => {
    stateRef.current = { tabs, activeTabId, closeTab }
  }, [tabs, activeTabId, closeTab])

  // Ctrl+W / Cmd+W → close active tab
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        const { tabs: t, activeTabId: id, closeTab: close } = stateRef.current
        const active = t.find((tab) => tab.id === id)
        if (active && confirmClose(active)) close(active.id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [])

  return (
    <div className="flex items-center bg-surface-900 border-b border-surface-800">
      {/* Hamburger — only shown on mobile */}
      {isMobile && onMenuClick && (
        <button
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="px-3 py-2 text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      <div className="flex items-center gap-1 px-3 py-2 flex-1 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <TabPill key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
        ))}
      </div>
      <div className="px-3 py-2 shrink-0 border-l border-surface-800">
        <NotificationBell />
      </div>
    </div>
  )
}
