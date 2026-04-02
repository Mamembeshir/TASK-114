/**
 * CatalogBrowsePage — searchable, filterable catalog for all users with viewCatalog permission.
 *
 * Search is client-side: loads all Active items, then filters in memory with a debounced query.
 * Facets: category, price range, tags.
 * Sort: newest, price asc/desc.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Package } from 'lucide-react'
import { db } from '@/db'
import { Badge, Card, EmptyState, Spinner } from '@/components/ui'
import type { CatalogItem, Category } from '@/types'

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'top_sellers'

export function CatalogBrowsePage() {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [sort, setSort] = useState<SortOption>('newest')

  // Debounce search input
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value)
    }, 300)
  }

  useEffect(() => {
    const load = async () => {
      const [allItems, cats] = await Promise.all([
        db.catalogItems.where('status').equals('Active').toArray(),
        db.categories.toArray(),
      ])
      setItems(allItems)
      setCategories(cats)
      setIsLoading(false)
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

  const filtered = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim()
    let result = [...items]

    if (q) {
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    if (categoryFilter) {
      result = result.filter((item) => item.categoryId === categoryFilter)
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
  }, [items, debouncedQuery, categoryFilter, tagFilter, minPrice, maxPrice, sort])

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
            className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-9 pr-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500"
            value={query}
            onChange={(e) => {
              handleQueryChange(e.target.value)
            }}
            placeholder="Search by title, description, or tag…"
          />
        </div>
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
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
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
