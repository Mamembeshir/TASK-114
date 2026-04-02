// ── Spinner ────────────────────────────────────────────────────────────────────

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-[3px]',
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={[
        'rounded-full border-surface-700 border-t-primary-500 animate-spin',
        SIZE[size],
        className,
      ].join(' ')}
    />
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={['bg-surface-800 rounded-lg animate-pulse', className].join(' ')}
      aria-hidden="true"
    />
  )
}

/** Renders a stack of skeleton lines to mimic a block of text */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={['h-3', i === lines - 1 ? 'w-3/4' : 'w-full'].join(' ')} />
      ))}
    </div>
  )
}

/** Skeleton placeholder for a card in a grid layout */
export function SkeletonCard({ hasImage = false }: { hasImage?: boolean }) {
  return (
    <div
      className="bg-surface-900 border border-surface-800 rounded-xl p-4 space-y-3"
      aria-hidden="true"
    >
      {hasImage && <Skeleton className="w-full h-36" />}
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="space-y-2 mt-1">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
    </div>
  )
}
