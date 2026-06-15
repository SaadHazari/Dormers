'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── Color palette (dark kitchen display) ────────────────────────────────────
const BG_DEEP = '#091825'
const BG_MID  = '#1e3a4f'
const CREAM   = '#ede8da'
const EMERALD = '#10b981'
const ORANGE  = '#f57f20'
const FONT    = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Recipe Modal ─────────────────────────────────────────────────────────────

type TabId = 'ingredients' | 'method' | 'notes'

function RecipeModal({
  dish,
  onClose,
}: {
  dish: KitchenDish
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<TabId>('ingredients')
  const color = dish.isVeg ? EMERALD : ORANGE
  const recipe = dish.recipe!

  // Reset tab when dish changes
  useEffect(() => {
    setActiveTab('ingredients')
  }, [dish.name])

  // Escape key to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tabs: { id: TabId; label: string }[] = [
    { id: 'ingredients', label: 'Ingredients' },
    { id: 'method', label: 'Method' },
    { id: 'notes', label: 'Notes' },
  ]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: BG_DEEP,
        color: CREAM,
        fontFamily: FONT,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'hidden',
      }}
    >
      {/* Sticky header */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 51,
          backgroundColor: BG_DEEP,
          borderBottom: '1px solid rgba(237,232,218,0.1)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: '8px' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: '20px',
                backgroundColor: color + '33',
                color: color,
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              {dish.isVeg ? 'Veg' : 'Non-Veg'}
            </span>
          </div>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 800,
              color: CREAM,
              lineHeight: 1.2,
            }}
          >
            {dish.name}
          </div>
        </div>
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close recipe"
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: '1px solid rgba(237,232,218,0.2)',
            backgroundColor: 'transparent',
            color: CREAM,
            fontSize: '20px',
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

      {/* Sticky tab bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backgroundColor: BG_DEEP,
          borderBottom: '1px solid rgba(237,232,218,0.08)',
          display: 'flex',
        }}
      >
        {tabs.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '12px 0',
                fontSize: '16px',
                fontWeight: isActive ? 700 : 400,
                color: isActive ? color : CREAM,
                opacity: isActive ? 1 : 0.5,
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: isActive ? `3px solid ${color}` : '3px solid transparent',
                cursor: 'pointer',
                fontFamily: FONT,
                transition: 'opacity 0.15s, border-color 0.15s',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Scrollable tab content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 16px',
        }}
      >
        {/* Ingredients tab */}
        {activeTab === 'ingredients' && (
          <div>
            {recipe.sections.length === 0 ? (
              <p style={{ fontSize: '16px', color: CREAM, opacity: 0.4, fontStyle: 'italic' }}>
                No ingredients listed
              </p>
            ) : (
              recipe.sections.map((section, si) => (
                <div key={si}>
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: CREAM,
                      marginTop: si === 0 ? 0 : '24px',
                      marginBottom: '12px',
                    }}
                  >
                    {section.heading}
                  </div>
                  {section.items.map((item, ii) => (
                    <div
                      key={ii}
                      style={{
                        fontSize: '16px',
                        color: CREAM,
                        opacity: 0.85,
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(237,232,218,0.06)',
                        lineHeight: 1.5,
                      }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {/* Method tab */}
        {activeTab === 'method' && (
          <div>
            {recipe.method.length === 0 ? (
              <p style={{ fontSize: '16px', color: CREAM, opacity: 0.4, fontStyle: 'italic' }}>
                No method listed
              </p>
            ) : (
              recipe.method.map((step, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: '16px',
                    marginBottom: '20px',
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: color + '22',
                      border: `2px solid ${color}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: color,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div
                    style={{
                      fontSize: '16px',
                      lineHeight: 1.6,
                      color: CREAM,
                      paddingTop: '4px',
                    }}
                  >
                    {step}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Notes tab */}
        {activeTab === 'notes' && (
          <div>
            {recipe.notes ? (
              <p
                style={{
                  fontSize: '16px',
                  lineHeight: 1.6,
                  color: CREAM,
                  opacity: 0.85,
                  margin: 0,
                }}
              >
                {recipe.notes}
              </p>
            ) : (
              <p
                style={{
                  fontSize: '16px',
                  color: CREAM,
                  opacity: 0.4,
                  fontStyle: 'italic',
                  margin: 0,
                }}
              >
                No notes for this recipe
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main KitchenClient ───────────────────────────────────────────────────────

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

  // 60-second auto-refresh (KIT-08)
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(id)
  }, [router])

  // No-delivery state (Sunday)
  if (noDeliveryReason) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          backgroundColor: BG_DEEP,
          color: CREAM,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT,
          padding: '20px 16px',
        }}
      >
        <p style={{ fontSize: '24px', textAlign: 'center' }}>{noDeliveryReason}</p>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: BG_DEEP,
        color: CREAM,
        fontFamily: FONT,
        padding: '20px 16px',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
        }}
      >
        <div style={{ fontSize: '20px', fontWeight: 700, color: CREAM }}>
          Dormers Kitchen
        </div>
        <div style={{ fontSize: '13px', color: CREAM, opacity: 0.5 }}>
          Last updated {lastUpdated}
        </div>
      </div>

      {/* Count cards row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        {/* Veg count card */}
        <div
          style={{
            flex: 1,
            borderRadius: '16px',
            padding: '20px',
            textAlign: 'center',
            backgroundColor: EMERALD + '1a',
            border: '2px solid ' + EMERALD,
          }}
        >
          <div
            style={{
              fontSize: '40px',
              fontWeight: 800,
              color: EMERALD,
              lineHeight: 1,
            }}
          >
            {isPast2pm ? vegCount : `~${vegCount}`}
          </div>
          <div
            style={{
              fontSize: '14px',
              color: CREAM,
              opacity: 0.7,
              marginTop: '8px',
            }}
          >
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

        {/* Non-veg count card */}
        <div
          style={{
            flex: 1,
            borderRadius: '16px',
            padding: '20px',
            textAlign: 'center',
            backgroundColor: ORANGE + '1a',
            border: '2px solid ' + ORANGE,
          }}
        >
          <div
            style={{
              fontSize: '40px',
              fontWeight: 800,
              color: ORANGE,
              lineHeight: 1,
            }}
          >
            {isPast2pm ? nonVegCount : `~${nonVegCount}`}
          </div>
          <div
            style={{
              fontSize: '14px',
              color: CREAM,
              opacity: 0.7,
              marginTop: '8px',
            }}
          >
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
                backgroundColor: BG_MID,
                borderRadius: '16px',
                overflow: 'hidden',
                cursor: hasRecipe ? 'pointer' : 'default',
                borderTop: `4px solid ${color}`,
              }}
            >
              {/* Dish photo */}
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

              {/* Card body */}
              <div style={{ padding: '20px' }}>
                {/* Veg/Non-Veg badge */}
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    backgroundColor: color + '33',
                    color: color,
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                  }}
                >
                  {dish.isVeg ? 'VEG' : 'NON-VEG'}
                </span>

                {/* Dish name (KIT-06: 32px+) */}
                <div
                  style={{
                    fontSize: '32px',
                    fontWeight: 800,
                    color: CREAM,
                    marginTop: '8px',
                    lineHeight: 1.2,
                  }}
                >
                  {dish.name}
                </div>

                {/* Recipe hint */}
                {hasRecipe && (
                  <div
                    style={{
                      fontSize: '13px',
                      color: CREAM,
                      opacity: 0.4,
                      marginTop: '8px',
                    }}
                  >
                    Tap for recipe
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Recipe modal */}
      {activeRecipe !== null && (
        <RecipeModal dish={activeRecipe.dish} onClose={() => setActiveRecipe(null)} />
      )}
    </div>
  )
}
