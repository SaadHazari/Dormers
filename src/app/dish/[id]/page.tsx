import { notFound } from 'next/navigation'
import { MENU_DATA } from '@/contexts/menu/domain/catalog-data'
import { getMenuDishes } from '@/infra/supabase/menu-catalog'
import DishPageClient from './DishPageClient'
import type { Metadata } from 'next'

export function generateStaticParams() {
  return MENU_DATA.map(dish => ({ id: String(dish.id) }))
}

async function findDish(id: string) {
  const dishes = await getMenuDishes()
  return dishes.find(d => d.id === Number(id)) ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const dish = await findDish(id)
  if (!dish) return { title: 'Dish Not Found — Dormers\'' }

  const imgPath = typeof dish.image === 'string' ? dish.image : ''
  return {
    title: `${dish.name} — Dormers'`,
    description: dish.description,
    openGraph: {
      title: `${dish.name} — Dormers'`,
      description: dish.description,
      images: imgPath ? [{ url: `https://dormers.ae${imgPath}`, width: 1200, height: 630 }] : [],
      type: 'article',
    },
  }
}

export default async function DishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const dish = await findDish(id)
  if (!dish) notFound()

  const serialized = {
    ...dish,
    image: typeof dish.image === 'string' ? dish.image : '',
  }
  return <DishPageClient dish={serialized} />
}
