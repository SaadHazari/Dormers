'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export interface RecipeSection {
  heading: string
  items: string[]
}

export interface RecipeJson {
  sections: RecipeSection[]
  method: string[]
  notes: string
}

export interface KitchenDish {
  name: string
  image: string
  isVeg: boolean
  recipe: RecipeJson | null
}

interface KitchenClientProps {
  dishes: KitchenDish[]
  vegCount: number
  nonVegCount: number
  isPast2pm: boolean
  lastUpdated: string
  noDeliveryReason: string | null
}

export function KitchenClient({
  dishes,
  vegCount,
  nonVegCount,
  isPast2pm,
  lastUpdated,
  noDeliveryReason,
}: KitchenClientProps) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(id)
  }, [router])

  if (noDeliveryReason) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          backgroundColor: '#091825',
          color: '#ede8da',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-montserrat), Arial, sans-serif',
        }}
      >
        <p style={{ fontSize: '24px' }}>{noDeliveryReason}</p>
      </div>
    )
  }

  // Skeleton: renders data for verification. Plan 02 replaces with full styled UI.
  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: '#091825',
        color: '#ede8da',
        padding: '24px',
        fontFamily: 'var(--font-montserrat), Arial, sans-serif',
      }}
    >
      <div style={{ marginBottom: '16px', fontSize: '14px', opacity: 0.6 }}>
        Last updated {lastUpdated}
      </div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: '#10b981',
            color: '#fff',
            fontSize: '20px',
            fontWeight: 700,
          }}
        >
          {isPast2pm ? `Veg: ${vegCount} Confirmed` : `Veg: Estimated ~${vegCount}`}
        </div>
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: '#f57f20',
            color: '#fff',
            fontSize: '20px',
            fontWeight: 700,
          }}
        >
          {isPast2pm
            ? `Non-Veg: ${nonVegCount} Confirmed`
            : `Non-Veg: Estimated ~${nonVegCount}`}
        </div>
      </div>
      {dishes.map(d => (
        <div
          key={d.name}
          style={{
            marginBottom: '16px',
            padding: '16px',
            backgroundColor: '#1e3a4f',
            borderRadius: '12px',
          }}
        >
          <p style={{ fontSize: '24px', fontWeight: 700 }}>{d.name}</p>
          <p style={{ fontSize: '14px', color: d.isVeg ? '#10b981' : '#f57f20' }}>
            {d.isVeg ? 'Veg' : 'Non-Veg'}
          </p>
          {d.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={d.image}
              alt={d.name}
              style={{ width: '100%', borderRadius: '8px', marginTop: '8px' }}
            />
          )}
          {d.recipe && (
            <p style={{ fontSize: '12px', marginTop: '8px', opacity: 0.5 }}>
              Recipe available (tap to view — coming in Plan 02)
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
