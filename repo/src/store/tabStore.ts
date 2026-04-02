import { create } from 'zustand'

// ── Tab shape ─────────────────────────────────────────────────────────────────

export interface Tab {
  /** Unique stable ID for this tab instance */
  id: string
  /** Display title shown in the tab strip */
  title: string
  /** Route path the tab renders — drives the content area */
  path: string
  /** When true, shows a dot indicator and blocks close without confirmation */
  isDirty: boolean
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface TabState {
  tabs: Tab[]
  activeTabId: string | null
}

interface TabActions {
  openTab: (tab: Omit<Tab, 'isDirty'>) => void
  closeTab: (tabId: string) => void
  activateTab: (tabId: string) => void
  markDirty: (tabId: string, dirty: boolean) => void
  /** Clear all user-opened tabs and return to the Dashboard home tab. Call on logout. */
  reset: () => void
}

// Dashboard is the permanent home tab — it cannot be closed.
const HOME_TAB: Tab = {
  id: 'home',
  title: 'Dashboard',
  path: '/',
  isDirty: false,
}

export const useTabStore = create<TabState & TabActions>((set, get) => ({
  tabs: [HOME_TAB],
  activeTabId: HOME_TAB.id,

  // ── openTab ─────────────────────────────────────────────────────────────────
  // If a tab with the same path already exists, activate it instead of duplicating.
  openTab: (incoming) => {
    const { tabs } = get()
    const existing = tabs.find((t) => t.path === incoming.path)
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    const newTab: Tab = { ...incoming, isDirty: false }
    set({ tabs: [...tabs, newTab], activeTabId: newTab.id })
  },

  // ── closeTab ────────────────────────────────────────────────────────────────
  // Never closes the home tab.  After close, activates the nearest remaining tab.
  closeTab: (tabId) => {
    const { tabs, activeTabId } = get()
    if (tabId === HOME_TAB.id) return

    const idx = tabs.findIndex((t) => t.id === tabId)
    if (idx === -1) return

    const next = tabs.filter((t) => t.id !== tabId)
    let nextActiveId = activeTabId

    if (activeTabId === tabId) {
      // Prefer the tab to the left; HOME_TAB is always present as a safety net.
      // Cast to Tab | undefined because noUncheckedIndexedAccess is not enabled.
      const fallback = next[Math.max(0, idx - 1)] as Tab | undefined
      nextActiveId = fallback?.id ?? HOME_TAB.id
    }

    set({ tabs: next, activeTabId: nextActiveId })
  },

  // ── activateTab ─────────────────────────────────────────────────────────────
  activateTab: (tabId) => {
    set({ activeTabId: tabId })
  },

  // ── markDirty ───────────────────────────────────────────────────────────────
  markDirty: (tabId, dirty) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, isDirty: dirty } : t)),
    }))
  },

  // ── reset ───────────────────────────────────────────────────────────────────
  reset: () => {
    set({ tabs: [HOME_TAB], activeTabId: HOME_TAB.id })
  },
}))
