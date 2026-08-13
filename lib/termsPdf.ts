import { BUSINESS_NAME } from './config'
import { TERMS_TITLE, TERMS_INTRO, FULL_TERMS } from './terms'

// Generates a printable PDF of the full terms & conditions for the customer to
// keep. Text comes from lib/terms.ts, the same source the Close Deal screen
// renders, so the downloaded copy always matches what was agreed to on screen.
//
// jsPDF is imported dynamically — it's a large dependency and is only needed
// when someone actually taps the download button.

const PAGE = { width: 612, height: 792 } // US Letter, in points
const MARGIN = 56
const CONTENT_WIDTH = PAGE.width - MARGIN * 2
const BOTTOM_LIMIT = PAGE.height - MARGIN

const ACCENT: [number, number, number] = [63, 168, 42] // #3fa82a
const BODY_GREY: [number, number, number] = [38, 38, 38]
const MUTED_GREY: [number, number, number] = [120, 120, 120]

export async function downloadTermsPdf(fileName = 'APC-Terms-and-Conditions.pdf') {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })

  let y = MARGIN

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
  doc.text('Terms & Conditions', MARGIN + 58, y + 35)

  y += 62
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(1.5)
  doc.line(MARGIN, y, PAGE.width - MARGIN, y)
  y += 26

  // ── Title ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...BODY_GREY)
  const titleLines = doc.splitTextToSize(TERMS_TITLE, CONTENT_WIDTH) as string[]
  doc.text(titleLines, MARGIN, y)
  y += titleLines.length * 18 + 10

  // ── Intro ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const introLines = doc.splitTextToSize(TERMS_INTRO, CONTENT_WIDTH) as string[]
  doc.text(introLines, MARGIN, y)
  y += introLines.length * 14 + 14

  // ── Sections ──
  for (const section of FULL_TERMS) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    const headingLines = doc.splitTextToSize(section.heading, CONTENT_WIDTH) as string[]

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const bodyLines = doc.splitTextToSize(section.body, CONTENT_WIDTH) as string[]

    // Keep the heading with at least two lines of its body — never strand a
    // heading alone at the foot of a page.
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

  // ── Footers (added last so the total page count is known) ──
  const issued = new Date().toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED_GREY)
    doc.text(`${BUSINESS_NAME} — Terms & Conditions`, MARGIN, PAGE.height - 30)
    doc.text(`Issued ${issued}`, PAGE.width / 2, PAGE.height - 30, { align: 'center' })
    doc.text(`Page ${p} of ${total}`, PAGE.width - MARGIN, PAGE.height - 30, { align: 'right' })
  }

  doc.save(fileName)
}
