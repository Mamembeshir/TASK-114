/**
 * useUrlSync — synchronises the active tab path with the browser URL hash.
 *
 * This gives the tab-store routing model deep-link, refresh, and
 * back/forward semantics without requiring a full URL router:
 *
 *  • Active tab changes → write  window.location.hash  (e.g. #/auctions/42)
 *  • On mount           → read   window.location.hash  and open that tab
 *  • popstate event     → open the tab for the new hash (back/forward)
 *
 * Call once from AppShell (i.e. only when the user is authenticated).
 */

import { useEffect } from 'react'
import { useTabStore } from '@/store/tabStore'

function hashToPath(hash: string): string {
  // Strip the leading '#' — '#/auctions/1' → '/auctions/1'
  const path = hash.startsWith('#') ? hash.slice(1) : hash
  // Treat empty hash or bare '#' as home
  return path || '/'
}

function pathToHash(path: string): string {
  return `#${path}`
}

export function useUrlSync(): void {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const openTab = useTabStore((s) => s.openTab)
  const activateTab = useTabStore((s) => s.activateTab)

  // On mount: restore tab from current URL hash (deep link / refresh)
  useEffect(() => {
    const hash = window.location.hash
    if (!hash || hash === '#' || hash === '#/') return
    const path = hashToPath(hash)
    if (path === '/') return // home tab is always open

    const existing = useTabStore.getState().tabs.find((t) => t.path === path)
    if (existing) {
      activateTab(existing.id)
    } else {
      // Derive a readable title from the path (e.g. /auctions/42 → 'auctions')
      const segment = path.split('/').find(Boolean) ?? 'Page'
      const title = segment.charAt(0).toUpperCase() + segment.slice(1)
      openTab({ id: path, title, path })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run only on mount

  // Active tab changes → update URL hash
  useEffect(() => {
    const activePath = tabs.find((t) => t.id === activeTabId)?.path ?? '/'
    const newHash = pathToHash(activePath)
    if (window.location.hash !== newHash) {
      window.history.pushState(null, '', newHash)
    }
  }, [activeTabId, tabs])

  // popstate (browser back/forward) → activate matching tab
  useEffect(() => {
    const handlePopState = () => {
      const path = hashToPath(window.location.hash)
      const { tabs: currentTabs, openTab: open, activateTab: activate } = useTabStore.getState()
      const existing = currentTabs.find((t) => t.path === path)
      if (existing) {
        activate(existing.id)
      } else if (path !== '/') {
        const segment = path.split('/').find(Boolean) ?? 'Page'
        const title = segment.charAt(0).toUpperCase() + segment.slice(1)
        open({ id: path, title, path })
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [openTab, activateTab])
}
