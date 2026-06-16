'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { BUSINESS_ID } from '@/lib/config'
import type { QuoteStatus } from '@/lib/config'

// ─── Types ────────────────────────────────────────────────────────────────────

type QuoteRow = {
  id: string
  customer_name: string
  address: string | null
  salesperson: string | null
  quote_type: string
  status: QuoteStatus
  final_quote: number | null
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'thinking_about_it', label: 'Thinking About It' },
  { value: 'sold', label: 'Sold' },
  { value: 'not_interested_right_now', label: 'Not Interested Right Now' },
  { value: 'not_interested_at_all', label: 'Not Interested At All' },
]

// salesperson is a single text column that may hold multiple comma-joined names.
function salespersonNames(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const router = useRouter()
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [salespersons, setSalespersons] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState('all')
  const [salespersonFilter, setSalespersonFilter] = useState('all')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [quotesRes, spRes] = await Promise.all([
      supabase
        .from('quotes')
        .select('id, customer_name, address, salesperson, quote_type, status, final_quote, created_at')
        .eq('business_id', BUSINESS_ID)
        .order('created_at', { ascending: false }),
      supabase
        .from('salespersons')
        .select('name')
        .eq('business_id', BUSINESS_ID)
        .eq('active', true)
        .order('name'),
    ])
    setQuotes(quotesRes.data ?? [])
    setSalespersons((spRes.data ?? []).map(s => s.name))
    setLoading(false)
  }

  const filtered = useMemo(
    () =>
      quotes.filter(
        q =>
          (statusFilter === 'all' || q.status === statusFilter) &&
          (salespersonFilter === 'all' || salespersonNames(q.salesperson).includes(salespersonFilter))
      ),
    [quotes, statusFilter, salespersonFilter]
  )

  return (
    <div className="min-h-screen bg-base">
      <PageHeader
        title="Quotes"
        rightElement={
          <Button size="sm" onClick={() => router.push('/quotes/new')}>
            <Plus size={14} />
            New
          </Button>
        }
      />

      {/* ── Filters ── */}
      <div className="px-4 pt-4 grid grid-cols-2 gap-3">
        <div className="relative">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full h-10 px-3 pr-8 bg-surface border border-white/8 rounded-xl text-foreground text-sm appearance-none focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          >
            {STATUS_FILTERS.map(s => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <select
            value={salespersonFilter}
            onChange={e => setSalespersonFilter(e.target.value)}
            className="w-full h-10 px-3 pr-8 bg-surface border border-white/8 rounded-xl text-foreground text-sm appearance-none focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          >
            <option value="all">All Salespeople</option>
            {salespersons.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted text-center py-16">Loading…</p>
      ) : quotes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No quotes yet"
          message="Tap New to build your first quote"
          actionLabel="New Quote"
          onAction={() => router.push('/quotes/new')}
        />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted text-center py-16">No quotes match these filters.</p>
      ) : (
        <div className="p-4 space-y-2 pb-8">
          {filtered.map(q => (
            <Card
              key={q.id}
              className="cursor-pointer active:opacity-70 transition-opacity"
              onClick={() => router.push(`/quotes/${q.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{q.customer_name}</p>
                  {q.address && <p className="text-xs text-muted truncate mt-0.5">{q.address}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-muted">
                      {new Date(q.created_at).toLocaleDateString('en-CA', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    {q.salesperson && (
                      <>
                        <span className="text-xs text-white/20">·</span>
                        <span className="text-xs text-muted truncate">{q.salesperson}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <StatusBadge status={q.status} size="sm" />
                  <p className="text-sm font-bold text-foreground">
                    {'$' +
                      (q.final_quote ?? 0).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
