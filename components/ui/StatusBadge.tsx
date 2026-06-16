import Badge from './Badge'
import type { BadgeColor } from './Badge'
import type { QuoteStatus, ProspectStatus } from '@/lib/config'

type AnyStatus = QuoteStatus | ProspectStatus | string

const statusConfig: Record<string, { label: string; color: string }> = {
  quoted: { label: 'Quoted', color: 'blue' },
  thinking_about_it: { label: 'Thinking About It', color: 'amber' },
  sold: { label: 'Sold', color: 'green' },
  not_interested_right_now: { label: 'Not Interested Right Now', color: 'gray' },
  not_interested_at_all: { label: 'Not Interested At All', color: 'red' },
  not_interested: { label: 'Not Interested', color: 'red' }, // legacy rows
  no_answer: { label: 'No Answer', color: 'gray' },
  owner_not_home: { label: 'Not Home', color: 'amber' },
  follow_up: { label: 'Follow Up', color: 'blue' },
  converted: { label: 'Converted', color: 'green' },
}

interface StatusBadgeProps {
  status: AnyStatus
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, color: 'gray' }
  return (
    <Badge color={config.color as BadgeColor} size={size}>
      {config.label}
    </Badge>
  )
}
