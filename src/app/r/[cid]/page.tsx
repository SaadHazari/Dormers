import { getMenuDishes } from '@/infra/supabase/menu-catalog'
import { getDormLocations } from '@/infra/supabase/dorm-locations'
import { dormNames } from '@/shared/dorm-registry'
import ReferralLandingPage from './ReferralClient'

export default async function ReferralPage() {
    const [menuData, locs] = await Promise.all([
        getMenuDishes(),
        getDormLocations(),
    ])
    return <ReferralLandingPage menuData={menuData} dorms={dormNames(locs)} />
}
