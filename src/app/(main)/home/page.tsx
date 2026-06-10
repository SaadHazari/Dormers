import { getMenuDishes } from '@/infra/supabase/menu-catalog'
import Home from './HomeClient'

export default async function HomePage() {
    const menuData = await getMenuDishes()
    return <Home menuData={menuData} />
}
