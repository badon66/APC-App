'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Pencil, Trash2, MapPin, Phone, User, Calendar, Check, Share2, PenLine } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { BUSINESS_ID } from '@/lib/config'
import type { Tier, QuoteStatus } from '@/lib/config'

// ─── Types ────────────────────────────────────────────────────────────────────

type LineItem = {
  serviceName: string
  unit: string
  category: string
  tier: Tier
  quantity: number
  lineTotal: number
  rateLow: number
  rateMid: number
  rateHigh: number
}

type Quote = {
  id: string
  salesperson: string | null
  customer_name: string
  customer_phone: string | null
  address: string | null
  quote_type: string
  status: QuoteStatus
  notes: string | null
  suggested_total: number | null
  suggested_lowest_total: number | null
  actual_price: number | null
  discount: number | null
  final_quote: number | null
  tax: number | null
  sold_price: number | null
  payment_type: string | null
  payment_type_other: string | null
  asphalt_photo_url: string | null
  concrete_photo_url: string | null
  context_photos: ContextPhoto[] | null
  follow_up_date: string | null
  follow_up_items: FollowUpItem[] | null
  follow_up_notes: string | null
  line_items: LineItem[] | null
  job_id: string | null
  created_at: string
  signature_url: string | null
  signed_name: string | null
  signed_phone: string | null
  signed_email: string | null
  signed_at: string | null
  terms_agreed: boolean | null
  terms_agreed_at: string | null
}

type ContextPhoto = { url: string; description: string }
type FollowUpItem = { label: string; checked: boolean }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CYCLE: QuoteStatus[] = [
  'quoted',
  'thinking_about_it',
  'sold',
  'not_interested_right_now',
  'not_interested_at_all',
]

const STATUS_META: Record<QuoteStatus, { label: string; cls: string }> = {
  quoted: { label: 'Quoted', cls: 'bg-info/15 text-info border-info/30' },
  thinking_about_it: { label: 'Thinking About It', cls: 'bg-warning/15 text-warning border-warning/30' },
  sold: { label: 'Sold', cls: 'bg-accent/15 text-accent border-accent/30' },
  not_interested_right_now: { label: 'Not Interested Right Now', cls: 'bg-white/8 text-muted border-white/15' },
  not_interested_at_all: { label: 'Not Interested At All', cls: 'bg-danger/15 text-danger border-danger/30' },
  not_interested: { label: 'Not Interested', cls: 'bg-danger/15 text-danger border-danger/30' }, // legacy rows
}

const TIER_LABEL: Record<string, string> = { low: 'LOW', mid: 'MID', high: 'HIGH', custom: 'CUSTOM' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number | null | undefined): string {
  return '$' + (Number.isFinite(n) ? (n as number) : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function unitLabel(unit: string): string {
  if (unit === 'lbs') return 'lb'
  if (unit === 'ft') return 'ft'
  return 'sq ft'
}

function fmtFollowUpDate(s: string): string {
  // date-only strings parse as UTC midnight; anchor to noon to avoid an off-by-one day
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    loadQuote()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function loadQuote() {
    const { data } = await supabase.from('quotes').select('*').eq('id', id).single()
    if (!data) {
      router.replace('/quotes')
      return
    }
    setQuote(data as Quote)
    setLoading(false)
  }

  async function cycleStatus() {
    if (!quote || updatingStatus) return
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(quote.status) + 1) % STATUS_CYCLE.length]
    setUpdatingStatus(true)
    setQuote({ ...quote, status: next })
    await supabase.from('quotes').update({ status: next }).eq('id', quote.id)

    // When marked Sold, create a linked job once
    if (next === 'sold' && !quote.job_id) {
      const detail = [
        quote.customer_phone ? `Phone: ${quote.customer_phone}` : null,
        `Quote type: ${quote.quote_type}`,
        ...(quote.line_items ?? []).map(
          i => `${i.serviceName} — ${i.quantity} ${unitLabel(i.unit)} (${i.tier})`
        ),
        `Final quote: ${fmtMoney(quote.final_quote)}`,
        quote.salesperson ? `Salesperson: ${quote.salesperson}` : null,
      ]
        .filter(Boolean)
        .join('\n')

      const { data: job } = await supabase
        .from('jobs')
        .insert({
          business_id: BUSINESS_ID,
          title: quote.customer_name,
          address: quote.address ?? null,
          notes: detail,
        })
        .select('id')
        .single()

      if (job) {
        await supabase.from('quotes').update({ job_id: job.id }).eq('id', quote.id)
        setQuote(q => (q ? { ...q, job_id: job.id, status: next } : q))
      }
    }
    setUpdatingStatus(false)
  }

  // Share a public, read-only link to this quote. Native share sheet on
  // phones; clipboard copy with feedback elsewhere.
  async function shareQuote() {
    if (!quote) return
    const url = `${window.location.origin}/share/${quote.id}`
    if (navigator.share) {
      try {
        await navigator.share({ title: `Quote — ${quote.customer_name}`, url })
        return
      } catch {
        // user dismissed the share sheet, or it failed — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      // clipboard unavailable — show the URL so it can be copied manually
      window.prompt('Copy this link:', url)
    }
  }

  async function deleteQuote() {
    if (!quote) return
    setDeleting(true)
    await supabase.from('quotes').delete().eq('id', quote.id)
    router.replace('/quotes')
  }

  if (loading || !quote) {
    return (
      <div className="min-h-screen bg-base">
        <PageHeader title="Quote" backHref="/quotes" />
        <p className="text-sm text-muted text-center py-16">Loading…</p>
      </div>
    )
  }

  const items = quote.line_items ?? []
  const balanceDue = (quote.final_quote ?? 0) + (quote.tax ?? 0)
  const paymentLabel =
    quote.payment_type === 'Other'
      ? quote.payment_type_other || 'Other'
      : quote.payment_type

  return (
    <div className="min-h-screen bg-base">
      <PageHeader
        title={quote.customer_name}
        backHref="/quotes"
        rightElement={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={shareQuote}>
              <Share2 size={14} />
              {linkCopied ? 'Copied!' : 'Share'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => router.push(`/quotes/${quote.id}/edit`)}>
              <Pencil size={14} />
              Edit
            </Button>
          </div>
        }
      />

      <div className="p-4 space-y-6 pb-12">

        {/* ── Status ── */}
        <button
          type="button"
          onClick={cycleStatus}
          disabled={updatingStatus}
          className={`w-full py-3 rounded-xl text-sm font-semibold border transition-all active:scale-[0.99] disabled:opacity-60 ${STATUS_META[quote.status].cls}`}
        >
          {STATUS_META[quote.status].label}
        </button>

        {/* ── Close Deal / Signed ── */}
        {quote.signature_url ? (
          <section>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
              Signed
            </h2>
            <Card>
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={quote.signature_url}
                  alt="Signature"
                  className="w-full h-28 object-contain rounded-xl bg-white"
                />
                <div className="text-sm text-foreground space-y-1">
                  {quote.signed_name && <p className="font-medium">{quote.signed_name}</p>}
                  {quote.signed_at && (
                    <p className="text-muted">
                      Signed on{' '}
                      {new Date(quote.signed_at).toLocaleDateString('en-CA', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                  {(quote.signed_email || quote.signed_phone) && (
                    <p className="text-muted">
                      {[quote.signed_email, quote.signed_phone].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {quote.terms_agreed && (
                    <p className="text-xs text-muted inline-flex items-center gap-1.5">
                      <Check size={12} className="text-accent" />
                      Terms &amp; conditions agreed
                      {quote.terms_agreed_at
                        ? ` — ${new Date(quote.terms_agreed_at).toLocaleString('en-CA', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}`
                        : ''}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </section>
        ) : (
          <Button fullWidth onClick={() => router.push(`/quotes/${quote.id}/close`)}>
            <PenLine size={15} />
            Close Deal
          </Button>
        )}

        {/* ── Customer ── */}
        <Card>
          <div className="space-y-2.5 text-sm">
            {quote.salesperson && (
              <div className="flex items-center gap-2.5 text-foreground">
                <User size={15} className="text-muted shrink-0" />
                <span>{quote.salesperson}</span>
              </div>
            )}
            {quote.address && (
              <div className="flex items-center gap-2.5 text-foreground">
                <MapPin size={15} className="text-muted shrink-0" />
                <span>{quote.address}</span>
              </div>
            )}
            {quote.customer_phone && (
              <div className="flex items-center gap-2.5 text-foreground">
                <Phone size={15} className="text-muted shrink-0" />
                <a href={`tel:${quote.customer_phone}`} className="text-accent">
                  {quote.customer_phone}
                </a>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-foreground">
              <Calendar size={15} className="text-muted shrink-0" />
              <span>
                {new Date(quote.created_at).toLocaleDateString('en-CA', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              <span className="text-white/20">·</span>
              <span className="capitalize text-muted">{quote.quote_type}</span>
            </div>
          </div>
        </Card>

        {/* ── Follow-Up ── */}
        {(quote.follow_up_date ||
          (quote.follow_up_items && quote.follow_up_items.length > 0) ||
          quote.follow_up_notes) && (
          <section>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
              Follow-Up
            </h2>
            <div className="px-4 py-3 bg-info/10 border border-info/25 rounded-xl space-y-3">
              {quote.follow_up_date && (
                <div className="flex items-center gap-2.5 text-sm text-foreground">
                  <Calendar size={15} className="text-info shrink-0" />
                  <span className="font-medium">Follow up on {fmtFollowUpDate(quote.follow_up_date)}</span>
                </div>
              )}
              {quote.follow_up_items && quote.follow_up_items.length > 0 && (
                <div className="space-y-1.5">
                  {quote.follow_up_items.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 text-sm">
                      <span
                        className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                          it.checked
                            ? 'bg-accent border-accent text-white'
                            : 'bg-transparent border-white/25 text-transparent'
                        }`}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                      <span className={it.checked ? 'text-foreground' : 'text-muted line-through'}>
                        {it.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {/* Legacy free-text follow-up (older quotes) */}
              {quote.follow_up_notes && (
                <p className="text-sm text-foreground whitespace-pre-wrap">{quote.follow_up_notes}</p>
              )}
            </div>
          </section>
        )}

        {/* ── Services ── */}
        {items.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
              Services
            </h2>
            <Card padding="sm">
              <div className="divide-y divide-white/8">
                {items.map((i, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 py-2.5 first:pt-1 last:pb-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{i.serviceName}</p>
                      <p className="text-xs text-muted">
                        {i.quantity} {unitLabel(i.unit)} · {TIER_LABEL[i.tier] ?? i.tier}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground shrink-0">
                      {fmtMoney(i.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        )}

        {/* ── Totals ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Totals</h2>
          <Card>
            <div className="space-y-3 text-sm">
              <Row label="Suggested" value={fmtMoney(quote.suggested_total)} />
              <Row label="Suggested Lowest" value={fmtMoney(quote.suggested_lowest_total)} />
              <div className="border-t border-white/8" />
              <Row label="Quote Subtotal" value={fmtMoney(quote.actual_price)} />
              <Row label="Quote Discount" value={fmtMoney(quote.discount)} />
              <Row label="Final Quote" value={fmtMoney(quote.final_quote)} bold />
              <Row label="Tax" value={fmtMoney(quote.tax)} />
              <div className="flex items-center justify-between px-3.5 py-3 bg-accent/10 border border-accent/20 rounded-xl">
                <span className="text-sm font-semibold text-foreground">Balance Due</span>
                <span className="text-2xl font-bold text-accent">{fmtMoney(balanceDue)}</span>
              </div>
              {quote.sold_price != null && (
                <>
                  <div className="border-t border-white/8" />
                  <Row label="Sold" value={fmtMoney(quote.sold_price)} bold />
                </>
              )}
            </div>
          </Card>
        </section>

        {/* ── Payment ── */}
        {paymentLabel && (
          <section>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
              Payment
            </h2>
            <Card>
              <p className="text-sm text-foreground">{paymentLabel}</p>
            </Card>
          </section>
        )}

        {/* ── Photos ── */}
        {(quote.asphalt_photo_url || quote.concrete_photo_url) && (
          <section>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Photos</h2>
            <div className="grid grid-cols-2 gap-3">
              {quote.asphalt_photo_url && <Thumb url={quote.asphalt_photo_url} label="Asphalt" />}
              {quote.concrete_photo_url && <Thumb url={quote.concrete_photo_url} label="Concrete" />}
            </div>
          </section>
        )}

        {/* ── Context Photos ── */}
        {quote.context_photos && quote.context_photos.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
              Context Photos
            </h2>
            <div className="space-y-3">
              {quote.context_photos.map((p, idx) => (
                <a
                  key={idx}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl overflow-hidden border border-white/8"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.description || 'Context photo'} className="w-full h-48 object-cover" />
                  {p.description && (
                    <p className="text-sm text-foreground px-3 py-2 whitespace-pre-wrap">{p.description}</p>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ── Notes ── */}
        {quote.notes && (
          <section>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Notes</h2>
            <Card>
              <p className="text-sm text-foreground whitespace-pre-wrap">{quote.notes}</p>
            </Card>
          </section>
        )}

        {/* ── Delete ── */}
        {!confirmDel ? (
          <Button
            fullWidth
            variant="ghost"
            className="text-danger hover:bg-danger/10"
            onClick={() => setConfirmDel(true)}
          >
            <Trash2 size={14} />
            Delete Quote
          </Button>
        ) : (
          <Card>
            <p className="text-sm text-center text-muted mb-3">Permanently delete this quote?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmDel(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={deleteQuote} loading={deleting}>
                Delete
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ─── Small components ──────────────────────────────────────────────────────────

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'text-sm text-foreground font-medium' : 'text-sm text-muted'}>{label}</span>
      <span className={bold ? 'text-sm font-bold text-foreground' : 'text-sm font-semibold text-foreground'}>
        {value}
      </span>
    </div>
  )
}

function Thumb({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <div className="rounded-xl overflow-hidden border border-white/8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="w-full h-40 object-cover" />
        <p className="text-xs text-muted px-2 py-1.5">{label}</p>
      </div>
    </a>
  )
}
