import { BUSINESS_NAME } from './config'

// ─── Terms & conditions ───────────────────────────────────────────────────────
//
// Approved terms & conditions — the single source of truth. Used by the Close
// Deal screen (summary above the agreement checkbox, full text in the "View
// full terms" modal) and by the downloadable PDF, so all three can never drift
// apart. Any wording change here changes what customers legally agree to.
//
export const TERMS_SUMMARY =
  'By signing below, you agree to have Alberta Premium Coatings complete the work ' +
  'described in this quote. Quotes are valid for 30 days. If a deposit is required, ' +
  'it is non-refundable once paid. See full terms for details on scheduling, warranty, ' +
  'and cancellation.'

export const TERMS_TITLE = `${BUSINESS_NAME.toUpperCase()} — TERMS & CONDITIONS`

export const TERMS_INTRO =
  `By signing below, the Customer agrees to the following terms for all work performed by ` +
  `${BUSINESS_NAME} ("APC," "we," "us").`

export const FULL_TERMS: { heading: string; body: string }[] = [
  {
    heading: '1. Quote Validity & Scope',
    body:
      'The quoted price covers only the work described in the written quote. Any additional ' +
      'work, changes, or unforeseen conditions discovered during the job may require a revised ' +
      'quote and additional cost, agreed upon before proceeding. Quotes are valid for 30 days ' +
      'from the date issued.',
  },
  {
    heading: '2. Surface Conditions',
    body:
      'The Customer is responsible for disclosing any known issues with the surface (previous ' +
      'coatings, cracks, drainage problems, structural concerns). APC is not responsible for ' +
      'pre-existing damage, underlying surface defects, or failures caused by conditions outside ' +
      'our control. Existing cracks may be filled but are not guaranteed against reappearance ' +
      'due to natural ground movement, freeze-thaw cycles, or settling.',
  },
  {
    heading: '3. Results & Appearance',
    body:
      'APC uses professional products and workmanship to deliver quality results. Natural ' +
      'variation in colour, sheen, texture, and appearance may occur due to surface age, ' +
      'porosity, existing conditions, and weather. Coatings and restoration improve and protect ' +
      'surfaces but cannot guarantee a perfect or brand-new appearance on aged or previously ' +
      'damaged surfaces.',
  },
  {
    heading: '4. Scheduling & Weather',
    body:
      'Work is weather-dependent. APC reserves the right to reschedule due to rain, temperature, ' +
      'moisture, or other conditions that affect product application and quality. We will make ' +
      'reasonable efforts to notify the Customer of any scheduling changes.',
  },
  {
    heading: '5. Site Access & Preparation',
    body:
      'The Customer agrees to provide clear, safe access to the work area. The area must be free ' +
      'of vehicles, furniture, and personal belongings before the scheduled start. Pets and ' +
      'children should be kept clear of the work area during and after application until surfaces ' +
      'are fully cured. If the site is not properly prepared or accessible at the scheduled start ' +
      'time, resulting in delays or additional labour, the Customer may be subject to additional ' +
      'charges.',
  },
  {
    heading: '6. Curing & Aftercare',
    body:
      'Coatings require time to cure. The Customer agrees to follow all aftercare instructions ' +
      'provided, including keeping foot and vehicle traffic off the surface for the specified ' +
      'time. APC is not responsible for damage caused by premature use, traffic, or failure to ' +
      'follow aftercare instructions.',
  },
  {
    heading: '7. Payment',
    body:
      'Final payment is due in full upon completion of the work. Accepted payment methods will be ' +
      'provided at the time of booking. Late payments may be subject to interest and collection ' +
      'costs.',
  },
  {
    heading: '8. Deposit (Where Applicable)',
    body:
      'On jobs where a deposit is required, a non-refundable deposit of 25% of the total quoted ' +
      'price is required before any work begins, with the remaining balance due upon completion. ' +
      'The deposit covers scheduling, materials, and administrative costs.',
  },
  {
    heading: '9. Warranty',
    body:
      'Any warranty offered applies only to workmanship as specifically stated in writing on the ' +
      'quote or invoice. It does not cover damage from misuse, neglect, weather, ground movement, ' +
      'chemical exposure, or normal wear and tear. Product performance is subject to the ' +
      "manufacturer's warranty, where applicable.",
  },
  {
    heading: '10. Cancellation',
    body:
      'If the Customer cancels after paying a deposit, the deposit is non-refundable to cover ' +
      'scheduling, materials, and administrative costs. Cancellations must be made in writing.',
  },
  {
    heading: '11. Liability',
    body:
      "APC's total liability for any claim is limited to the amount paid by the Customer for the " +
      'work performed. APC is not liable for indirect, incidental, or consequential damages.',
  },
  {
    heading: '12. Photos & Marketing',
    body:
      'APC may photograph completed work for marketing, portfolio, and promotional purposes. The ' +
      "Customer's name, address, and personal details will not be shared without consent.",
  },
  {
    heading: '13. Agreement',
    body:
      'By signing below, the Customer confirms they have read, understood, and agreed to these ' +
      'terms and conditions.',
  },
]
