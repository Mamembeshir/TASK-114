/** Returns the shared Tailwind class string for all form inputs. */
export function inputBase(hasError = false, extra = '') {
  return [
    'w-full bg-surface-800 border rounded-xl text-surface-100 placeholder:text-surface-600 text-sm',
    'outline-none transition-colors',
    'focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50',
    hasError ? 'border-red-500/70' : 'border-surface-700',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    extra,
  ].join(' ')
}
