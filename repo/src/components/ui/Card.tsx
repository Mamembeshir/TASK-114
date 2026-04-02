interface CardProps {
  children: React.ReactNode
  className?: string
  /** Adds a consistent p-6 padding */
  padded?: boolean
}

export function Card({ children, className = '', padded = true }: CardProps) {
  return (
    <div
      className={[
        'bg-surface-900 border border-surface-800 rounded-2xl',
        padded ? 'p-6' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

export function CardHeader({ title, description, actions }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h3 className="text-sm font-semibold text-surface-100">{title}</h3>
        {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
