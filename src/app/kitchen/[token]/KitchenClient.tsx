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

// ─── Method step → section assignment ────────────────────────────────────────
// Extracts keywords from section headings and matches method steps to sections.
// "For the salad: toss..." matches "For the salad" section.
// Unmatched steps attach to the previous section (cooking flows are sequential).

function extractKeywords(heading: string): string[] {
  const cleaned = heading
    .toLowerCase()
    .replace(/^for (the )?/, '')
    .replace(/ingredients?|assembly|serving|garnish/g, '')
    .trim()
  return cleaned
    .split(/[\s,]+/)
    .filter(w => w.length > 2)
}

function assignMethodSteps(
  sections: RecipeSection[],
  method: string[],
): string[][] {
  if (sections.length <= 1) return [method]

  const sectionKeywords = sections.map(s => extractKeywords(s.heading))
  const result: string[][] = sections.map(() => [])

  let currentSection = 0
  for (const step of method) {
    const lower = step.toLowerCase()
    let bestMatch = -1
    let bestScore = 0

    for (let si = 0; si < sectionKeywords.length; si++) {
      let score = 0
      for (const kw of sectionKeywords[si]) {
        if (lower.includes(kw)) score++
      }
      if (score > bestScore) {
        bestScore = score
        bestMatch = si
      }
    }

    if (bestScore > 0) {
      currentSection = bestMatch
    }
    result[currentSection].push(step)
  }

  return result
}

function cleanTabLabel(heading: string): string {
  return heading
    .replace(/^for (the )?/i, '')
    .replace(/^\w/, c => c.toUpperCase())
}

// ─── Recipe Page (full-screen, tabbed by component) ─────────────────────────

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
  const hasTabs = recipe.sections.length > 1

  const methodBySections = assignMethodSteps(recipe.sections, recipe.method)

  const [activeTab, setActiveTab] = useState(0)

  useEffect(() => {
    setActiveTab(0)
  }, [dish.name])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const currentSection = recipe.sections[activeTab]
  const currentMethod = methodBySections[activeTab] ?? []

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: BG,
        color: NAVY,
        fontFamily: FONT,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'hidden',
      }}
    >
      {/* ── Sticky header + tabs ── */}
      <div style={{ flexShrink: 0, backgroundColor: BG, zIndex: 51 }}>
        {/* Header row */}
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            borderBottom: hasTabs ? 'none' : `1px solid ${BORDER}`,
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

        {/* Tab bar (only if multiple components) */}
        {hasTabs && (
          <div
            style={{
              display: 'flex',
              borderBottom: `1px solid ${BORDER}`,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {recipe.sections.map((section, si) => {
              const isActive = activeTab === si
              return (
                <button
                  key={si}
                  onClick={() => setActiveTab(si)}
                  style={{
                    flex: hasTabs ? 1 : undefined,
                    minWidth: 0,
                    padding: '12px 16px',
                    fontSize: '14px',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? color : MUTED,
                    backgroundColor: isActive ? BG_CARD : 'transparent',
                    border: 'none',
                    borderBottom: isActive ? `3px solid ${color}` : '3px solid transparent',
                    cursor: 'pointer',
                    fontFamily: FONT,
                    whiteSpace: 'nowrap',
                    transition: 'color 0.15s, border-color 0.15s',
                  }}
                >
                  {cleanTabLabel(section.heading)}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Scrollable content for active tab ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '20px',
        }}
      >
        {/* Serving badge */}
        <div style={{ marginBottom: '20px' }}>
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
            <span style={{ color: MUTED, fontWeight: 400 }}>(base: {RECIPE_BASE_SERVINGS})</span>
          </div>
        </div>

        {/* ── Ingredients ── */}
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
              borderBottom: `2px solid ${color}`,
            }}
          >
            Ingredients
          </div>
          {currentSection.items.length === 0 ? (
            <p style={{ fontSize: '15px', color: MUTED, fontStyle: 'italic' }}>
              No ingredients listed
            </p>
          ) : (
            currentSection.items.map((item, ii) => (
              <div
                key={ii}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px',
                  padding: '7px 0',
                  borderBottom: ii < currentSection.items.length - 1 ? `1px solid ${BORDER}` : 'none',
                  fontSize: '15px',
                  lineHeight: 1.5,
                  color: NAVY,
                }}
              >
                <span style={{ color: MUTED, flexShrink: 0, fontSize: '8px', marginTop: '5px' }}>●</span>
                <span>{scaleQuantity(item, multiplier)}</span>
              </div>
            ))
          )}
        </div>

        {/* ── Method ── */}
        {currentMethod.length > 0 && (
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
            {currentMethod.map((step, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '12px',
                  marginBottom: i < currentMethod.length - 1 ? '16px' : 0,
                  paddingBottom: i < currentMethod.length - 1 ? '16px' : 0,
                  borderBottom: i < currentMethod.length - 1 ? `1px solid ${BORDER}` : 'none',
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
                <div style={{ fontSize: '15px', lineHeight: 1.6, color: NAVY }}>
                  {step}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Notes (shown on every tab) ── */}
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
            <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#78350f', margin: 0 }}>
              {recipe.notes}
            </p>
          </div>
        )}

        <div style={{ height: '40px' }} />
      </div>
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
