'use client'

import type { Tier } from '@/lib/config'

interface TierSelectorProps {
  tier: Tier
  rateLow: number
  rateMid: number
  rateHigh: number
  unit: string
  onTierChange: (tier: Tier) => void
}

const tierOrder: Tier[] = ['low', 'mid', 'high']

const tierColors: Record<Tier, string> = {
  low: 'bg-info/15 text-info border-info/30',
  mid: 'bg-warning/15 text-warning border-warning/30',
  high: 'bg-accent/15 text-accent border-accent/30',
  custom: 'bg-white/10 text-foreground border-white/25',
}

const tierLabels: Record<Tier, string> = {
  low: 'LOW',
  mid: 'MID',
  high: 'HIGH',
  custom: 'CUSTOM',
}

function formatRate(rate: number, unit: string): string {
  if (unit === 'lbs') return `$${rate.toFixed(2)}/lb`
  if (unit === 'ft') return `$${rate.toFixed(2)}/ft`
  return `$${rate.toFixed(4)}/ft²`
}

export default function TierSelector({ tier, rateLow, rateMid, rateHigh, unit, onTierChange }: TierSelectorProps) {
  const currentRate = tier === 'low' ? rateLow : tier === 'mid' ? rateMid : rateHigh

  function cycleNext() {
    const currentIndex = tierOrder.indexOf(tier)
    const nextIndex = (currentIndex + 1) % tierOrder.length
    onTierChange(tierOrder[nextIndex])
  }

  return (
    <button
      type="button"
      onClick={cycleNext}
      className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border text-center min-w-[72px] transition-all active:scale-95 ${tierColors[tier]}`}
    >
      <span className="text-[10px] font-bold tracking-wider">{tierLabels[tier]}</span>
      <span className="text-[9px] opacity-80 whitespace-nowrap">{formatRate(currentRate, unit)}</span>
    </button>
  )
}
