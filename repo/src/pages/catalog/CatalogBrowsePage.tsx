/**
 * CatalogBrowsePage — searchable, filterable catalog for all users with viewCatalog permission.
 *
 * Search is client-side: loads all Active items, then filters in memory with a debounced query.
 * Facets: category, brand, price range, tags.
 * Sort: newest, price asc/desc, top sellers.
 * Extras: recent search history (localStorage, 7-day TTL), trending keywords (frequency of
 * search events recorded over the past 7 days — top 7 by query count).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, Search, TrendingUp, X, Package } from 'lucide-react'
import { db } from '@/db'
import { Badge, Card, EmptyState, SkeletonCard } from '@/components/ui'
import type { CatalogItem, Category } from '@/types'

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'top_sellers'

// ── Search persistence helpers (localStorage) ─────────────────────────────────

const RECENT_KEY = 'meridian:catalog:recent-searches'
const EVENTS_KEY = 'meridian:catalog:search-events'
const MAX_RECENT = 7
const MAX_EVENTS = 500 // rolling cap to bound storage
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

interface SearchEntry {
  term: string
  timestamp: number
}

function loadRecent(): SearchEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const cutoff = Date.now() - SEVEN_DAYS_MS
    return (parsed as SearchEntry[]).filter((e) => e.timestamp > cutoff)
  } catch {
    return []
  }
}

/**
 * Persist a search event for trending analytics.
 * Also updates the deduplicated recent-search list shown in the dropdown.
 */
function recordSearch(term: string): void {
  const trimmed = term.trim()
  if (trimmed.length < 2) return

  // Update deduped recent list (max 7, user-facing)
  const existing = loadRecent().filter((e) => e.term !== trimmed)
  const updatedRecent = [{ term: trimmed, timestamp: Date.now() }, ...existing].slice(0, MAX_RECENT)
  localStorage.setItem(RECENT_KEY, JSON.stringify(updatedRecent))

  // Append to raw event log for trending (all occurrences, 7-day window, max 500)
  try {
    const raw = localStorage.getItem(EVENTS_KEY)
    const events: SearchEntry[] = raw ? (JSON.parse(raw) as SearchEntry[]) : []
    const cutoff = Date.now() - SEVEN_DAYS_MS
    const trimmed7d = events.filter((e) => e.timestamp > cutoff)
    trimmed7d.push({ term: trimmed, timestamp: Date.now() })
    localStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed7d.slice(-MAX_EVENTS)))
  } catch {
    // ignore storage errors
  }
}

function clearRecent(): void {
  localStorage.removeItem(RECENT_KEY)
}

/**
 * Compute trending keywords: the top 7 distinct search queries that appear
 * most frequently in the search-events log over the last 7 days.
 * Falls back to an empty list if no events have been recorded yet.
 */
function computeTrendingKeywords(): string[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY)
    if (!raw) return []
    const events = JSON.parse(raw) as SearchEntry[]
    const cutoff = Date.now() - SEVEN_DAYS_MS
    const freq = new Map<string, number>()
    for (const e of events) {
      if (e.timestamp > cutoff) {
        const t = e.term.toLowerCase().trim()
        if (t.length >= 2) freq.set(t, (freq.get(t) ?? 0) + 1)
      }
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([term]) => term)
  } catch {
    return []
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CatalogBrowsePage() {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [sort, setSort] = useState<SortOption>('newest')

  // Recent searches UI
  const [recentSearches, setRecentSearches] = useState<SearchEntry[]>(() => loadRecent())
  const [trendingKeywords, setTrendingKeywords] = useState<string[]>(() =>
    computeTrendingKeywords(),
  )
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Debounce search input
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value)
      if (value.trim().length >= 2) {
        recordSearch(value.trim())
        setRecentSearches(loadRecent())
        setTrendingKeywords(computeTrendingKeywords())
      }
    }, 300)
  }

  const applySearch = (term: string) => {
    setQuery(term)
    setDebouncedQuery(term)
    setShowSuggestions(false)
  }

  useEffect(() => {
    const load = async () => {
      try {
        const [allItems, cats] = await Promise.all([
          db.catalogItems.where('status').equals('Active').toArray(),
          db.categories.toArray(),
        ])
        setItems(allItems)
        setCategories(cats)
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [])

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])

  // All distinct tags from active items
  const allTags = useMemo(() => {
    const s = new Set<string>()
    items.forEach((item) => {
      item.tags.forEach((t) => s.add(t))
    })
    return [...s].sort()
  }, [items])

  // All distinct brands from active items
  const allBrands = useMemo(() => {
    const s = new Set<string>()
    items.forEach((item) => {
      if (item.brand) s.add(item.brand)
    })
    return [...s].sort()
  }, [items])

  const filtered = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim()
    let result = [...items]

    if (q) {
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q)) ||
          (item.brand?.toLowerCase().includes(q) ?? false),
      )
    }
    if (categoryFilter) {
      result = result.filter((item) => item.categoryId === categoryFilter)
    }
    if (brandFilter) {
      result = result.filter((item) => item.brand === brandFilter)
    }
    if (tagFilter) {
      result = result.filter((item) => item.tags.includes(tagFilter))
    }
    const min = minPrice ? Number(minPrice) : null
    const max = maxPrice ? Number(maxPrice) : null
    if (min !== null && !isNaN(min)) result = result.filter((item) => item.price >= min)
    if (max !== null && !isNaN(max)) result = result.filter((item) => item.price <= max)

    if (sort === 'price_asc') result.sort((a, b) => a.price - b.price)
    else if (sort === 'price_desc') result.sort((a, b) => b.price - a.price)
    else if (sort === 'top_sellers') result.sort((a, b) => b.salesCount - a.salesCount)
    else result.sort((a, b) => b.createdAt - a.createdAt)

    return result
  }, [items, debouncedQuery, categoryFilter, brandFilter, tagFilter, minPrice, maxPrice, sort])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">Browse Catalog</h1>
        <p className="text-sm text-surface-500 mt-0.5">{String(filtered.length)} items found</p>
      </div>

      {/* Search + sort bar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500 pointer-events-none" />
          <input
            ref={searchRef}
            className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-9 pr-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500"
            value={query}
            onChange={(e) => {
              handleQueryChange(e.target.value)
            }}
            onFocus={() => {
              setShowSuggestions(true)
            }}
            onBlur={() => {
              // delay to allow click on suggestion
              setTimeout(() => {
                setShowSuggestions(false)
              }, 150)
            }}
            placeholder="Search by title, description, brand, or tag…"
          />

          {/* Dropdown: recent searches + trending */}
          {showSuggestions && !query && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface-800 border border-surface-700 rounded-lg shadow-xl z-10 overflow-hidden">
              {recentSearches.length > 0 && (
                <div className="p-2">
                  <div className="flex items-center justify-between px-2 mb-1">
                    <span className="text-xs font-medium text-surface-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Recent
                    </span>
                    <button
                      onClick={() => {
                        clearRecent()
                        setRecentSearches([])
                      }}
                      className="text-xs text-surface-600 hover:text-surface-400"
                    >
                      Clear
                    </button>
                  </div>
                  {recentSearches.map((entry) => (
                    <button
                      key={entry.term}
                      onMouseDown={() => {
                        applySearch(entry.term)
                      }}
                      className="w-full text-left px-2 py-1.5 text-sm text-surface-300 hover:bg-surface-700 rounded flex items-center gap-2"
                    >
                      <Clock className="w-3.5 h-3.5 text-surface-600 shrink-0" />
                      {entry.term}
                    </button>
                  ))}
                </div>
              )}

              {trendingKeywords.length > 0 && (
                <div className="p-2 border-t border-surface-700">
                  <p className="text-xs font-medium text-surface-500 flex items-center gap-1 px-2 mb-1">
                    <TrendingUp className="w-3 h-3" /> Trending
                  </p>
                  <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                    {trendingKeywords.map((kw) => (
                      <button
                        key={kw}
                        onMouseDown={() => {
                          applySearch(kw)
                        }}
                        className="px-2 py-0.5 rounded-full text-xs bg-surface-700 text-surface-300 hover:bg-primary-600/30 hover:text-primary-300 transition-colors"
                      >
                        {kw}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Active query chip */}
        {debouncedQuery && (
          <button
            onClick={() => {
              setQuery('')
              setDebouncedQuery('')
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600/15 border border-primary-600/30 text-primary-400 text-sm"
          >
            <span className="truncate max-w-40">{debouncedQuery}</span>
            <X className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}

        <select
          className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-300 focus:outline-none focus:border-primary-500"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as SortOption)
          }}
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price: Low → High</option>
          <option value="price_desc">Price: High → Low</option>
          <option value="top_sellers">Top Sellers</option>
        </select>
      </div>

      <div className="flex gap-6">
        {/* Facet panel */}
        <aside className="w-52 shrink-0 space-y-4">
          <div>
            <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
              Category
            </p>
            <div className="space-y-1">
              <button
                onClick={() => {
                  setCategoryFilter('')
                }}
                className={[
                  'w-full text-left text-sm px-2 py-1 rounded',
                  !categoryFilter
                    ? 'text-primary-400 font-medium'
                    : 'text-surface-400 hover:text-surface-200',
                ].join(' ')}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCategoryFilter(c.id)
                  }}
                  className={[
                    'w-full text-left text-sm px-2 py-1 rounded',
                    categoryFilter === c.id
                      ? 'text-primary-400 font-medium'
                      : 'text-surface-400 hover:text-surface-200',
                  ].join(' ')}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {allBrands.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
                Brand
              </p>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    setBrandFilter('')
                  }}
                  className={[
                    'w-full text-left text-sm px-2 py-1 rounded',
                    !brandFilter
                      ? 'text-primary-400 font-medium'
                      : 'text-surface-400 hover:text-surface-200',
                  ].join(' ')}
                >
                  All
                </button>
                {allBrands.map((brand) => (
                  <button
                    key={brand}
                    onClick={() => {
                      setBrandFilter(brandFilter === brand ? '' : brand)
                    }}
                    className={[
                      'w-full text-left text-sm px-2 py-1 rounded truncate',
                      brandFilter === brand
                        ? 'text-primary-400 font-medium'
                        : 'text-surface-400 hover:text-surface-200',
                    ].join(' ')}
                  >
                    {brand}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
              Price Range
            </p>
            <div className="flex gap-2">
              <input
                className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-surface-300 focus:outline-none focus:border-primary-500"
                value={minPrice}
                onChange={(e) => {
                  setMinPrice(e.target.value)
                }}
                placeholder="Min"
                type="number"
                min="0"
              />
              <input
                className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-surface-300 focus:outline-none focus:border-primary-500"
                value={maxPrice}
                onChange={(e) => {
                  setMaxPrice(e.target.value)
                }}
                placeholder="Max"
                type="number"
                min="0"
              />
            </div>
          </div>

          {allTags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
                Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setTagFilter(tagFilter === tag ? '' : tag)
                    }}
                    className={[
                      'px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                      tagFilter === tag
                        ? 'bg-primary-600 text-white'
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700',
                    ].join(' ')}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Results grid */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} hasImage />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No items found"
              description="Try adjusting your search or filters."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((item) => (
                <Card key={item.id} className="flex flex-col gap-3">
                  {item.imageUrls[0] ? (
                    <img
                      src={item.imageUrls[0]}
                      alt={item.title}
                      className="w-full h-36 object-cover rounded-lg bg-surface-800"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-full h-36 bg-surface-800 rounded-lg flex items-center justify-center">
                      <Package className="w-8 h-8 text-surface-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-surface-100 text-sm leading-tight truncate">
                      {item.title}
                    </p>
                    <p className="text-surface-500 text-xs mt-0.5 truncate">
                      {catMap.get(item.categoryId) ?? '—'}
                      {item.brand && <span className="text-surface-600"> · {item.brand}</span>}
                    </p>
                    {item.description && (
                      <p className="text-surface-400 text-xs mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    {item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded text-xs bg-surface-800 text-surface-500"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-surface-800">
                    <span className="font-mono font-bold text-surface-100">{item.price}</span>
                    <Badge variant="default">{String(item.stock)} in stock</Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
