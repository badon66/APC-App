import { BUSINESS_NAME } from './config'
import { TERMS_INTRO, FULL_TERMS } from './terms'

// Builds the signed agreement PDF — the permanent record of what was agreed to
// at the moment of signing. Same jsPDF approach as lib/termsPdf.ts.
//
// This is generated once, immediately after a signature is saved, and is never
// regenerated: later edits to the quote must not change the signed record.
// Everything it needs is passed in explicitly (rather than re-read at render
// time) so the document captures that exact moment.

const PAGE = { width: 612, height: 792 } // US Letter, in points
const MARGIN = 56
const CONTENT_WIDTH = PAGE.width - MARGIN * 2
const BOTTOM_LIMIT = PAGE.height - MARGIN

const ACCENT: [number, number, number] = [63, 168, 42] // #3fa82a
const BODY_GREY: [number, number, number] = [38, 38, 38]
const MUTED_GREY: [number, number, number] = [120, 120, 120]
const RULE_GREY: [number, number, number] = [210, 210, 210]

export type AgreementLineItem = {
  serviceName: string
  unit: string
  quantity: number
  lineTotal: number
  rate: number | null
}

export type AgreementData = {
  quoteId: string
  customerName: string
  signerName: string
  phone: string | null
  email: string | null
  address: string | null
  quoteType: string
  items: AgreementLineItem[]
  subtotal: number | null
  discount: number | null
  finalQuote: number | null
  tax: number | null
  balanceDue: number
  depositRequired: boolean
  depositPercent: number | null
  depositAmount: number | null
  signedAt: string // ISO
  termsAgreedAt: string // ISO
  signatureDataUrl: string // PNG data URL from the signature canvas
  signatureAspect: number // width / height of the signature canvas
}

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

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export async function buildSignedAgreementPdf(data: AgreementData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })

  let y = MARGIN

  function ensureSpace(needed: number) {
    if (y + needed > BOTTOM_LIMIT) {
      doc.addPage()
      y = MARGIN
    }
  }

  function sectionHeading(label: string) {
    ensureSpace(34)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...BODY_GREY)
    doc.text(label.toUpperCase(), MARGIN, y)
    y += 6
    doc.setDrawColor(...RULE_GREY)
    doc.setLineWidth(0.5)
    doc.line(MARGIN, y, PAGE.width - MARGIN, y)
    y += 16
  }

  // Label on the left, value on the right — used for totals.
  function row(label: string, value: string, bold = false) {
    ensureSpace(16)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...BODY_GREY)
    doc.text(label, MARGIN, y)
    doc.text(value, PAGE.width - MARGIN, y, { align: 'right' })
    y += 15
  }

  function paragraph(text: string, size = 10) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(size)
    doc.setTextColor(...BODY_GREY)
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[]
    for (const line of lines) {
      ensureSpace(14)
      doc.text(line, MARGIN, y)
      y += 14
    }
  }

  // ── Header ──
  doc.setFillColor(...ACCENT)
  doc.rect(MARGIN, y, 44, 44, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('APC', MARGIN + 22, y + 28, { align: 'center' })

  doc.setTextColor(...BODY_GREY)
  doc.setFontSize(13)
  doc.text(BUSINESS_NAME, MARGIN + 58, y + 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED_GREY)
  doc.text('Signed Agreement', MARGIN + 58, y + 35)

  y += 62
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(1.5)
  doc.line(MARGIN, y, PAGE.width - MARGIN, y)
  y += 26

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...BODY_GREY)
  doc.text('SIGNED AGREEMENT', MARGIN, y)
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED_GREY)
  doc.text(`Signed ${fmtDateTime(data.signedAt)}`, MARGIN, y)
  y += 12
  doc.text(`Reference: ${data.quoteId}`, MARGIN, y)
  y += 24

  // ── Customer ──
  sectionHeading('Customer')
  doc.setTextColor(...BODY_GREY)
  paragraph(data.customerName)
  if (data.address) paragraph(data.address)
  if (data.phone) paragraph(data.phone)
  if (data.email) paragraph(data.email)
  y += 12

  // ── Services ──
  if (data.items.length > 0) {
    sectionHeading('Services')
    for (const item of data.items) {
      ensureSpace(30)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...BODY_GREY)
      doc.text(item.serviceName, MARGIN, y)
      doc.text(fmtMoney(item.lineTotal), PAGE.width - MARGIN, y, { align: 'right' })
      y += 13
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...MUTED_GREY)
      const detail =
        `${item.quantity.toLocaleString('en-US')} ${unitLabel(item.unit)}` +
        (item.rate != null ? ` · ${fmtMoney(item.rate)} per ${unitLabel(item.unit)}` : '')
      doc.text(detail, MARGIN, y)
      y += 16
    }
    y += 4
  }

  // ── Totals ──
  sectionHeading('Totals')
  row('Quote Subtotal', fmtMoney(data.subtotal))
  row('Quote Discount', fmtMoney(data.discount))
  row('Final Quote', fmtMoney(data.finalQuote), true)
  row('Tax', fmtMoney(data.tax))
  ensureSpace(30)
  doc.setDrawColor(...RULE_GREY)
  doc.line(MARGIN, y - 6, PAGE.width - MARGIN, y - 6)
  y += 4
  row('BALANCE DUE', fmtMoney(data.balanceDue), true)
  y += 8

  // ── Deposit ──
  sectionHeading('Deposit')
  if (data.depositRequired) {
    row(
      `Deposit${data.depositPercent != null ? ` (${data.depositPercent}%)` : ''}`,
      fmtMoney(data.depositAmount),
      true
    )
    paragraph(
      'Calculated on the quote total before tax. Required before work begins. Non-refundable once paid. ' +
        'The remaining balance is due upon completion.',
      9
    )
  } else {
    paragraph('No deposit required — full balance due upon completion.')
  }
  y += 12

  // ── Signature ──
  sectionHeading('Signature')
  const sigWidth = Math.min(260, CONTENT_WIDTH)
  const sigHeight = Math.max(50, Math.round(sigWidth / (data.signatureAspect || 3)))
  ensureSpace(sigHeight + 60)
  doc.setDrawColor(...RULE_GREY)
  doc.setLineWidth(0.5)
  doc.rect(MARGIN, y, sigWidth, sigHeight)
  try {
    doc.addImage(data.signatureDataUrl, 'PNG', MARGIN + 2, y + 2, sigWidth - 4, sigHeight - 4)
  } catch {
    // If the image can't be embedded the rest of the record still stands.
  }
  y += sigHeight + 6
  doc.setDrawColor(...BODY_GREY)
  doc.line(MARGIN, y, MARGIN + sigWidth, y)
  y += 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BODY_GREY)
  doc.text(data.signerName, MARGIN, y)
  y += 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED_GREY)
  doc.text(`Signed ${fmtDateTime(data.signedAt)}`, MARGIN, y)
  y += 12
  doc.text(
    `Terms & conditions accepted ${fmtDateTime(data.termsAgreedAt)}`,
    MARGIN,
    y
  )
  y += 24

  // ── Full terms ──
  doc.addPage()
  y = MARGIN
  sectionHeading('Terms & Conditions')
  paragraph(TERMS_INTRO)
  y += 8

  for (const section of FULL_TERMS) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    const headingLines = doc.splitTextToSize(section.heading, CONTENT_WIDTH) as string[]
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const bodyLines = doc.splitTextToSize(section.body, CONTENT_WIDTH) as string[]

    // Never strand a heading alone at the foot of a page.
    const keepTogether = headingLines.length * 15 + Math.min(bodyLines.length, 2) * 14
    if (y + keepTogether > BOTTOM_LIMIT) {
      doc.addPage()
      y = MARGIN
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(...BODY_GREY)
    doc.text(headingLines, MARGIN, y)
    y += headingLines.length * 15 + 3

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    for (const line of bodyLines) {
      if (y > BOTTOM_LIMIT) {
        doc.addPage()
        y = MARGIN
      }
      doc.text(line, MARGIN, y)
      y += 14
    }
    y += 12
  }

  // ── Footers ──
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED_GREY)
    doc.text(`${BUSINESS_NAME} — Signed Agreement`, MARGIN, PAGE.height - 30)
    doc.text(data.customerName, PAGE.width / 2, PAGE.height - 30, { align: 'center' })
    doc.text(`Page ${p} of ${total}`, PAGE.width - MARGIN, PAGE.height - 30, { align: 'right' })
  }

  return doc.output('blob')
}
