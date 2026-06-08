import { getMenuDishes } from '@/infra/supabase/menu-image-overrides'
import ReferralLandingPage from './ReferralClient'

export default async function ReferralPage() {
    const menuData = await getMenuDishes()
    return <ReferralLandingPage menuData={menuData} />
}
