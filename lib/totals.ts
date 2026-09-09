// Shared quote totals math.
//
// Balance Due was previously recomputed inline on the quote form, the detail
// screen, the public share page and the Close Deal screen. The optional
// Additional Fee feeds into all four, so the calculation lives here once and
// every surface calls it.
//
// Order of operations:
//   Final Quote = subtotal − discount   (pre-tax; what the deposit is based on)
//   Tax         applied to the final quote
//   Additional Fee — a percentage of (Final Quote + Tax), or a flat amount
//   Balance Due = Final Quote + Tax + Additional Fee

export type FeeType = 'percent' | 'flat'

export function isFeeType(v: unknown): v is FeeType {
  return v === 'percent' || v === 'flat'
}

function money(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * The additional fee in dollars. Percentage fees are calculated on the
 * post-tax total (Final Quote + Tax); flat fees are used as entered.
 * Returns 0 when the fee is unset, blank or non-positive — so an unused fee
 * leaves Balance Due exactly as it was before the feature existed.
 */
export function computeFeeAmount(
  finalQuote: number | null | undefined,
  tax: number | null | undefined,
  feeType: string | null | undefined,
  feeValue: number | null | undefined
): number {
  if (!isFeeType(feeType)) return 0
  const value = Number(feeValue)
  if (!Number.isFinite(value) || value <= 0) return 0
  if (feeType === 'flat') return money(value)
  const postTax = (finalQuote ?? 0) + (tax ?? 0)
  return money(postTax * (value / 100))
}

/** Final Quote + Tax + Additional Fee. */
export function computeBalanceDue(
  finalQuote: number | null | undefined,
  tax: number | null | undefined,
  feeAmount: number | null | undefined
): number {
  return money((finalQuote ?? 0) + (tax ?? 0) + (feeAmount ?? 0))
}
