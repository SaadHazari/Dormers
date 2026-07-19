/**
 * Tests for the v2 structured recipe format — unit normalisation on ingest
 * and cook-friendly display formatting after scaling. These are the fixes
 * for the "0.1 kg salt" class of kitchen bugs, so lock them in hard.
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeQtyUnit,
  formatAmount,
  scaleIngredient,
  isRecipeV2,
  type RecipeV2,
  type RecipeV1,
} from './recipe-format'

describe('normalizeQtyUnit — ingest', () => {
  it('normalises unit aliases to canonical units', () => {
    expect(normalizeQtyUnit(100, 'gms')).toEqual({ qty: 100, unit: 'g' })
    expect(normalizeQtyUnit(2, 'teaspoons')).toEqual({ qty: 2, unit: 'tsp' })
    expect(normalizeQtyUnit(3, 'pieces')).toEqual({ qty: 3, unit: 'pcs' })
  })

  it('converts kg to g and l to ml so storage has one mass and one volume unit', () => {
    expect(normalizeQtyUnit(0.1, 'kg')).toEqual({ qty: 100, unit: 'g' })
    expect(normalizeQtyUnit(1.5, 'litres')).toEqual({ qty: 1500, unit: 'ml' })
  })

  it('collapses missing, zero, or unknown quantities to "to taste"', () => {
    expect(normalizeQtyUnit(null, 'g')).toEqual({ qty: null, unit: null })
    expect(normalizeQtyUnit(0, 'g')).toEqual({ qty: null, unit: null })
    expect(normalizeQtyUnit(2, 'handfuls')).toEqual({ qty: null, unit: null })
    expect(normalizeQtyUnit(1, 'to taste')).toEqual({ qty: null, unit: null })
  })
})

describe('formatAmount — cook-friendly display', () => {
  it('renders grams under 1 kg as grams', () => {
    expect(formatAmount(400, 'g')).toBe('400 g')
    expect(formatAmount(12.5, 'g')).toBe('12.5 g')
  })

  it('promotes 1000+ g to kg (the anti-"0.1 kg salt" rule works both ways)', () => {
    expect(formatAmount(1500, 'g')).toBe('1.5 kg')
    expect(formatAmount(1000, 'g')).toBe('1 kg')
  })

  it('rounds bulk amounts to scale-friendly steps', () => {
    expect(formatAmount(333, 'g')).toBe('335 g')     // ≥100 → nearest 5
    expect(formatAmount(1333, 'g')).toBe('1.325 kg') // ≥1000 → nearest 25
    expect(formatAmount(23.4, 'g')).toBe('23 g')     // ≥20 → nearest 1
  })

  it('promotes 1000+ ml to L', () => {
    expect(formatAmount(2000, 'ml')).toBe('2 L')
    expect(formatAmount(750, 'ml')).toBe('750 ml')
  })

  it('converts 3+ tsp to tbsp with a tsp remainder', () => {
    expect(formatAmount(3, 'tsp')).toBe('1 tbsp')
    expect(formatAmount(7, 'tsp')).toBe('2 tbsp + 1 tsp')
    expect(formatAmount(2, 'tsp')).toBe('2 tsp')
  })

  it('renders spoon fractions as fractions, not decimals', () => {
    expect(formatAmount(0.5, 'tsp')).toBe('1/2 tsp')
    expect(formatAmount(1.5, 'tbsp')).toBe('1 1/2 tbsp')
  })

  it('demotes sub-1 tbsp to tsp', () => {
    expect(formatAmount(0.5, 'tbsp')).toBe('1 1/2 tsp')
  })

  it('renders pcs bare (no unit suffix) at half-piece precision', () => {
    expect(formatAmount(7.5, 'pcs')).toBe('7.5')
    expect(formatAmount(8, 'pcs')).toBe('8')
  })
})

describe('scaleIngredient — scaling is exact math on data', () => {
  it('scales and reformats: the 0.1 kg salt bug is dead', () => {
    // Stored canonically as 100 g (0.1 kg normalised on ingest). At 4→30
    // meals (7.5×) the kitchen reads "750 g", never "0.75 kg salt" weirdness
    // at the wrong threshold and never "0.1 kg" at 1×.
    const salt = { item: 'Salt', qty: 100, unit: 'g' as const }
    expect(scaleIngredient(salt, 7.5)).toEqual({ amount: '750 g', label: 'Salt', note: null })
    expect(scaleIngredient(salt, 1)).toEqual({ amount: '100 g', label: 'Salt', note: null })
  })

  it('crosses unit boundaries when scaling (g into kg)', () => {
    const rice = { item: 'Basmati rice', qty: 400, unit: 'g' as const, note: 'washed' }
    expect(scaleIngredient(rice, 5)).toEqual({ amount: '2 kg', label: 'Basmati rice', note: 'washed' })
  })

  it('spoon amounts scale into sensible spoon combos', () => {
    const chilli = { item: 'Red chilli powder', qty: 1, unit: 'tsp' as const }
    expect(scaleIngredient(chilli, 7)).toEqual({
      amount: '2 tbsp + 1 tsp',
      label: 'Red chilli powder',
      note: null,
    })
  })

  it('"to taste" ingredients never grow fake numbers', () => {
    const salt = { item: 'Salt', qty: null, unit: null }
    expect(scaleIngredient(salt, 12)).toEqual({ amount: null, label: 'Salt', note: 'to taste' })
  })
})

describe('isRecipeV2', () => {
  it('discriminates v2 from legacy v1', () => {
    const v2: RecipeV2 = { v: 2, sections: [], method: [], notes: '' }
    const v1: RecipeV1 = { sections: [{ heading: 'Ingredients', items: ['2 cups flour'] }], method: [], notes: '' }
    expect(isRecipeV2(v2)).toBe(true)
    expect(isRecipeV2(v1)).toBe(false)
    expect(isRecipeV2(null)).toBe(false)
  })
})
