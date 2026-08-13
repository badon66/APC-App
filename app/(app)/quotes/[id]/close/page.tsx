'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Eraser, FileText, Check, Download } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { BUSINESS_ID } from '@/lib/config'
import { TERMS_SUMMARY, TERMS_INTRO, FULL_TERMS } from '@/lib/terms'
import { downloadTermsPdf } from '@/lib/termsPdf'

// ─── Types ────────────────────────────────────────────────────────────────────

type LineItem = {
  serviceName: string
  unit: string
  tier: string
  quantity: number
}

type Quote = {
  id: string
  customer_name: string
  customer_phone: string | null
  address: string | null
  quote_type: string
  salesperson: string | null
  final_quote: number | null
  tax: number | null
  line_items: LineItem[] | null
  job_id: string | null
  signature_url: string | null
  signed_name: string | null
  signed_at: string | null
}

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CloseDealPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)

  // Signer details
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  // Deposit — defaults to the 25% described in the terms (section 8)
  const [depositRequired, setDepositRequired] = useState(false)
  const [depositPercent, setDepositPercent] = useState('25')

  // Terms agreement — must be ticked before the signature area unlocks
  const [agreed, setAgreed] = useState(false)
  const [showFullTerms, setShowFullTerms] = useState(false)
  const [downloadingTerms, setDownloadingTerms] = useState(false)
  const [termsDownloadError, setTermsDownloadError] = useState('')

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hasSignature, setHasSignature] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('quotes')
        .select(
          'id, customer_name, customer_phone, address, quote_type, salesperson, final_quote, tax, line_items, job_id, signature_url, signed_name, signed_at'
        )
        .eq('id', id)
        .single()
      if (!data) {
        router.replace('/quotes')
        return
      }
      setQuote(data as Quote)
      setName(data.customer_name ?? '')
      setPhone(data.customer_phone ?? '')
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ─── Canvas ─────────────────────────────────────────────────────────────────

  // Size the canvas to its rendered width (retina-aware) and paint the white
  // "paper" background the signature is drawn on.
  const initCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastPointRef.current = canvasPoint(e)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastPointRef.current) return
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    const p = canvasPoint(e)
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastPointRef.current = p
    if (!hasSignature) setHasSignature(true)
  }

  function onPointerUp() {
    drawingRef.current = false
    lastPointRef.current = null
  }

  // Generate + download the terms PDF. Failure here must never disturb the
  // signing flow — it just surfaces a small message.
  async function downloadTerms() {
    setTermsDownloadError('')
    setDownloadingTerms(true)
    try {
      await downloadTermsPdf()
    } catch {
      setTermsDownloadError('Could not prepare the PDF. Please try again.')
    } finally {
      setDownloadingTerms(false)
    }
  }

  function clearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    setHasSignature(false)
  }

  // ─── Sign & close ───────────────────────────────────────────────────────────

  // Deposit is a percentage of the balance due (final quote + tax).
  const balanceDueValue = (quote?.final_quote ?? 0) + (quote?.tax ?? 0)
  const depositPercentValue = (() => {
    const n = parseFloat(depositPercent)
    return Number.isFinite(n) && n >= 0 ? n : 0
  })()
  const depositAmount = Math.round(balanceDueValue * (depositPercentValue / 100) * 100) / 100

  // A deposit that's switched on needs a real percentage before signing.
  const depositReady = !depositRequired || depositPercentValue > 0
  const canSign = agreed && hasSignature && name.trim().length > 0 && depositReady && !saving

  async function signAndClose() {
    if (!canSign || !quote || !canvasRef.current) return
    setSaving(true)
    setError('')

    try {
      const blob = await new Promise<Blob | null>(resolve =>
        canvasRef.current!.toBlob(resolve, 'image/png')
      )
      if (!blob) throw new Error('no signature image')

      const path = `${BUSINESS_ID}/signature-${crypto.randomUUID()}.png`
      const { error: upErr } = await supabase.storage.from('quote-photos').upload(path, blob, {
        contentType: 'image/png',
        upsert: true,
      })
      if (upErr) throw upErr
      const signatureUrl = supabase.storage.from('quote-photos').getPublicUrl(path).data.publicUrl

      const now = new Date().toISOString()
      const { error: updErr } = await supabase
        .from('quotes')
        .update({
          signature_url: signatureUrl,
          signed_name: name.trim(),
          signed_phone: phone.trim() || null,
          signed_email: email.trim() || null,
          signed_at: now,
          // The checkbox is required to reach this point, so this is always
          // true on a signed quote — recorded explicitly with its timestamp.
          terms_agreed: agreed,
          terms_agreed_at: now,
          deposit_required: depositRequired,
          deposit_percent: depositRequired ? depositPercentValue : null,
          deposit_amount: depositRequired ? depositAmount : null,
          status: 'sold',
        })
        .eq('id', quote.id)
      if (updErr) throw updErr

      // Closing the deal marks the quote Sold — create the linked job once,
      // same as the status button on the detail screen does.
      if (!quote.job_id) {
        const detail = [
          phone.trim() ? `Phone: ${phone.trim()}` : null,
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
        if (job) await supabase.from('quotes').update({ job_id: job.id }).eq('id', quote.id)
      }

      router.replace(`/quotes/${quote.id}`)
    } catch {
      setSaving(false)
      setError('Could not save the signed quote. Please try again.')
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading || !quote) {
    return (
      <div className="min-h-screen bg-base">
        <PageHeader title="Close Deal" backHref={`/quotes/${id}`} />
        <p className="text-sm text-muted text-center py-16">Loading…</p>
      </div>
    )
  }

  // Already signed — don't allow signing twice.
  if (quote.signature_url) {
    return (
      <div className="min-h-screen bg-base">
        <PageHeader title="Close Deal" backHref={`/quotes/${id}`} />
        <div className="p-4">
          <Card>
            <p className="text-sm text-foreground text-center py-4">
              This quote was already signed
              {quote.signed_name ? ` by ${quote.signed_name}` : ''}
              {quote.signed_at
                ? ` on ${new Date(quote.signed_at).toLocaleDateString('en-CA', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}`
                : ''}
              .
            </p>
            <Button fullWidth variant="secondary" onClick={() => router.replace(`/quotes/${id}`)}>
              Back to Quote
            </Button>
          </Card>
        </div>
      </div>
    )
  }

  const balanceDue = (quote.final_quote ?? 0) + (quote.tax ?? 0)

  return (
    <div className="min-h-screen bg-base">
      <PageHeader title="Close Deal" backHref={`/quotes/${id}`} />

      <div className="p-4 space-y-6 pb-12">

        {/* ── Deal summary ── */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{quote.customer_name}</p>
              {quote.address && <p className="text-xs text-muted truncate">{quote.address}</p>}
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-muted">Balance Due</p>
              <p className="text-xl font-bold text-accent">{fmtMoney(balanceDue)}</p>
            </div>
          </div>
        </Card>

        {/* ── Signer details ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
            Signer
          </h2>
          <Card>
            <div className="space-y-4">
              <Input label="Full Name" value={name} onChange={e => setName(e.target.value)} placeholder="John Smith" />
              <Input label="Phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(403) 555-0123" />
              <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
          </Card>
        </section>

        {/* ── Deposit ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
            Deposit
          </h2>
          <Card>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDepositRequired(false)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-all active:scale-95 ${
                    !depositRequired
                      ? 'bg-accent/15 text-accent border-accent/30'
                      : 'bg-transparent text-muted border-white/8 hover:bg-white/5'
                  }`}
                >
                  Deposit Not Needed
                </button>
                <button
                  type="button"
                  onClick={() => setDepositRequired(true)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-all active:scale-95 ${
                    depositRequired
                      ? 'bg-accent/15 text-accent border-accent/30'
                      : 'bg-transparent text-muted border-white/8 hover:bg-white/5'
                  }`}
                >
                  Deposit Needed
                </button>
              </div>

              {depositRequired && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm text-foreground">Deposit Percentage</label>
                    <div className="w-28">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        placeholder="25"
                        value={depositPercent}
                        onChange={e => setDepositPercent(e.target.value)}
                        className="text-right"
                        rightElement={<span className="text-xs text-muted">%</span>}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3.5 py-3 bg-accent/10 border border-accent/20 rounded-xl">
                    <span className="text-sm font-semibold text-foreground">Deposit Due</span>
                    <span className="text-xl font-bold text-accent">{fmtMoney(depositAmount)}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {depositPercentValue > 0
                      ? `${depositPercentValue}% of the ${fmtMoney(balanceDue)} balance due. Non-refundable once paid (see terms, section 8).`
                      : 'Enter a deposit percentage to continue.'}
                  </p>
                </>
              )}
            </div>
          </Card>
        </section>

        {/* ── Terms & conditions ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
            Terms &amp; Conditions
          </h2>
          <Card>
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-foreground/90">{TERMS_SUMMARY}</p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <button
                  type="button"
                  onClick={() => setShowFullTerms(true)}
                  className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                >
                  <FileText size={14} />
                  View full terms
                </button>
                <button
                  type="button"
                  onClick={downloadTerms}
                  disabled={downloadingTerms}
                  className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline disabled:opacity-60 disabled:hover:no-underline"
                >
                  <Download size={14} />
                  {downloadingTerms ? 'Preparing…' : 'Download Terms and Conditions'}
                </button>
              </div>
              {termsDownloadError && (
                <p className="text-xs text-danger">{termsDownloadError}</p>
              )}
              <div className="border-t border-white/8" />
              <button
                type="button"
                onClick={() => setAgreed(a => !a)}
                className="flex items-start gap-3 text-left w-full"
              >
                <span
                  className={`w-5 h-5 mt-0.5 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
                    agreed
                      ? 'bg-accent border-accent text-white'
                      : 'bg-transparent border-white/25 text-transparent'
                  }`}
                >
                  <Check size={13} strokeWidth={3} />
                </span>
                <span className="text-sm text-foreground">
                  I have read and agree to the terms and conditions
                </span>
              </button>
            </div>
          </Card>
        </section>

        {/* ── Signature ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
            Signature
          </h2>
          <div className="relative">
            <div className={agreed ? '' : 'opacity-40 pointer-events-none select-none'}>
              <canvas
                ref={initCanvas}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="w-full h-44 rounded-xl bg-white touch-none"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted">Sign above with your finger</p>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/15 bg-white/5 text-sm font-medium text-foreground hover:bg-white/10 active:scale-95 transition-all shrink-0"
                >
                  <Eraser size={16} />
                  Clear
                </button>
              </div>
            </div>
            {!agreed && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-muted bg-base/80 px-4 py-2 rounded-xl border border-white/10">
                  Agree to the terms above to sign
                </p>
              </div>
            )}
          </div>
        </section>

        {error && <p className="text-sm text-danger text-center">{error}</p>}

        <Button fullWidth size="lg" onClick={signAndClose} disabled={!canSign} loading={saving}>
          Sign &amp; Close Deal
        </Button>
      </div>

      {/* ── Full terms modal ── */}
      <Modal open={showFullTerms} onClose={() => setShowFullTerms(false)} title="Terms & Conditions">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-foreground/90">{TERMS_INTRO}</p>
          {FULL_TERMS.map(section => (
            <div key={section.heading}>
              <p className="text-sm font-semibold text-foreground">{section.heading}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{section.body}</p>
            </div>
          ))}
          <Button fullWidth variant="secondary" onClick={() => setShowFullTerms(false)}>
            Close
          </Button>
        </div>
      </Modal>
    </div>
  )
}
