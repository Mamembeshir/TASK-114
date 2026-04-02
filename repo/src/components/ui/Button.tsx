import { Loader2 } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: [
    'bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white',
    'focus:ring-primary-500 focus:ring-offset-surface-900',
  ].join(' '),
  secondary: [
    'bg-surface-800 hover:bg-surface-700 active:bg-surface-750 text-surface-200 border border-surface-700',
    'focus:ring-surface-600 focus:ring-offset-surface-900',
  ].join(' '),
  ghost: [
    'bg-transparent hover:bg-surface-800 active:bg-surface-700 text-surface-400 hover:text-surface-200',
    'focus:ring-surface-600 focus:ring-offset-surface-900',
  ].join(' '),
  danger: [
    'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white',
    'focus:ring-red-500 focus:ring-offset-surface-900',
  ].join(' '),
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-10 px-5 text-sm gap-2',
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled ?? isLoading}
      className={[
        'inline-flex items-center justify-center rounded-xl font-medium',
        'transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ].join(' ')}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      {children}
      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  )
}
