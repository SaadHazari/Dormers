// Dev-only harness for FoundingMemberArrival — the waitlist arrival moment.
// The real screen only ever mounts as the result of a successful join against
// a paused shop, which makes it near-impossible to look at while iterating on
// it. This renders it directly from fixture props. Unreachable in production.
//
// Query params:
//   ?name=Aisha    first name on the place card (default: Saad)
//   ?credit=15     minted amount (0 renders the no-credit variant)
//   ?empty=1       drops the name entirely, to check the neutral fallback
import { notFound } from 'next/navigation'
import { PreviewClient } from './PreviewClient'

export const dynamic = 'force-dynamic'

export default async function SeasonArrivalPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; credit?: string; empty?: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  const params = await searchParams
  const credit = Number(params.credit ?? 20)
  return (
    <PreviewClient
      firstName={params.empty === '1' ? '' : (params.name ?? 'Saad')}
      creditAed={Number.isFinite(credit) ? credit : 20}
    />
  )
}
