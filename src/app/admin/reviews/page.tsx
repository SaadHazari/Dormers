import { getReviewsOverview } from '@/infra/supabase/reviews-repo'
import { ReviewsClient } from './ReviewsClient'

export const metadata = { title: 'Reviews & Feedback — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function ReviewsPage() {
    const overview = await getReviewsOverview()
    return <ReviewsClient overview={overview} />
}
