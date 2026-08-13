'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
import { buildSignedAgreementPdf, type AgreementLineItem } from '@/lib/agreementPdf'

// The Close Deal signing screen. One component, two entry points:
//   • 'app'    — /quotes/[id]/close, used by the salesperson in person
//   • 'public' — /share/[id]/sign, used by the customer from the shared link
// Only the framing differs (title, back link, where it returns to). The
// contract itself — terms, agreement checkbox, deposit, signature — is
// identical either way, so both routes produce the same signed record.

// ─── Types ────────────────────────────────────────────────────────────────────

type LineItem = {
  serviceName: string
  unit: string
  tier: string
  quantity: number
  lineTotal?: number
  rateLow?: number
  rateMid?: number
  rateHigh?: number
  customRate?: number | null
}

type Quote = {
  id: string
  customer_name: string
  customer_phone: string | null
  address: string | null
  quote_type: string
  salesperson: string | null
  actual_price: number | null
  discount: number | null
  final_quote: number | null
  tax: number | null
  signed_pdf_url: string | null
  line_items: LineItem[] | null
  job_id: string | null
  signature_url: string | null
  signed_name: string | null
  signed_phone: string | null
  signed_email: string | null
  signed_at: string | null
  terms_agreed: boolean | null
  terms_agreed_at: string | null
  deposit_required: boolean | null
  deposit_percent: number | null
  deposit_amount: number | null
}

const QUOTE_FIELDS =
  'id, customer_name, customer_phone, address, quote_type, salesperson, actual_price, discount, final_quote, tax, line_items, job_id, signature_url, signed_name, signed_phone, signed_email, signed_at, terms_agreed, terms_agreed_at, deposit_required, deposit_percent, deposit_amount, signed_pdf_url'

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

function fmtDateTime(s: string): string {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CloseDealScreenProps {
  quoteId: string
  variant: 'app' | 'public'
}

export default function CloseDealScreen({ quoteId, variant }: CloseDealScreenProps) {
  const router = useRouter()
  const isPublic = variant === 'public'
  const backHref = isPublic ? `/share/${quoteId}` : `/quotes/${quoteId}`

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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
      const { data } = await supabase.from('quotes').select(QUOTE_FIELDS).eq('id', quoteId).single()
      if (!data) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setQuote(data as Quote)
      setName(data.customer_name ?? '')
      setPhone(data.customer_phone ?? '')
      setLoading(false)
    }
    load()
  }, [quoteId])

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

      // Re-check right before writing: the other party may have signed while
      // this screen was open (in person vs. remotely), and a deal must never
      // be signed twice.
      const { data: fresh } = await supabase
        .from('quotes')
        .select('signature_url')
        .eq('id', quote.id)
        .single()
      if (fresh?.signature_url) {
        const { data: latest } = await supabase
          .from('quotes')
          .select(QUOTE_FIELDS)
          .eq('id', quote.id)
          .single()
        if (latest) setQuote(latest as Quote)
        setSaving(false)
        return
      }

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

      router.replace(backHref)
    } catch {
      setSaving(false)
      setError('Could not save the signed quote. Please try again.')
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const headerTitle = isPublic ? 'Review & Sign' : 'Close Deal'

  if (loading) {
    return (
      <div className="min-h-screen bg-base">
        <PageHeader title={headerTitle} backHref={backHref} />
        <p className="text-sm text-muted text-center py-16">Loading…</p>
      </div>
    )
  }

  if (notFound || !quote) {
    return (
      <div className="min-h-screen bg-base">
        <PageHeader title={headerTitle} backHref={backHref} />
        <div className="p-4">
          <Card>
            <p className="text-sm text-muted text-center py-6">This quote could not be found.</p>
          </Card>
        </div>
      </div>
    )
  }

  // Already signed — show the agreement read-only so it can't be resigned.
  if (quote.signature_url) {
    return (
      <div className="min-h-screen bg-base">
        <PageHeader title="Signed Agreement" backHref={backHref} />
        <div className="p-4 space-y-6 pb-12">
          <div className="flex items-center gap-2 px-3.5 py-3 bg-accent/10 border border-accent/25 rounded-xl">
            <Check size={16} className="text-accent shrink-0" />
            <p className="text-sm font-medium text-foreground">
              This contract has been signed. No further action is needed.
            </p>
          </div>

          {/* ── Signature ── */}
          <section>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
              Signature
            </h2>
            <Card>
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={quote.signature_url}
                  alt="Signature"
                  className="w-full h-36 object-contain rounded-xl bg-white"
                />
                <div className="space-y-1 text-sm">
                  {quote.signed_name && (
                    <p className="font-medium text-foreground">{quote.signed_name}</p>
                  )}
                  {quote.signed_at && (
                    <p className="text-muted">Signed {fmtDateTime(quote.signed_at)}</p>
                  )}
                  {(quote.signed_email || quote.signed_phone) && (
                    <p className="text-muted">
                      {[quote.signed_email, quote.signed_phone].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </section>

          {/* ── Agreed totals + deposit ── */}
          <section>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
              Agreed Amount
            </h2>
            <Card>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">Balance Due</span>
                  <span className="text-lg font-bold text-accent">
                    {fmtMoney(balanceDueValue)}
                  </span>
                </div>
                {quote.deposit_required != null && (
                  <>
                    <div className="border-t border-white/8" />
                    {quote.deposit_required ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted">
                          Deposit
                          {quote.deposit_percent != null ? ` (${quote.deposit_percent}%)` : ''}
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {fmtMoney(quote.deposit_amount)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">
                        No deposit required — full balance due upon completion.
                      </p>
                    )}
                  </>
                )}
              </div>
            </Card>
          </section>

          {/* ── Agreed terms ── */}
          <section>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
              Agreed Terms
            </h2>
            <Card>
              <div className="space-y-4">
                {quote.terms_agreed && (
                  <div className="flex items-start gap-2.5">
                    <Check size={15} className="text-accent shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground">
                      Terms &amp; conditions agreed
                      {quote.terms_agreed_at ? ` on ${fmtDateTime(quote.terms_agreed_at)}` : ''}
                    </p>
                  </div>
                )}
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
                {termsDownloadError && <p className="text-xs text-danger">{termsDownloadError}</p>}
              </div>
            </Card>
          </section>
        </div>

        <FullTermsModal open={showFullTerms} onClose={() => setShowFullTerms(false)} />
      </div>
    )
  }

  const balanceDue = balanceDueValue

  return (
    <div className="min-h-screen bg-base">
      <PageHeader title={headerTitle} backHref={backHref} />

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
          {isPublic ? 'Agree & Sign Contract' : 'Sign & Close Deal'}
        </Button>
      </div>

      <FullTermsModal open={showFullTerms} onClose={() => setShowFullTerms(false)} />
    </div>
  )
}

// ─── Small components ─────────────────────────────────────────────────────────

function FullTermsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Terms & Conditions">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-foreground/90">{TERMS_INTRO}</p>
        {FULL_TERMS.map(section => (
          <div key={section.heading}>
            <p className="text-sm font-semibold text-foreground">{section.heading}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{section.body}</p>
          </div>
        ))}
        <Button fullWidth variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
