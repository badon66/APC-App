import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BUSINESS_NAME } from '@/lib/config'
import type { Tier } from '@/lib/config'

// Public, read-only quote summary. Anyone with the link can view it — no login.
// This is the one customer-facing screen in the app: treat it as a document,
// not an app interface.

export const metadata: Metadata = {
  title: `Quote — ${BUSINESS_NAME}`,
  robots: { index: false, follow: false },
}

// ─── Types ────────────────────────────────────────────────────────────────────

type LineItem = {
  serviceName: string
  unit: string
  tier: Tier
  quantity: number
  lineTotal: number
  rateLow?: number
  rateMid?: number
  rateHigh?: number
  customRate?: number | null
}

type ContextPhoto = { url: string; description: string }

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

// The per-unit price actually used for the line (no tier breakdown shown).
// Falls back to lineTotal ÷ quantity for older rows missing stored rates.
function rateUsed(item: LineItem): number | null {
  const byTier =
    item.tier === 'custom'
      ? item.customRate ?? undefined
      : item.tier === 'low'
        ? item.rateLow
        : item.tier === 'high'
          ? item.rateHigh
          : item.rateMid
  if (typeof byTier === 'number' && Number.isFinite(byTier)) return byTier
  if (item.quantity > 0 && Number.isFinite(item.lineTotal)) return item.lineTotal / item.quantity
  return null
}

function fmtDate(s: string): string {
  // date-only strings parse as UTC midnight; anchor to noon to avoid an off-by-one day
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SharedQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: quote } = await supabase
    .from('quotes')
    .select(
      'id, customer_name, customer_phone, address, status, notes, actual_price, discount, final_quote, tax, payment_type, payment_type_other, asphalt_photo_url, concrete_photo_url, context_photos, line_items, job_id, created_at, deposit_required, deposit_percent, deposit_amount'
    )
    .eq('id', id)
    .single()

  if (!quote) notFound()

  let scheduledDate: string | null = null
  if (quote.status === 'sold' && quote.job_id) {
    const { data: job } = await supabase
      .from('jobs')
      .select('scheduled_date')
      .eq('id', quote.job_id)
      .single()
    scheduledDate = job?.scheduled_date ?? null
  }

  const items: LineItem[] = Array.isArray(quote.line_items) ? quote.line_items : []
  const contextPhotos: ContextPhoto[] = Array.isArray(quote.context_photos)
    ? quote.context_photos.filter((p: ContextPhoto) => p?.url)
    : []
  const cardPhotos = [quote.asphalt_photo_url, quote.concrete_photo_url].filter(
    (u): u is string => !!u
  )
  const balanceDue = (quote.final_quote ?? 0) + (quote.tax ?? 0)
  const paymentLabel =
    quote.payment_type === 'Other'
      ? quote.payment_type_other || 'Other'
      : quote.payment_type

  return (
    <div className="min-h-screen bg-base">
      <div className="mx-auto max-w-2xl px-6 py-10 sm:px-10 sm:py-14">

        {/* ── Wordmark ── */}
        <header className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent font-bold tracking-tight text-white text-lg select-none">
            APC
          </div>
          <div>
            <p className="text-base font-semibold tracking-wide text-foreground">
              {BUSINESS_NAME}
            </p>
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted">
              Quote Summary
            </p>
          </div>
        </header>

        <div className="my-8 border-t border-white/10" />

        {/* ── Customer ── */}
        <section>
          <p className="text-[11px] uppercase tracking-[0.25em] text-muted">Prepared for</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {quote.customer_name}
          </h1>
          <div className="mt-4 space-y-1.5 text-[15px] leading-relaxed text-foreground/90">
            {quote.address && <p>{quote.address}</p>}
            {quote.customer_phone && <p>{quote.customer_phone}</p>}
          </div>
          <div className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Date Quoted</p>
              <p className="mt-1 text-sm font-medium text-foreground">{fmtDate(quote.created_at)}</p>
            </div>
            {scheduledDate && (
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Scheduled</p>
                <p className="mt-1 text-sm font-medium text-accent">{fmtDate(scheduledDate)}</p>
              </div>
            )}
          </div>
        </section>

        {/* ── Services ── */}
        {items.length > 0 && (
          <>
            <div className="my-8 border-t border-white/10" />
            <section>
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted">Services</p>
              <div className="mt-4 divide-y divide-white/8">
                {items.map((item, idx) => {
                  const rate = rateUsed(item)
                  return (
                    <div key={idx} className="flex items-baseline justify-between gap-4 py-3.5">
                      <div className="min-w-0">
                        <p className="text-[15px] font-medium text-foreground">{item.serviceName}</p>
                        <p className="mt-0.5 text-sm text-muted">
                          {item.quantity.toLocaleString('en-US')} {unitLabel(item.unit)}
                          {rate != null && (
                            <> · {fmtMoney(rate)} per {unitLabel(item.unit)}</>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums text-foreground">
                        {fmtMoney(item.lineTotal)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}

        {/* ── Totals ── */}
        <div className="my-8 border-t border-white/10" />
        <section>
          <div className="space-y-2.5 text-[15px]">
            <TotalRow label="Quote Subtotal" value={fmtMoney(quote.actual_price)} />
            <TotalRow label="Quote Discount" value={fmtMoney(quote.discount)} />
            <TotalRow label="Final Quote" value={fmtMoney(quote.final_quote)} strong />
            <TotalRow label="Tax" value={fmtMoney(quote.tax)} />
          </div>
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-accent/25 bg-accent/10 px-5 py-4">
            <span className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground">
              Balance Due
            </span>
            <span className="text-3xl font-bold tabular-nums text-accent">
              {fmtMoney(balanceDue)}
            </span>
          </div>
          {/* Deposit — only shown once a deposit decision has been recorded at signing. */}
          {quote.deposit_required != null && (
            <div className="mt-4 rounded-2xl border border-white/10 px-5 py-4">
              {quote.deposit_required ? (
                <>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm font-semibold text-foreground">
                      Deposit Due
                      {quote.deposit_percent != null && (
                        <span className="font-normal text-muted"> ({quote.deposit_percent}%)</span>
                      )}
                    </span>
                    <span className="text-xl font-bold tabular-nums text-foreground">
                      {fmtMoney(quote.deposit_amount)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    Required before work begins. Non-refundable once paid. The remaining balance is
                    due upon completion.
                  </p>
                </>
              ) : (
                <p className="text-sm text-foreground">
                  No deposit required{' '}
                  <span className="text-muted">— full balance due upon completion.</span>
                </p>
              )}
            </div>
          )}
          {paymentLabel && (
            <p className="mt-4 text-sm text-muted">
              Payment type: <span className="font-medium text-foreground">{paymentLabel}</span>
            </p>
          )}
        </section>

        {/* ── Photos ── */}
        {cardPhotos.length > 0 && (
          <>
            <div className="my-8 border-t border-white/10" />
            <section>
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted">Quote Card</p>
              <div className={`mt-4 grid gap-4 ${cardPhotos.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                {cardPhotos.map((url, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={idx}
                    src={url}
                    alt="Quote card"
                    className="w-full rounded-2xl border border-white/10 object-cover"
                  />
                ))}
              </div>
            </section>
          </>
        )}

        {/* ── Context photos ── */}
        {contextPhotos.length > 0 && (
          <>
            <div className="my-8 border-t border-white/10" />
            <section>
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted">Site Photos</p>
              <div className="mt-4 space-y-5">
                {contextPhotos.map((p, idx) => (
                  <figure key={idx}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.description || 'Site photo'}
                      className="w-full rounded-2xl border border-white/10 object-cover"
                    />
                    {p.description && (
                      <figcaption className="mt-2 text-sm leading-relaxed text-muted">
                        {p.description}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          </>
        )}

        {/* ── Notes ── */}
        {quote.notes && (
          <>
            <div className="my-8 border-t border-white/10" />
            <section>
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted">Notes</p>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">
                {quote.notes}
              </p>
            </section>
          </>
        )}

        {/* ── Footer ── */}
        <div className="my-10 border-t border-white/10" />
        <footer className="pb-4 text-center">
          <p className="text-sm font-medium text-foreground">{BUSINESS_NAME}</p>
          <p className="mt-1 text-xs text-muted">
            Thank you for the opportunity to quote your project.
          </p>
        </footer>
      </div>
    </div>
  )
}

// ─── Small components ─────────────────────────────────────────────────────────

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? 'font-medium text-foreground' : 'text-muted'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-bold text-foreground' : 'font-medium text-foreground/90'}`}>
        {value}
      </span>
    </div>
  )
}
