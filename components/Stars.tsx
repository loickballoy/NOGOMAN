import { Star } from 'lucide-react'

interface StarsProps {
  rating: number
  size?: 'sm' | 'md'
  showCount?: number
}

export default function Stars({ rating, size = 'sm', showCount }: StarsProps) {
  const s = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5'
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={s}
          fill={i <= Math.round(rating) ? '#f59e0b' : 'none'}
          stroke={i <= Math.round(rating) ? '#f59e0b' : '#d1d5db'}
        />
      ))}
      {showCount !== undefined && (
        <span className="ml-1 text-xs text-gray-500">({showCount})</span>
      )}
    </span>
  )
}
