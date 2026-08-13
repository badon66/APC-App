import type { Metadata } from 'next'
import CloseDealScreen from '@/components/CloseDealScreen'
import { BUSINESS_NAME } from '@/lib/config'

// Remote signing: the customer reaches this from their shared quote link, with
// no login. Renders the same Close Deal screen the salesperson uses in person.
export const metadata: Metadata = {
  title: `Review & Sign — ${BUSINESS_NAME}`,
  robots: { index: false, follow: false },
}

export default async function PublicSignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CloseDealScreen quoteId={id} variant="public" />
}
