import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

interface Props {
  endTime: number
  /** Called once when the countdown reaches zero */
  onExpire?: () => void
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Ended'
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${String(days)}d ${String(hours).padStart(2, '0')}h`
  if (hours > 0) return `${String(hours)}h ${String(minutes).padStart(2, '0')}m`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function CountdownTimer({ endTime, onExpire }: Props) {
  const [remaining, setRemaining] = useState(() => endTime - Date.now())

  useEffect(() => {
    setRemaining(endTime - Date.now())

    const interval = setInterval(() => {
      const ms = endTime - Date.now()
      setRemaining(ms)
      if (ms <= 0) {
        clearInterval(interval)
        onExpire?.()
      }
    }, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [endTime, onExpire])

  const isUrgent = remaining > 0 && remaining <= 60_000 // under 1 minute
  const isEnded = remaining <= 0

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 font-mono text-sm font-semibold',
        isEnded ? 'text-surface-600' : isUrgent ? 'text-red-400 animate-pulse' : 'text-surface-300',
      ].join(' ')}
    >
      <Clock className="w-3.5 h-3.5 shrink-0" />
      {formatCountdown(remaining)}
    </span>
  )
}
