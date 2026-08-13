import CloseDealScreen from '@/components/CloseDealScreen'

// In-person signing: the salesperson opens this from the quote detail screen.
// The screen itself is shared with the public route at /share/[id]/sign.
export default async function CloseDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CloseDealScreen quoteId={id} variant="app" />
}
