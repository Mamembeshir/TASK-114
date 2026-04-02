import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'

// ── Sort state ─────────────────────────────────────────────────────────────────

export interface SortState {
  column: string
  direction: 'asc' | 'desc'
}

// ── Column definition ──────────────────────────────────────────────────────────

export interface ColumnDef<T> {
  key: string
  header: string
  /** Render function for a cell; receives the full row object */
  cell: (row: T) => React.ReactNode
  /** When true, clicking the header cycles asc → desc → asc */
  sortable?: boolean
  /** Tailwind width class, e.g. `w-32` */
  width?: string
}

// ── Table ──────────────────────────────────────────────────────────────────────

interface TableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  /** Unique key extractor for rows */
  rowKey: (row: T) => string
  sort?: SortState
  onSort?: (column: string) => void
  isLoading?: boolean
  emptyMessage?: string
  /** Current page index (0-based) */
  page?: number
  /** Total number of pages */
  totalPages?: number
  onPageChange?: (page: number) => void
}

function SortIcon({ column, sort }: { column: string; sort?: SortState }) {
  if (sort?.column !== column) return <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />
  if (sort.direction === 'asc') return <ChevronUp className="w-3.5 h-3.5" />
  return <ChevronDown className="w-3.5 h-3.5" />
}

export function Table<T>({
  columns,
  data,
  rowKey,
  sort,
  onSort,
  isLoading,
  emptyMessage = 'No records found.',
  page,
  totalPages,
  onPageChange,
}: TableProps<T>) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-surface-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-800">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={[
                    'px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wide',
                    col.width ?? '',
                    col.sortable && onSort
                      ? 'cursor-pointer select-none hover:text-surface-300'
                      : '',
                  ].join(' ')}
                  onClick={() => {
                    if (col.sortable && onSort) onSort(col.key)
                  }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {col.header}
                    {col.sortable && <SortIcon column={col.key} sort={sort} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-surface-600">
                  <div className="flex justify-center">
                    <div className="w-5 h-5 border-2 border-surface-700 border-t-primary-500 rounded-full animate-spin" />
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm text-surface-600"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-b border-surface-800/60 hover:bg-surface-800/30 transition-colors"
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-surface-300">
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages !== undefined && totalPages > 1 && page !== undefined && onPageChange && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-surface-600">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 0}
              onClick={() => {
                onPageChange(page - 1)
              }}
              className="px-3 py-1.5 rounded-lg border border-surface-700 text-surface-400 hover:bg-surface-800 hover:text-surface-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => {
                onPageChange(page + 1)
              }}
              className="px-3 py-1.5 rounded-lg border border-surface-700 text-surface-400 hover:bg-surface-800 hover:text-surface-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
