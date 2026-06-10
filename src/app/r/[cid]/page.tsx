import { getMenuDishes } from '@/infra/supabase/menu-catalog'
import ReferralLandingPage from './ReferralClient'

export default async function ReferralPage() {
    const menuData = await getMenuDishes()
    return <ReferralLandingPage menuData={menuData} />
}
