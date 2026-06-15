'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const BG       = '#faf8f4'
const BG_CARD  = '#ffffff'
const NAVY     = '#091825'
const MUTED    = '#64748b'
const BORDER   = '#e5e2dc'
const EMERALD  = '#10b981'
const ORANGE   = '#f57f20'
const FONT     = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

const RECIPE_BASE_SERVINGS = 4

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
  mealCount: number
}

interface KitchenClientProps {
  dishes: KitchenDish[]
  vegCount: number
  nonVegCount: number
  isPast2pm: boolean
  lastUpdated: string
  noDeliveryReason: string | null
}

function scaleQuantity(text: string, multiplier: number): string {
  if (multiplier === 1) return text
  return text.replace(
    /^(\d+(?:\.\d+)?)\s*/,
    (_, num) => {
      const scaled = parseFloat(num) * multiplier
      const display = scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1)
      return display + ' '
    },
  )
}

// ─── Recipe Page (full-screen, replaces the main view) ──────────────────────

function RecipePage({
  dish,
  onClose,
}: {
  dish: KitchenDish
  onClose: () => void
}) {
  const color = dish.isVeg ? EMERALD : ORANGE
  const recipe = dish.recipe!
  const multiplier = dish.mealCount / RECIPE_BASE_SERVINGS

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: BG,
        color: NAVY,
        fontFamily: FONT,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 51,
          backgroundColor: BG,
          borderBottom: `1px solid ${BORDER}`,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: '20px',
              backgroundColor: color + '1a',
              color: color,
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}
          >
            {dish.isVeg ? 'Veg' : 'Non-Veg'}
          </span>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: NAVY,
              lineHeight: 1.2,
              marginTop: '6px',
            }}
          >
            {dish.name}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close recipe"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: `1px solid ${BORDER}`,
            backgroundColor: BG_CARD,
            color: NAVY,
            fontSize: '18px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* ── Serving badge ── */}
      <div style={{ padding: '16px 20px 0' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '8px',
            backgroundColor: color + '12',
            border: `1px solid ${color}30`,
            fontSize: '13px',
            fontWeight: 600,
            color: color,
          }}
        >
          Scaled for {dish.mealCount} meals
          <span style={{ color: MUTED, fontWeight: 400 }}>(base recipe: {RECIPE_BASE_SERVINGS})</span>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '20px' }}>
        {/* Each section is a separate component block */}
        {recipe.sections.map((section, si) => (
          <div
            key={si}
            style={{
              backgroundColor: BG_CARD,
              borderRadius: '12px',
              border: `1px solid ${BORDER}`,
              padding: '20px',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                fontSize: '16px',
                fontWeight: 700,
                color: NAVY,
                marginBottom: '14px',
                paddingBottom: '10px',
                borderBottom: `2px solid ${color}`,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  backgroundColor: color + '1a',
                  color: color,
                  fontSize: '12px',
                  fontWeight: 800,
                }}
              >
                {si + 1}
              </span>
              {section.heading}
            </div>
            {section.items.map((item, ii) => (
              <div
                key={ii}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px',
                  padding: '7px 0',
                  borderBottom: ii < section.items.length - 1 ? `1px solid ${BORDER}` : 'none',
                  fontSize: '15px',
                  lineHeight: 1.5,
                  color: NAVY,
                }}
              >
                <span style={{ color: MUTED, flexShrink: 0, fontSize: '8px', marginTop: '5px' }}>●</span>
                <span>{scaleQuantity(item, multiplier)}</span>
              </div>
            ))}
          </div>
        ))}

        {/* ── Method ── */}
        <div
          style={{
            backgroundColor: BG_CARD,
            borderRadius: '12px',
            border: `1px solid ${BORDER}`,
            padding: '20px',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: NAVY,
              marginBottom: '14px',
              paddingBottom: '10px',
              borderBottom: `2px solid ${NAVY}`,
            }}
          >
            Method
          </div>
          {recipe.method.length === 0 ? (
            <p style={{ fontSize: '15px', color: MUTED, fontStyle: 'italic' }}>
              No method listed
            </p>
          ) : (
            recipe.method.map((step, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '12px',
                  marginBottom: i < recipe.method.length - 1 ? '16px' : 0,
                  paddingBottom: i < recipe.method.length - 1 ? '16px' : 0,
                  borderBottom: i < recipe.method.length - 1 ? `1px solid ${BORDER}` : 'none',
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: NAVY,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#fff',
                    marginTop: '1px',
                  }}
                >
                  {i + 1}
                </div>
                <div
                  style={{
                    fontSize: '15px',
                    lineHeight: 1.6,
                    color: NAVY,
                  }}
                >
                  {step}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Notes ── */}
        {recipe.notes && (
          <div
            style={{
              backgroundColor: '#fef9c3',
              borderRadius: '12px',
              border: '1px solid #fde047',
              padding: '16px 20px',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#92400e',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Notes
            </div>
            <p
              style={{
                fontSize: '14px',
                lineHeight: 1.6,
                color: '#78350f',
                margin: 0,
              }}
            >
              {recipe.notes}
            </p>
          </div>
        )}
      </div>

      {/* Bottom safe area padding */}
      <div style={{ height: '40px' }} />
    </div>
  )
}

// ─── Main KitchenClient ─────────────────────────────────────────────────────

export function KitchenClient({
  dishes,
  vegCount,
  nonVegCount,
  isPast2pm,
  lastUpdated,
  noDeliveryReason,
}: KitchenClientProps) {
  const router = useRouter()
  const [activeRecipe, setActiveRecipe] = useState<{ dish: KitchenDish } | null>(null)

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(id)
  }, [router])

  if (noDeliveryReason) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          backgroundColor: BG,
          color: NAVY,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT,
          padding: '20px 16px',
        }}
      >
        <p style={{ fontSize: '24px', textAlign: 'center', color: MUTED }}>{noDeliveryReason}</p>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: BG,
        color: NAVY,
        fontFamily: FONT,
        padding: '20px 16px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <div style={{ fontSize: '20px', fontWeight: 700, color: NAVY }}>
          Dormers Kitchen
        </div>
        <div style={{ fontSize: '13px', color: MUTED }}>
          Last updated {lastUpdated}
        </div>
      </div>

      {/* Count cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <div
          style={{
            flex: 1,
            borderRadius: '16px',
            padding: '20px',
            textAlign: 'center',
            backgroundColor: BG_CARD,
            border: `2px solid ${EMERALD}`,
          }}
        >
          <div style={{ fontSize: '40px', fontWeight: 800, color: EMERALD, lineHeight: 1 }}>
            {isPast2pm ? vegCount : `~${vegCount}`}
          </div>
          <div style={{ fontSize: '14px', color: MUTED, marginTop: '8px' }}>
            {isPast2pm ? 'Confirmed' : 'Estimated'}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: EMERALD,
              fontWeight: 600,
              marginTop: '4px',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}
          >
            Veg
          </div>
        </div>

        <div
          style={{
            flex: 1,
            borderRadius: '16px',
            padding: '20px',
            textAlign: 'center',
            backgroundColor: BG_CARD,
            border: `2px solid ${ORANGE}`,
          }}
        >
          <div style={{ fontSize: '40px', fontWeight: 800, color: ORANGE, lineHeight: 1 }}>
            {isPast2pm ? nonVegCount : `~${nonVegCount}`}
          </div>
          <div style={{ fontSize: '14px', color: MUTED, marginTop: '8px' }}>
            {isPast2pm ? 'Confirmed' : 'Estimated'}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: ORANGE,
              fontWeight: 600,
              marginTop: '4px',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}
          >
            Non-Veg
          </div>
        </div>
      </div>

      {/* Dish cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {dishes.map(dish => {
          const color = dish.isVeg ? EMERALD : ORANGE
          const hasRecipe = dish.recipe !== null

          return (
            <div
              key={dish.name}
              onClick={() => {
                if (hasRecipe) setActiveRecipe({ dish })
              }}
              style={{
                backgroundColor: BG_CARD,
                borderRadius: '16px',
                overflow: 'hidden',
                cursor: hasRecipe ? 'pointer' : 'default',
                border: `1px solid ${BORDER}`,
                borderTop: `4px solid ${color}`,
              }}
            >
              {dish.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={dish.image}
                  alt={dish.name}
                  style={{
                    width: '100%',
                    height: '200px',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              )}
              <div style={{ padding: '20px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    backgroundColor: color + '1a',
                    color: color,
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                  }}
                >
                  {dish.isVeg ? 'VEG' : 'NON-VEG'}
                </span>
                <div
                  style={{
                    fontSize: '32px',
                    fontWeight: 800,
                    color: NAVY,
                    marginTop: '8px',
                    lineHeight: 1.2,
                  }}
                >
                  {dish.name}
                </div>
                {hasRecipe && (
                  <div style={{ fontSize: '13px', color: MUTED, marginTop: '8px' }}>
                    Tap for recipe →
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {activeRecipe !== null && (
        <RecipePage dish={activeRecipe.dish} onClose={() => setActiveRecipe(null)} />
      )}
    </div>
  )
}
