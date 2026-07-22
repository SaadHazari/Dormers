'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { scaleQuantity } from '@/contexts/ops/domain/recipe-scaling'
import {
  isRecipeV2,
  scaleIngredient,
  recipeBaseServings,
  alternativeAmounts,
  formatAmount,
  getRecipeComponents,
  type AnyRecipe,
  type RecipeV2,
  type StructuredIngredient,
} from '@/contexts/ops/domain/recipe-format'
import { PackingCheck, type PackingDorm, type ExistingPacking } from './PackingCheck'

const BG       = '#faf8f4'
const BG_CARD  = '#ffffff'
const NAVY     = '#091825'
const MUTED    = '#64748b'
const BORDER   = '#e5e2dc'
const EMERALD  = '#10b981'
const ORANGE   = '#f57f20'
const FONT     = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

/**
 * Recipes come in two shapes: legacy v1 (ingredient lines are free text,
 * scaled by scaleQuantity's leading-number regex) and structured v2
 * (ingredients are { item, qty, unit } data, scaled with real math and
 * rendered in cook-friendly units via scaleIngredient). Both render here
 * until every recipe is converted.
 */
export type RecipeJson = AnyRecipe

export interface KitchenDish {
  name: string
  image: string
  isVeg: boolean
  recipe: RecipeJson | null
  mealCount: number
}

export interface PackingProps {
  dorms: PackingDorm[]
  opsTokenId: string
  dateIso: string
  existing: ExistingPacking | null
}

interface KitchenClientProps {
  dishes: KitchenDish[]
  vegCount: number
  nonVegCount: number
  /** True when the count read failed — show an explicit warning, never a fake 0/0. */
  countsUnavailable?: boolean
  isPast2pm: boolean
  lastUpdated: string
  noDeliveryReason: string | null
  /** Packing-check context — null when it failed to load (card simply hidden). */
  packing?: PackingProps | null
}

// ─── Recipe Page (full-screen, tabbed by component) ─────────────────────────
// A meal's recipe is a list of components (sub-dishes). Each component is a tab
// showing its own ingredients and its own method, numbered from 1. Components
// come straight from the stored recipe (getRecipeComponents) — no guessing.

type DisplayComponent = { title: string; sections: { heading: string; items: unknown[] }[]; method: string[] }

function RecipePage({
  dish,
  isPast2pm,
  countsUnavailable,
  prepCount,
  onPrepCountChange,
  onClose,
}: {
  dish: KitchenDish
  isPast2pm: boolean
  countsUnavailable: boolean
  /** Chef's chosen prep count for this dish (before 2 PM). undefined = untouched, use the estimate. */
  prepCount: number | undefined
  onPrepCountChange: (n: number) => void
  onClose: () => void
}) {
  const color = dish.isVeg ? EMERALD : ORANGE
  const recipe = dish.recipe!
  const structured = isRecipeV2(recipe)
  const baseServings = recipeBaseServings(recipe)
  // dish.mealCount is today's live ESTIMATE before the 2 PM skip cutoff, and the
  // locked CONFIRMED count after it. Before 2 PM the kitchen sets how many meals
  // to prep (raw prep — defrosting, soaking — is staged in the morning off this
  // number, usually the estimate plus a box or two of buffer). After 2 PM the
  // count is locked and the recipe scales to it exactly, no manual input.
  // A 0 effective count must NEVER multiply the recipe to a page of zeros —
  // fall back to the base quantities and say so.
  const estimate = dish.mealCount
  const effectiveCount = isPast2pm ? estimate : prepCount ?? estimate
  const multiplier = effectiveCount > 0 ? effectiveCount / baseServings : 1

  const components: DisplayComponent[] = structured
    ? (getRecipeComponents(recipe as RecipeV2, dish.name) as DisplayComponent[])
    : [{ title: '', sections: (recipe.sections ?? []) as DisplayComponent['sections'], method: recipe.method ?? [] }]
  const hasTabs = components.length > 1

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

  const comp = components[Math.min(activeTab, components.length - 1)] ?? { title: '', sections: [], method: [] }

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
            {components.map((c, si) => {
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
                  {c.title || 'Recipe'}
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
        {/* Prep-count control (before 2 PM) / locked confirmed badge (after 2 PM) */}
        <div style={{ marginBottom: '20px' }}>
          <PrepControl
            value={effectiveCount}
            estimate={estimate}
            baseServings={baseServings}
            isPast2pm={isPast2pm}
            countsUnavailable={countsUnavailable}
            color={color}
            onChange={onPrepCountChange}
          />
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
          {structured && (
            <div style={{ fontSize: '12px', color: MUTED, marginBottom: '12px', marginTop: '-4px' }}>
              Tap any amount to switch its unit (g, ml, tsp…).
            </div>
          )}
          {comp.sections.every(s => s.items.length === 0) ? (
            <p style={{ fontSize: '15px', color: MUTED, fontStyle: 'italic' }}>
              No ingredients listed
            </p>
          ) : (
            comp.sections.map((section, si) => (
              <div key={si} style={{ marginBottom: si < comp.sections.length - 1 ? '16px' : 0 }}>
                {comp.sections.length > 1 && (
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: MUTED,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: '6px',
                    }}
                  >
                    {section.heading}
                  </div>
                )}
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
                    {structured ? (
                      <IngredientLine ing={item as StructuredIngredient} multiplier={multiplier} />
                    ) : (
                      <span>{scaleQuantity(item as string, multiplier)}</span>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* ── Method ── */}
        {comp.method.length > 0 && (
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
            {comp.method.map((step, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '12px',
                  marginBottom: i < comp.method.length - 1 ? '16px' : 0,
                  paddingBottom: i < comp.method.length - 1 ? '16px' : 0,
                  borderBottom: i < comp.method.length - 1 ? `1px solid ${BORDER}` : 'none',
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

/**
 * A tappable amount chip. Tapping cycles the amount through its sensible unit
 * alternatives (g → ml → tsp …) so a cook can read it in the unit they prefer.
 * View-only — the stored recipe never changes. "≈" marks a cross-system
 * (weight↔volume) conversion, which assumes a water-like density.
 */
function AmountChip({ scaledQty, unit }: {
  scaledQty: number
  unit: StructuredIngredient['unit']
}) {
  const options = alternativeAmounts(scaledQty, unit)
  const [idx, setIdx] = useState(0)
  if (options.length === 0) return null

  const opt = options[Math.min(idx, options.length - 1)]
  const text = formatAmount(opt.qty, opt.unit)
  const canCycle = options.length > 1

  return (
    <strong
      onClick={canCycle ? (e) => { e.stopPropagation(); setIdx((idx + 1) % options.length) } : undefined}
      title={canCycle ? 'Tap to change unit' : undefined}
      style={{
        fontWeight: 800,
        cursor: canCycle ? 'pointer' : 'default',
        borderBottom: canCycle ? `1.5px dotted ${MUTED}` : 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {opt.approx ? '≈' : ''}{text}{' '}
    </strong>
  )
}

/**
 * Structured (v2) ingredient row: exact math on { qty, unit } data. The amount
 * is a tappable chip (unit conversion); the stored recipe never changes.
 */
function IngredientLine({ ing, multiplier }: {
  ing: StructuredIngredient
  multiplier: number
}) {
  const d = scaleIngredient(ing, multiplier)
  const scaledQty = ing.qty === null ? null : ing.qty * multiplier
  return (
    <span>
      {scaledQty !== null && ing.unit !== null
        ? <AmountChip scaledQty={scaledQty} unit={ing.unit} />
        : null}
      {d.label}
      {d.note && <span style={{ color: MUTED }}>, {d.note}</span>}
    </span>
  )
}

// ─── Prep-count control ─────────────────────────────────────────────────────
// Before the 2 PM skip cutoff the kitchen decides how many meals to prep so raw
// prep (defrosting meat, soaking dal) can be staged in the morning — delivery
// is 5 PM, cooking starts ~2 PM, but the mise en place has to be ready first.
// The field is pre-filled with today's estimate; the chef nudges it up for the
// odd box or two of buffer. After 2 PM the count is locked: the control becomes
// a read-only badge and the recipe scales to the confirmed number exactly.

function PrepControl({
  value,
  estimate,
  baseServings,
  isPast2pm,
  countsUnavailable,
  color,
  onChange,
}: {
  value: number
  estimate: number
  baseServings: number
  isPast2pm: boolean
  countsUnavailable: boolean
  color: string
  onChange: (n: number) => void
}) {
  const clamp = (n: number) => Math.max(0, Math.min(999, Math.round(Number.isFinite(n) ? n : 0)))
  const meals = (n: number) => (n === 1 ? 'meal' : 'meals')

  // After 2 PM: locked, read-only. The recipe scales to the confirmed count.
  if (isPast2pm) {
    return (
      <div
        style={{
          backgroundColor: color + '12',
          border: `1px solid ${color}30`,
          borderRadius: '12px',
          padding: '14px 16px',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Confirmed for today
        </div>
        <div style={{ fontSize: '18px', fontWeight: 800, color: NAVY, marginTop: '4px' }}>
          {value > 0 ? `Scaled for ${value} ${meals(value)}` : 'No meals confirmed today'}
        </div>
        <div style={{ fontSize: '13px', color: MUTED, marginTop: '4px', lineHeight: 1.4 }}>
          {value > 0
            ? `Locked at 2 PM. Base recipe is ${baseServings} servings.`
            : `Showing the ${baseServings}-serving base recipe.`}
        </div>
      </div>
    )
  }

  // Before 2 PM: editable. Chef sets meals to prep, defaulting to the estimate.
  const btn = {
    width: '44px',
    height: '44px',
    borderRadius: '10px',
    border: `1px solid ${color}55`,
    backgroundColor: BG_CARD,
    color,
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: 1,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontFamily: FONT,
  } as const

  return (
    <div
      style={{
        backgroundColor: color + '12',
        border: `1px solid ${color}30`,
        borderRadius: '12px',
        padding: '14px 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Meals to prep
          </div>
          <div style={{ fontSize: '13px', color: MUTED, marginTop: '4px', lineHeight: 1.4 }}>
            {countsUnavailable ? (
              `Estimate didn't load.`
            ) : (
              <>
                Today&apos;s estimate:{' '}
                <strong style={{ color: NAVY, fontWeight: 800 }}>{estimate}</strong>
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button type="button" aria-label="One fewer meal" onClick={() => onChange(clamp(value - 1))} style={btn}>
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            aria-label="Meals to prep"
            value={value}
            onChange={(e) => onChange(clamp(parseInt(e.target.value, 10)))}
            style={{
              width: '64px',
              height: '44px',
              textAlign: 'center',
              fontSize: '22px',
              fontWeight: 800,
              color: NAVY,
              fontFamily: FONT,
              border: `1px solid ${BORDER}`,
              borderRadius: '10px',
              backgroundColor: BG_CARD,
              MozAppearance: 'textfield',
            }}
          />
          <button type="button" aria-label="One more meal" onClick={() => onChange(clamp(value + 1))} style={btn}>
            +
          </button>
        </div>
      </div>
      {(value === 0 || value !== estimate) && (
        <div style={{ fontSize: '13px', color: MUTED, marginTop: '10px', lineHeight: 1.4 }}>
          {value > 0
            ? `Scaled to ${value} ${meals(value)}.`
            : `Enter a count to scale. Showing the ${baseServings}-serving base.`}
          {!countsUnavailable && value !== estimate && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => onChange(clamp(estimate))}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  color,
                  fontWeight: 700,
                  fontFamily: FONT,
                  fontSize: '13px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Reset to {estimate}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main KitchenClient ─────────────────────────────────────────────────────

export function KitchenClient({
  dishes,
  vegCount,
  nonVegCount,
  countsUnavailable = false,
  isPast2pm,
  lastUpdated,
  noDeliveryReason,
  packing = null,
}: KitchenClientProps) {
  const router = useRouter()
  const [activeRecipe, setActiveRecipe] = useState<{ dish: KitchenDish } | null>(null)
  // Chef-chosen prep counts, keyed by dish name. Kept in the parent so the
  // number survives closing and reopening a recipe within the session. Untouched
  // dishes fall back to today's estimate (dish.mealCount).
  const [prepCounts, setPrepCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    const id = setInterval(() => {
      // Capacity (Phase 7 / L6): skip the refresh while the tab is hidden so a
      // forgotten kitchen tab doesn't keep hitting the DB every 60s in the
      // background. The next visible tick (within 60s) catches up.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      router.refresh()
    }, 60_000)
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

      {/* Count cards — or an explicit warning when the count read failed (never a fake 0/0) */}
      {countsUnavailable ? (
        <div
          style={{
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            backgroundColor: '#fef9c3',
            border: '1px solid #fde047',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#92400e' }}>
            Counts unavailable
          </div>
          <div style={{ fontSize: '14px', color: '#78350f', marginTop: '8px', lineHeight: 1.5 }}>
            Couldn’t load today’s veg / non-veg totals. Check with admin before cooking — do not assume zero.
          </div>
        </div>
      ) : (
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
      )}

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

      {packing && (
        <PackingCheck
          dorms={packing.dorms}
          opsTokenId={packing.opsTokenId}
          dateIso={packing.dateIso}
          existing={packing.existing}
        />
      )}

      {activeRecipe !== null && (
        <RecipePage
          dish={activeRecipe.dish}
          isPast2pm={isPast2pm}
          countsUnavailable={countsUnavailable}
          prepCount={prepCounts[activeRecipe.dish.name]}
          onPrepCountChange={(n) =>
            setPrepCounts((prev) => ({ ...prev, [activeRecipe.dish.name]: n }))
          }
          onClose={() => setActiveRecipe(null)}
        />
      )}
    </div>
  )
}
