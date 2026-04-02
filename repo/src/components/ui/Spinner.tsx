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
