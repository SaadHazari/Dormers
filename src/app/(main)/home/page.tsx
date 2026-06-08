import { getMenuDishes } from '@/infra/supabase/menu-image-overrides'
import Home from './HomeClient'

export default async function HomePage() {
    const menuData = await getMenuDishes()
    return <Home menuData={menuData} />
}
