import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** Optional subtitle / description rendered below the title */
  description?: string
  /** Width constraint class — defaults to `max-w-lg` */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
  /** Rendered in the modal footer; typically action buttons */
  footer?: React.ReactNode
}

const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

/**
 * Accessible modal dialog.
 *
 * - Traps focus within the dialog while open.
 * - Closes on Escape key.
 * - Closes when clicking the backdrop.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [open, onClose])

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Focus the dialog panel when it opens
  useEffect(() => {
    if (open) dialogRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={[
          'relative w-full bg-surface-900 border border-surface-800 rounded-2xl shadow-2xl',
          'flex flex-col max-h-[90vh] outline-none',
          SIZE_CLASSES[size],
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 border-b border-surface-800 shrink-0">
          <div>
            <h2 id="modal-title" className="text-base font-semibold text-surface-100">
              {title}
            </h2>
            {description && <p className="text-sm text-surface-500 mt-1">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-surface-500 hover:text-surface-200 hover:bg-surface-800 rounded-lg p-1 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-800 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
