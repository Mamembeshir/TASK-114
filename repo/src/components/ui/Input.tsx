import { inputBase } from './inputBase'

// ── Shared field wrapper ───────────────────────────────────────────────────────

interface FieldWrapperProps {
  label?: string
  htmlFor?: string
  error?: string
  hint?: string
  children: React.ReactNode
}

export function FieldWrapper({ label, htmlFor, error, hint, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-surface-400">
          {label}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && hint && <p className="text-xs text-surface-600">{hint}</p>}
    </div>
  )
}

// ── Input ──────────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  id,
  className = '',
  ...props
}: InputProps) {
  const hasError = Boolean(error)
  return (
    <FieldWrapper label={label} htmlFor={id} error={error} hint={hint}>
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-600 pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          id={id}
          aria-invalid={hasError}
          className={[inputBase(hasError, leftIcon ? 'pl-10' : 'px-3'), 'py-2.5', className].join(
            ' ',
          )}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-600">
            {rightIcon}
          </span>
        )}
      </div>
    </FieldWrapper>
  )
}

// ── Textarea ───────────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export function Textarea({ label, error, hint, id, className = '', ...props }: TextareaProps) {
  const hasError = Boolean(error)
  return (
    <FieldWrapper label={label} htmlFor={id} error={error} hint={hint}>
      <textarea
        id={id}
        aria-invalid={hasError}
        className={[inputBase(hasError, 'px-3 py-2.5 resize-y min-h-24'), className].join(' ')}
        {...props}
      />
    </FieldWrapper>
  )
}

// ── Select ─────────────────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
}

export function Select({
  label,
  error,
  hint,
  id,
  children,
  className = '',
  ...props
}: SelectProps) {
  const hasError = Boolean(error)
  return (
    <FieldWrapper label={label} htmlFor={id} error={error} hint={hint}>
      <select
        id={id}
        aria-invalid={hasError}
        className={[inputBase(hasError, 'px-3 py-2.5 cursor-pointer'), className].join(' ')}
        {...props}
      >
        {children}
      </select>
    </FieldWrapper>
  )
}

// ── Checkbox ───────────────────────────────────────────────────────────────────

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  error?: string
}

export function Checkbox({ label, error, id, className = '', ...props }: CheckboxProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2.5 cursor-pointer group">
        <input
          id={id}
          type="checkbox"
          className={[
            'w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-600',
            'focus:ring-primary-500 focus:ring-offset-surface-900',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className,
          ].join(' ')}
          {...props}
        />
        <span className="text-sm text-surface-300 group-has-[:disabled]:opacity-50">{label}</span>
      </label>
      {error && <p className="text-xs text-red-400 ml-6">{error}</p>}
    </div>
  )
}
