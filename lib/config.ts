export const BUSINESS_ID = 'b995f64e-db6d-49e1-a27d-995ab99bcce3'
export const APP_NAME = 'Fieldbase'
export const BUSINESS_NAME = 'Alberta Premium Coatings'

export const QUOTE_STATUSES = [
  'quoted',
  'thinking_about_it',
  'sold',
  'not_interested_right_now',
  'not_interested_at_all',
] as const
export const PROSPECT_STATUSES = ['no_answer', 'owner_not_home', 'follow_up', 'converted'] as const
export const SURFACE_TYPES = ['asphalt', 'concrete', 'both'] as const

// 'not_interested' is the legacy value (split into the two not_interested_* values above).
// It is kept in the type so old rows still render; it is not offered as a new choice.
export type QuoteStatus = typeof QUOTE_STATUSES[number] | 'not_interested'
export type ProspectStatus = typeof PROSPECT_STATUSES[number]
export type SurfaceType = typeof SURFACE_TYPES[number]
export type Tier = 'low' | 'mid' | 'high'
