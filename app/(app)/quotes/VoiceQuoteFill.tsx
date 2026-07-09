'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Sparkles } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import type { SurfaceType } from '@/lib/config'

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceInfo = {
  id: string
  service_name: string
  unit: string
  category: string
}

export type VoiceFillResult = {
  customerName: string | null
  address: string | null
  phone: string | null
  quoteType: SurfaceType | null
  items: { serviceRateId: string; quantity: number }[]
  notes: string | null
}

interface VoiceQuoteFillProps {
  services: ServiceInfo[]
  onApply: (result: VoiceFillResult) => void
}

type Phase = 'idle' | 'recording' | 'processing' | 'confirm' | 'error'

// Minimal typing for the browser SpeechRecognition API (no built-in TS types).
type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionInstance)
    | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VoiceQuoteFill({ services, onApply }: VoiceQuoteFillProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [interim, setInterim] = useState('')
  const [finalText, setFinalText] = useState('')
  const [result, setResult] = useState<VoiceFillResult | null>(null)
  const [paraphrase, setParaphrase] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const finalTextRef = useRef('')
  const cancelledRef = useRef(false)

  useEffect(() => {
    return () => recognitionRef.current?.abort()
  }, [])

  function startRecording() {
    const SR = getSpeechRecognition()
    if (!SR) {
      setErrorMsg('Voice input is not supported in this browser. Try Chrome, Edge, or Safari.')
      setPhase('error')
      return
    }

    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    finalTextRef.current = ''
    cancelledRef.current = false
    setFinalText('')
    setInterim('')

    rec.onresult = event => {
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (res.isFinal) finalTextRef.current += res[0].transcript + ' '
        else interimText += res[0].transcript
      }
      setFinalText(finalTextRef.current)
      setInterim(interimText)
    }

    rec.onerror = event => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      cancelledRef.current = true
      setErrorMsg(
        event.error === 'not-allowed'
          ? 'Microphone access was denied. Allow it in your browser settings and try again.'
          : 'Voice capture failed. Please try again.'
      )
      setPhase('error')
    }

    // Fires when the user taps Done, or when the browser ends recognition
    // after a stretch of silence — either way, process what we heard.
    rec.onend = () => {
      if (cancelledRef.current) return
      const transcript = finalTextRef.current.trim()
      if (transcript) {
        processTranscript(transcript)
      } else {
        setErrorMsg("Didn't catch anything. Tap the mic and try again.")
        setPhase('error')
      }
    }

    recognitionRef.current = rec
    setPhase('recording')
    try {
      rec.start()
    } catch {
      setErrorMsg('Could not start the microphone. Please try again.')
      setPhase('error')
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop()
  }

  function cancelRecording() {
    cancelledRef.current = true
    recognitionRef.current?.abort()
    setPhase('idle')
  }

  async function processTranscript(transcript: string) {
    setPhase('processing')
    try {
      const res = await fetch('/api/voice-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, services }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Voice processing failed.')
      }
      const data = await res.json()
      setResult({
        customerName: data.customer_name ?? null,
        address: data.address ?? null,
        phone: data.phone ?? null,
        quoteType: data.quote_type ?? null,
        items: Array.isArray(data.line_items)
          ? data.line_items.map((i: { service_rate_id: string; quantity: number }) => ({
              serviceRateId: i.service_rate_id,
              quantity: i.quantity,
            }))
          : [],
        notes: data.notes ?? null,
      })
      setParaphrase(typeof data.paraphrase === 'string' ? data.paraphrase : '')
      setPhase('confirm')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Voice processing failed.')
      setPhase('error')
    }
  }

  function confirmFill() {
    if (result) onApply(result)
    reset()
  }

  function reset() {
    setResult(null)
    setParaphrase('')
    setErrorMsg('')
    setInterim('')
    setFinalText('')
    setPhase('idle')
  }

  function serviceName(id: string): string {
    return services.find(s => s.id === id)?.service_name ?? 'Unknown service'
  }

  function serviceUnit(id: string): string {
    return services.find(s => s.id === id)?.unit ?? ''
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (phase === 'recording') {
    return (
      <Card>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="relative flex w-3 h-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
              <span className="relative inline-flex rounded-full w-3 h-3 bg-danger" />
            </span>
            <p className="text-sm font-semibold text-foreground">Listening… describe the job</p>
          </div>
          <p className="text-sm text-muted min-h-[3rem] whitespace-pre-wrap">
            {finalText}
            <span className="opacity-60">{interim}</span>
            {!finalText && !interim && 'Customer, address, services, measurements, conditions — any order.'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={cancelRecording}>
              Cancel
            </Button>
            <Button onClick={stopRecording}>
              <Square size={14} />
              Done
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  if (phase === 'processing') {
    return (
      <Card>
        <div className="flex items-center gap-3 py-2">
          <Sparkles size={16} className="text-accent animate-pulse shrink-0" />
          <p className="text-sm text-muted">Working out what you described…</p>
        </div>
      </Card>
    )
  }

  if (phase === 'confirm' && result) {
    const rows: { label: string; value: string }[] = []
    if (result.customerName) rows.push({ label: 'Customer', value: result.customerName })
    if (result.address) rows.push({ label: 'Address', value: result.address })
    if (result.phone) rows.push({ label: 'Phone', value: result.phone })
    if (result.quoteType)
      rows.push({ label: 'Quote Type', value: result.quoteType[0].toUpperCase() + result.quoteType.slice(1) })
    for (const item of result.items) {
      rows.push({
        label: serviceName(item.serviceRateId),
        value: `${item.quantity.toLocaleString('en-US')} ${serviceUnit(item.serviceRateId)}`,
      })
    }
    if (result.notes) rows.push({ label: 'Notes', value: result.notes })

    return (
      <Card>
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">Here&rsquo;s what I understood:</p>
          <p className="text-sm text-muted">{paraphrase}</p>
          {rows.length > 0 ? (
            <div className="space-y-1.5 border-t border-white/8 pt-3">
              {rows.map((r, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-muted shrink-0">{r.label}:</span>
                  <span className="text-foreground">{r.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted border-t border-white/8 pt-3">
              Nothing clear enough to fill in — the form will not be changed.
            </p>
          )}
          <p className="text-xs text-muted">
            Everything stays editable, and price tiers are left for you to set.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={reset}>
              Discard
            </Button>
            <Button onClick={confirmFill} disabled={rows.length === 0}>
              Fill Form
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  if (phase === 'error') {
    return (
      <Card>
        <div className="space-y-3">
          <p className="text-sm text-danger">{errorMsg}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={reset}>
              Dismiss
            </Button>
            <Button onClick={startRecording}>
              <Mic size={14} />
              Try Again
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Button variant="secondary" fullWidth onClick={startRecording}>
      <Mic size={14} />
      Voice Fill — tap and describe the job
    </Button>
  )
}
