'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Plus, ChevronRight, UserPlus } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import LocationButton from '@/components/ui/LocationButton'
import PhotoUpload from '@/components/ui/PhotoUpload'
import { supabase } from '@/lib/supabase'
import { BUSINESS_ID } from '@/lib/config'
import type { Tier, QuoteStatus, SurfaceType } from '@/lib/config'

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceRate = {
  id: string
  service_name: string
  unit: string
  category: string
  rate_low: number
  rate_mid: number
  rate_high: number
}

type QuoteItem = {
  tempId: string
  serviceRateId: string
  serviceName: string
  unit: string
  category: string
  rateLow: number
  rateMid: number
  rateHigh: number
  tier: Tier
  quantity: string
}

type Salesperson = { id: string; name: string }

type ContextPhoto = {
  tempId: string
  url: string | null
  file: File | null
  previewUrl: string | null
  description: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const QUOTE_TYPES: { value: SurfaceType; label: string }[] = [
  { value: 'asphalt', label: 'Asphalt' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'both', label: 'Both' },
]

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

const PAYMENT_TYPES = ['Card', 'Cash', 'E-Transfer', 'Check', 'Other']

const TIER_CYCLE: Tier[] = ['low', 'mid', 'high']

const TIER_META: Record<Tier, { label: string; cls: string }> = {
  low: { label: 'LOW', cls: 'bg-info/15 text-info border-info/30' },
  mid: { label: 'MID', cls: 'bg-warning/15 text-warning border-warning/30' },
  high: { label: 'HIGH', cls: 'bg-accent/15 text-accent border-accent/30' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rateFor(item: QuoteItem, tier: Tier): number {
  if (tier === 'low') return item.rateLow
  if (tier === 'high') return item.rateHigh
  return item.rateMid
}

function lowerTier(tier: Tier): Tier {
  if (tier === 'high') return 'mid'
  if (tier === 'mid') return 'low'
  return 'low'
}

function nextTier(tier: Tier): Tier {
  return TIER_CYCLE[(TIER_CYCLE.indexOf(tier) + 1) % TIER_CYCLE.length]
}

function fmtRate(rate: number, unit: string): string {
  if (unit === 'lbs') return `$${rate.toFixed(2)}/lb`
  if (unit === 'ft') return `$${rate.toFixed(2)}/ft`
  return `$${rate.toFixed(2)}/sq ft`
}

function fmtMoney(n: number): string {
  return '$' + (Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function num(s: string): number {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function matchesType(category: string, quoteType: SurfaceType): boolean {
  if (quoteType === 'both') return true
  if (quoteType === 'asphalt') return category === 'asphalt' || category === 'both'
  return category === 'concrete' || category === 'both'
}

function todayLocal(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

// ─── Component ────────────────────────────────────────────────────────────────

interface QuoteBuilderProps {
  quoteId?: string
}

export default function QuoteBuilder({ quoteId }: QuoteBuilderProps) {
  const router = useRouter()
  const isEdit = !!quoteId

  // Salesperson (multiple allowed per quote)
  const [salespersons, setSalespersons] = useState<Salesperson[]>([])
  const [selectedSalespersons, setSelectedSalespersons] = useState<string[]>([])
  const [showAddSp, setShowAddSp] = useState(false)
  const [newSpName, setNewSpName] = useState('')
  const [savingSp, setSavingSp] = useState(false)

  // Customer
  const [customerName, setCustomerName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [quoteDate, setQuoteDate] = useState(todayLocal())

  // Quote type + services
  const [quoteType, setQuoteType] = useState<SurfaceType>('asphalt')
  const [services, setServices] = useState<ServiceRate[]>([])
  const [items, setItems] = useState<QuoteItem[]>([])
  const [showPicker, setShowPicker] = useState(false)

  // Totals
  const [subtotal, setSubtotal] = useState('')
  const [discount, setDiscount] = useState('')
  const [tax, setTax] = useState('')
  const [taxManual, setTaxManual] = useState(false)
  const [soldPrice, setSoldPrice] = useState('')

  // Payment + status
  const [paymentType, setPaymentType] = useState('')
  const [paymentOther, setPaymentOther] = useState('')
  const [status, setStatus] = useState<QuoteStatus>('quoted')

  // Photos
  const [asphaltFile, setAsphaltFile] = useState<File | null>(null)
  const [concreteFile, setConcreteFile] = useState<File | null>(null)
  const [asphaltUrl, setAsphaltUrl] = useState<string | null>(null)
  const [concreteUrl, setConcreteUrl] = useState<string | null>(null)
  const asphaltPreview = useMemo(() => (asphaltFile ? URL.createObjectURL(asphaltFile) : null), [asphaltFile])
  const concretePreview = useMemo(() => (concreteFile ? URL.createObjectURL(concreteFile) : null), [concreteFile])

  // Context photos (damage, surface conditions, problem areas — each with a description)
  const [contextPhotos, setContextPhotos] = useState<ContextPhoto[]>([])
  const contextInputRef = useRef<HTMLInputElement>(null)

  // Notes
  const [notes, setNotes] = useState('')
  const [followUpNotes, setFollowUpNotes] = useState('')

  // UI state
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [existingJobId, setExistingJobId] = useState<string | null>(null)
  const [nameError, setNameError] = useState('')
  const [saveError, setSaveError] = useState('')

  // ─── Derived totals ───────────────────────────────────────────────────────────

  const suggested = useMemo(
    () => items.reduce((s, it) => s + num(it.quantity) * rateFor(it, it.tier), 0),
    [items]
  )
  const suggestedLowest = useMemo(
    () => items.reduce((s, it) => s + num(it.quantity) * rateFor(it, lowerTier(it.tier)), 0),
    [items]
  )
  const finalQuote = useMemo(() => num(subtotal) - num(discount), [subtotal, discount])
  const balanceDue = finalQuote + num(tax)

  // Auto-tax (5% of final) unless manually overridden
  useEffect(() => {
    if (!taxManual) setTax(finalQuote ? (finalQuote * 0.05).toFixed(2) : '')
  }, [finalQuote, taxManual])

  // ─── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadSalespersons()
    loadServices()
    if (isEdit) loadQuote()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadSalespersons() {
    const { data } = await supabase
      .from('salespersons')
      .select('id, name')
      .eq('business_id', BUSINESS_ID)
      .eq('active', true)
      .order('name')
    setSalespersons(data ?? [])
  }

  async function loadServices() {
    const { data } = await supabase
      .from('service_rates')
      .select('id, service_name, unit, category, rate_low, rate_mid, rate_high')
      .eq('business_id', BUSINESS_ID)
      .eq('active', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('service_name')
    setServices(data ?? [])
  }

  async function loadQuote() {
    const { data: q } = await supabase
      .from('quotes')
      .select(
        'salesperson, customer_name, customer_phone, address, quote_type, status, notes, follow_up_notes, actual_price, discount, tax, sold_price, payment_type, payment_type_other, asphalt_photo_url, concrete_photo_url, context_photos, line_items, job_id, created_at'
      )
      .eq('id', quoteId)
      .single()

    if (!q) {
      router.replace('/quotes')
      return
    }

    setSelectedSalespersons(
      (q.salesperson ?? '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
    )
    setCustomerName(q.customer_name ?? '')
    setPhone(q.customer_phone ?? '')
    setAddress(q.address ?? '')
    setQuoteType((q.quote_type as SurfaceType) ?? 'asphalt')
    setStatus((q.status as QuoteStatus) ?? 'quoted')
    setNotes(q.notes ?? '')
    setFollowUpNotes(q.follow_up_notes ?? '')
    setSubtotal(q.actual_price != null ? String(q.actual_price) : '')
    setDiscount(q.discount != null ? String(q.discount) : '')
    if (q.tax != null) {
      setTax(String(q.tax))
      setTaxManual(true)
    }
    setSoldPrice(q.sold_price != null ? String(q.sold_price) : '')
    setPaymentType(q.payment_type ?? '')
    setPaymentOther(q.payment_type_other ?? '')
    setAsphaltUrl(q.asphalt_photo_url ?? null)
    setConcreteUrl(q.concrete_photo_url ?? null)
    setContextPhotos(
      Array.isArray(q.context_photos)
        ? q.context_photos.map((p: Record<string, unknown>) => ({
            tempId: crypto.randomUUID(),
            url: p.url != null ? String(p.url) : null,
            file: null,
            previewUrl: null,
            description: p.description != null ? String(p.description) : '',
          }))
        : []
    )
    setExistingJobId(q.job_id ?? null)
    if (q.created_at) setQuoteDate(String(q.created_at).slice(0, 10))
    setItems(
      Array.isArray(q.line_items)
        ? q.line_items.map((i: Record<string, unknown>) => ({
            tempId: crypto.randomUUID(),
            serviceRateId: String(i.serviceRateId ?? ''),
            serviceName: String(i.serviceName ?? ''),
            unit: String(i.unit ?? 'ft²'),
            category: String(i.category ?? 'asphalt'),
            rateLow: Number(i.rateLow ?? 0),
            rateMid: Number(i.rateMid ?? 0),
            rateHigh: Number(i.rateHigh ?? 0),
            tier: (i.tier as Tier) ?? 'mid',
            quantity: i.quantity != null ? String(i.quantity) : '',
          }))
        : []
    )
    setLoading(false)
  }

  // ─── Salesperson handlers ─────────────────────────────────────────────────────

  function toggleSalesperson(name: string) {
    setSelectedSalespersons(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  async function addSalesperson() {
    const name = newSpName.trim()
    if (!name) return
    setSavingSp(true)
    const { data, error } = await supabase
      .from('salespersons')
      .insert({ business_id: BUSINESS_ID, name, active: true })
      .select('id, name')
      .single()
    setSavingSp(false)
    if (!error && data) {
      setSalespersons(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedSalespersons(prev => (prev.includes(data.name) ? prev : [...prev, data.name]))
      setNewSpName('')
      setShowAddSp(false)
    }
  }

  // ─── Item handlers ────────────────────────────────────────────────────────────

  function changeQuoteType(t: SurfaceType) {
    setQuoteType(t)
    setItems(prev => prev.filter(i => matchesType(i.category, t)))
  }

  function addItem(svc: ServiceRate) {
    setItems(prev => [
      ...prev,
      {
        tempId: crypto.randomUUID(),
        serviceRateId: svc.id,
        serviceName: svc.service_name,
        unit: svc.unit,
        category: svc.category,
        rateLow: svc.rate_low,
        rateMid: svc.rate_mid,
        rateHigh: svc.rate_high,
        tier: 'mid',
        quantity: '',
      },
    ])
    setShowPicker(false)
  }

  function removeItem(tempId: string) {
    setItems(prev => prev.filter(i => i.tempId !== tempId))
  }

  function setQty(tempId: string, qty: string) {
    setItems(prev => prev.map(i => (i.tempId === tempId ? { ...i, quantity: qty } : i)))
  }

  function cycleItemTier(tempId: string) {
    setItems(prev => prev.map(i => (i.tempId === tempId ? { ...i, tier: nextTier(i.tier) } : i)))
  }

  // ─── Context photo handlers ─────────────────────────────────────────────────────

  function addContextPhotos(files: FileList | null) {
    if (!files || files.length === 0) return
    const additions: ContextPhoto[] = Array.from(files).map(file => ({
      tempId: crypto.randomUUID(),
      url: null,
      file,
      previewUrl: URL.createObjectURL(file),
      description: '',
    }))
    setContextPhotos(prev => [...prev, ...additions])
    if (contextInputRef.current) contextInputRef.current.value = ''
  }

  function setContextDescription(tempId: string, description: string) {
    setContextPhotos(prev => prev.map(p => (p.tempId === tempId ? { ...p, description } : p)))
  }

  function removeContextPhoto(tempId: string) {
    setContextPhotos(prev => prev.filter(p => p.tempId !== tempId))
  }

  // ─── Save ─────────────────────────────────────────────────────────────────────

  async function uploadPhoto(file: File, prefix: string): Promise<string | null> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${BUSINESS_ID}/${prefix}-${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('quote-photos').upload(path, file, { upsert: true })
    if (error) return null
    return supabase.storage.from('quote-photos').getPublicUrl(path).data.publicUrl
  }

  async function save() {
    if (!customerName.trim()) {
      setNameError('Customer name is required.')
      return
    }
    setNameError('')
    setSaveError('')
    setSaving(true)

    // Upload photos relevant to quote type
    let aUrl = asphaltUrl
    let cUrl = concreteUrl
    try {
      if (quoteType !== 'concrete' && asphaltFile) aUrl = await uploadPhoto(asphaltFile, 'asphalt')
      if (quoteType !== 'asphalt' && concreteFile) cUrl = await uploadPhoto(concreteFile, 'concrete')
    } catch {
      // non-fatal — proceed without blocking the save
    }

    // Upload any newly-added context photos, then build the saved array.
    const contextPhotosPayload: { url: string; description: string }[] = []
    for (const p of contextPhotos) {
      let url = p.url
      if (!url && p.file) {
        try {
          url = await uploadPhoto(p.file, 'context')
        } catch {
          url = null
        }
      }
      if (url) contextPhotosPayload.push({ url, description: p.description.trim() })
    }

    const lineItems = items.map(i => ({
      serviceRateId: i.serviceRateId,
      serviceName: i.serviceName,
      unit: i.unit,
      category: i.category,
      rateLow: i.rateLow,
      rateMid: i.rateMid,
      rateHigh: i.rateHigh,
      tier: i.tier,
      quantity: num(i.quantity),
      lineTotal: num(i.quantity) * rateFor(i, i.tier),
    }))

    const payload: Record<string, unknown> = {
      business_id: BUSINESS_ID,
      salesperson: selectedSalespersons.length ? selectedSalespersons.join(', ') : null,
      customer_name: customerName.trim(),
      customer_phone: phone.trim() || null,
      address: address.trim() || null,
      quote_type: quoteType,
      status,
      notes: notes.trim() || null,
      follow_up_notes: followUpNotes.trim() || null,
      suggested_total: suggested,
      suggested_lowest_total: suggestedLowest,
      actual_price: subtotal === '' ? null : num(subtotal),
      discount: discount === '' ? null : num(discount),
      final_quote: subtotal === '' && discount === '' ? null : finalQuote,
      tax: tax === '' ? null : num(tax),
      sold_price: soldPrice === '' ? null : num(soldPrice),
      payment_type: paymentType || null,
      payment_type_other: paymentType === 'Other' ? paymentOther.trim() || null : null,
      asphalt_photo_url: quoteType === 'concrete' ? null : aUrl,
      concrete_photo_url: quoteType === 'asphalt' ? null : cUrl,
      context_photos: contextPhotosPayload,
      line_items: lineItems,
      created_at: new Date(quoteDate + 'T12:00:00').toISOString(),
    }

    let savedId = quoteId
    if (isEdit) {
      const { error } = await supabase.from('quotes').update(payload).eq('id', quoteId)
      if (error) {
        setSaving(false)
        setSaveError('Failed to update quote. Please try again.')
        return
      }
    } else {
      const { data, error } = await supabase.from('quotes').insert(payload).select('id').single()
      if (error || !data) {
        setSaving(false)
        setSaveError('Failed to save quote. Please try again.')
        return
      }
      savedId = data.id
    }

    // When sold, create a linked job (once)
    if (status === 'sold' && savedId && !existingJobId) {
      await createLinkedJob(savedId)
    }

    setSaving(false)
    router.push(`/quotes/${savedId}`)
  }

  async function createLinkedJob(qId: string) {
    const detail = [
      phone.trim() ? `Phone: ${phone.trim()}` : null,
      `Quote type: ${quoteType}`,
      ...items.map(i => `${i.serviceName} — ${num(i.quantity)} ${i.unit} (${i.tier})`),
      `Final quote: ${fmtMoney(finalQuote)}`,
      `Balance due: ${fmtMoney(balanceDue)}`,
      selectedSalespersons.length
        ? `Salesperson: ${selectedSalespersons.join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n')

    const { data: job } = await supabase
      .from('jobs')
      .insert({
        business_id: BUSINESS_ID,
        title: customerName.trim(),
        address: address.trim() || null,
        notes: detail,
      })
      .select('id')
      .single()

    if (job) {
      await supabase.from('quotes').update({ job_id: job.id }).eq('id', qId)
      setExistingJobId(job.id)
    }
  }

  // ─── Render helpers ───────────────────────────────────────────────────────────

  function renderItem(item: QuoteItem) {
    const rate = rateFor(item, item.tier)
    return (
      <Card key={item.tempId} padding="sm">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-foreground leading-tight truncate">
                {item.serviceName}
              </p>
              <span className="text-sm font-bold text-foreground shrink-0">
                {fmtMoney(num(item.quantity) * rate)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={item.quantity}
                onChange={e => setQty(item.tempId, e.target.value)}
                rightElement={<span className="text-xs text-muted whitespace-nowrap">sq ft</span>}
              />
              <button
                type="button"
                onClick={() => cycleItemTier(item.tempId)}
                className={`flex flex-col items-center justify-center gap-0.5 px-2.5 py-1.5 rounded-lg border text-center min-w-[96px] shrink-0 transition-all active:scale-95 ${TIER_META[item.tier].cls}`}
              >
                <span className="text-[10px] font-bold tracking-wider leading-none">
                  {TIER_META[item.tier].label}
                </span>
                <span className="text-[9px] opacity-80 whitespace-nowrap leading-none">
                  {fmtRate(rate, item.unit)}
                </span>
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => removeItem(item.tempId)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-danger/10 text-muted hover:text-danger transition-colors shrink-0 mt-0.5"
            aria-label="Remove service"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </Card>
    )
  }

  function renderItemsSection() {
    if (items.length === 0) {
      return (
        <Card>
          <p className="text-sm text-muted text-center py-4">No services added yet.</p>
        </Card>
      )
    }
    if (quoteType === 'both') {
      const asphalt = items.filter(i => i.category !== 'concrete')
      const concrete = items.filter(i => i.category === 'concrete')
      return (
        <div className="space-y-4">
          {asphalt.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Asphalt Services
              </p>
              {asphalt.map(renderItem)}
            </div>
          )}
          {asphalt.length > 0 && concrete.length > 0 && <div className="border-t border-white/8" />}
          {concrete.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Concrete Services
              </p>
              {concrete.map(renderItem)}
            </div>
          )}
        </div>
      )
    }
    return <div className="space-y-2">{items.map(renderItem)}</div>
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-base">
        <PageHeader title="Quote" backHref="/quotes" />
        <p className="text-sm text-muted text-center py-16">Loading…</p>
      </div>
    )
  }

  const pickerServices = services.filter(s => matchesType(s.category, quoteType))

  return (
    <div className="min-h-screen bg-base">
      <PageHeader title={isEdit ? 'Edit Quote' : 'New Quote'} backHref="/quotes" />

      <div className="p-4 space-y-6 pb-40">

        {/* ── Salesperson ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
            Salesperson
          </h2>
          <Card>
            <div className="space-y-3">
              <p className="text-xs text-muted">Tap to assign one or more salespeople.</p>
              {salespersons.length === 0 ? (
                <p className="text-sm text-muted">No salespeople yet. Add one to get started.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {salespersons.map(sp => {
                    const active = selectedSalespersons.includes(sp.name)
                    return (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => toggleSalesperson(sp.name)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all active:scale-95 ${
                          active
                            ? 'bg-accent/15 text-accent border-accent/30'
                            : 'bg-transparent text-muted border-white/8 hover:bg-white/5'
                        }`}
                      >
                        {sp.name}
                      </button>
                    )
                  })}
                </div>
              )}
              <Button variant="secondary" fullWidth onClick={() => setShowAddSp(true)}>
                <UserPlus size={14} />
                Add Salesperson
              </Button>
            </div>
          </Card>
        </section>

        {/* ── Customer ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
            Customer Info
          </h2>
          <Card>
            <div className="space-y-4">
              <Input
                label="Customer Name"
                value={customerName}
                onChange={e => {
                  setCustomerName(e.target.value)
                  if (nameError) setNameError('')
                }}
                placeholder="John Smith"
                error={nameError}
              />
              <div>
                <Input
                  label="Address"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="123 Main St, Calgary, AB"
                />
                <div className="mt-2">
                  <LocationButton onAddress={setAddress} />
                </div>
              </div>
              <Input
                label="Phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(403) 555-0123"
              />
              <Input
                label="Date"
                type="date"
                value={quoteDate}
                onChange={e => setQuoteDate(e.target.value)}
              />
            </div>
          </Card>
        </section>

        {/* ── Quote Type ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
            Quote Type
          </h2>
          <Card padding="sm">
            <div className="grid grid-cols-3 gap-2">
              {QUOTE_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => changeQuoteType(t.value)}
                  className={`py-3 rounded-xl text-sm font-semibold border transition-all ${
                    quoteType === t.value
                      ? 'bg-accent/15 text-accent border-accent/30'
                      : 'bg-transparent text-muted border-white/8 hover:bg-white/5'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Card>
        </section>

        {/* ── Services ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest">Services</h2>
            <Button size="sm" variant="secondary" onClick={() => setShowPicker(true)}>
              <Plus size={14} />
              Add Service
            </Button>
          </div>
          {renderItemsSection()}
        </section>

        {/* ── Totals ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Totals</h2>
          <Card>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Suggested</span>
                <span className="text-sm font-semibold text-foreground">{fmtMoney(suggested)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Suggested Lowest</span>
                <span className="text-sm font-semibold text-foreground">{fmtMoney(suggestedLowest)}</span>
              </div>

              <div className="border-t border-white/8" />

              <div className="flex items-center justify-between gap-3">
                <label className="text-sm text-foreground">Quote Subtotal</label>
                <div className="w-36">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={subtotal}
                    onChange={e => setSubtotal(e.target.value)}
                    className="text-right"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm text-foreground">Quote Discount</label>
                <div className="w-36">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    className="text-right"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground font-medium">Final Quote</span>
                <span className="text-sm font-bold text-foreground">{fmtMoney(finalQuote)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm text-foreground">Tax (5%)</label>
                <div className="w-36">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={tax}
                    onChange={e => {
                      setTaxManual(true)
                      setTax(e.target.value)
                    }}
                    className="text-right"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between px-3.5 py-3 bg-accent/10 border border-accent/20 rounded-xl">
                <span className="text-sm font-semibold text-foreground">Balance Due</span>
                <span className="text-2xl font-bold text-accent">{fmtMoney(balanceDue)}</span>
              </div>

              <div className="border-t border-white/8" />

              <div className="flex items-center justify-between gap-3">
                <label className="text-sm text-foreground">Sold</label>
                <div className="w-36">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={soldPrice}
                    onChange={e => setSoldPrice(e.target.value)}
                    className="text-right"
                  />
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* ── Payment ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
            Payment Type
          </h2>
          <Card>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_TYPES.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPaymentType(p)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    paymentType === p
                      ? 'bg-accent/15 text-accent border-accent/30'
                      : 'bg-transparent text-muted border-white/8 hover:bg-white/5'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            {paymentType === 'Other' && (
              <div className="mt-3">
                <Input
                  placeholder="Custom payment method"
                  value={paymentOther}
                  onChange={e => setPaymentOther(e.target.value)}
                />
              </div>
            )}
          </Card>
        </section>

        {/* ── Status ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Status</h2>
          <button
            type="button"
            onClick={() => setStatus(STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length])}
            className={`w-full py-3 rounded-xl text-sm font-semibold border transition-all active:scale-[0.99] ${STATUS_META[status].cls}`}
          >
            {STATUS_META[status].label}
          </button>
        </section>

        {/* ── Photos ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Photos</h2>
          <Card>
            <div className="space-y-4">
              {quoteType !== 'concrete' && (
                <PhotoUpload
                  label="Asphalt Quote Card Photo"
                  value={asphaltUrl}
                  previewUrl={asphaltPreview}
                  onChange={f => {
                    setAsphaltFile(f)
                    if (!f) setAsphaltUrl(null)
                  }}
                />
              )}
              {quoteType !== 'asphalt' && (
                <PhotoUpload
                  label="Concrete Quote Card Photo"
                  value={concreteUrl}
                  previewUrl={concretePreview}
                  onChange={f => {
                    setConcreteFile(f)
                    if (!f) setConcreteUrl(null)
                  }}
                />
              )}
            </div>
          </Card>
        </section>

        {/* ── Context Photos ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest">
              Context Photos
            </h2>
            <Button size="sm" variant="secondary" onClick={() => contextInputRef.current?.click()}>
              <Plus size={14} />
              Add Photo
            </Button>
          </div>
          <input
            ref={contextInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={e => addContextPhotos(e.target.files)}
          />
          {contextPhotos.length === 0 ? (
            <Card>
              <p className="text-sm text-muted text-center py-4">
                Add photos of damage, surface conditions, or problem areas. Each can have its own
                description.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {contextPhotos.map(p => (
                <Card key={p.tempId} padding="sm">
                  <div className="flex gap-3">
                    <div className="w-24 h-24 shrink-0 rounded-lg overflow-hidden border border-white/8 bg-surface">
                      {p.previewUrl || p.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.previewUrl || p.url || ''}
                          alt="Context"
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <textarea
                        value={p.description}
                        onChange={e => setContextDescription(p.tempId, e.target.value)}
                        placeholder="Describe what this shows…"
                        rows={2}
                        className="w-full px-3 py-2 bg-surface border border-white/8 rounded-xl text-foreground placeholder:text-muted text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeContextPhoto(p.tempId)}
                        className="self-start inline-flex items-center gap-1 text-xs text-muted hover:text-danger transition-colors"
                      >
                        <Trash2 size={12} />
                        Remove
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* ── Notes ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Notes</h2>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Additional notes…"
            rows={3}
            className="w-full px-3.5 py-3 bg-surface border border-white/8 rounded-xl text-foreground placeholder:text-muted text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors resize-none"
          />
        </section>

        {/* ── Follow-Up ── */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
            Follow-Up
          </h2>
          <textarea
            value={followUpNotes}
            onChange={e => setFollowUpNotes(e.target.value)}
            placeholder="What to send or do — e.g. send photos, send product info, quote another address…"
            rows={3}
            className="w-full px-3.5 py-3 bg-surface border border-white/8 rounded-xl text-foreground placeholder:text-muted text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors resize-none"
          />
        </section>

        {saveError && <p className="text-sm text-danger text-center">{saveError}</p>}
      </div>

      {/* ── Sticky save bar ── */}
      <div className="fixed bottom-20 left-0 right-0 z-40 px-4 pt-2 pb-2 bg-base border-t border-white/8">
        <Button fullWidth size="lg" onClick={save} loading={saving}>
          {isEdit ? 'Update Quote' : 'Save Quote'}
        </Button>
      </div>

      {/* ── Service picker modal ── */}
      <Modal open={showPicker} onClose={() => setShowPicker(false)} title="Add Service">
        {pickerServices.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">
            No matching services. Configure them in Settings.
          </p>
        ) : (
          <div className="space-y-1">
            {pickerServices.map(svc => (
              <button
                key={svc.id}
                type="button"
                onClick={() => addItem(svc)}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 active:bg-white/8 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{svc.service_name}</p>
                  <p className="text-xs text-muted capitalize">{svc.category}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-muted">
                  <span className="text-xs">Mid: {fmtRate(svc.rate_mid, svc.unit)}</span>
                  <ChevronRight size={14} />
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* ── Add salesperson modal ── */}
      <Modal open={showAddSp} onClose={() => setShowAddSp(false)} title="Add Salesperson">
        <div className="space-y-4">
          <Input
            label="Name"
            value={newSpName}
            onChange={e => setNewSpName(e.target.value)}
            placeholder="Jane Doe"
          />
          <Button fullWidth onClick={addSalesperson} loading={savingSp}>
            Add Salesperson
          </Button>
        </div>
      </Modal>
    </div>
  )
}
