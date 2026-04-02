import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {Icon && (
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-surface-800 mb-4">
          <Icon className="w-6 h-6 text-surface-500" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-surface-300 mb-1">{title}</h3>
      {description && <p className="text-sm text-surface-600 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
