/**
 * Tests for the v2 structured recipe format.
 *
 * The core guarantee here is UNIT PRESERVATION: an ingredient authored in kg
 * stays in kg, tsp stays tsp, litres stay litres. Scaling multiplies the
 * number and keeps the unit — no cross-system conversion, no magnitude
 * promotion. This is the owner's explicit rule (chefs prefer different units).
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeQtyUnit,
  formatAmount,
  scaleIngredient,
  alternativeAmounts,
  getRecipeComponents,
  isRecipeV2,
  recipeBaseServings,
  type RecipeV2,
  type RecipeV1,
  type RecipeSectionV2,
} from './recipe-format'

describe('normalizeQtyUnit — ingest canonicalises spelling, never converts', () => {
  it('canonicalises unit aliases to their own token', () => {
    expect(normalizeQtyUnit(100, 'gms')).toEqual({ qty: 100, unit: 'g' })
    expect(normalizeQtyUnit(2, 'teaspoons')).toEqual({ qty: 2, unit: 'tsp' })
    expect(normalizeQtyUnit(3, 'pieces')).toEqual({ qty: 3, unit: 'pcs' })
  })

  it('keeps kg as kg and litres as litres (no magnitude/system conversion)', () => {
    expect(normalizeQtyUnit(0.4, 'kg')).toEqual({ qty: 0.4, unit: 'kg' })
    expect(normalizeQtyUnit(8, 'litres')).toEqual({ qty: 8, unit: 'l' })
  })

  it('collapses missing, zero, or unknown units to "to taste"', () => {
    expect(normalizeQtyUnit(null, 'g')).toEqual({ qty: null, unit: null })
    expect(normalizeQtyUnit(0, 'g')).toEqual({ qty: null, unit: null })
    expect(normalizeQtyUnit(2, 'handfuls')).toEqual({ qty: null, unit: null })
    expect(normalizeQtyUnit(1, 'to taste')).toEqual({ qty: null, unit: null })
  })
})

describe('formatAmount — preserves the authored unit', () => {
  it('grams stay grams even past 1000 (no g→kg promotion)', () => {
    expect(formatAmount(400, 'g')).toBe('400 g')
    expect(formatAmount(20000, 'g')).toBe('20,000 g')
  })

  it('kg stays kg even below 1 (no kg→g promotion)', () => {
    expect(formatAmount(0.4, 'kg')).toBe('0.4 kg')
    expect(formatAmount(2.5, 'kg')).toBe('2.5 kg')
  })

  it('litres pluralise and stay litres', () => {
    expect(formatAmount(1, 'l')).toBe('1 litre')
    expect(formatAmount(8, 'l')).toBe('8 litres')
  })

  it('spoons stay spoons and read as fractions (no tsp→tbsp)', () => {
    expect(formatAmount(7, 'tsp')).toBe('7 tsp')
    expect(formatAmount(0.5, 'tsp')).toBe('1/2 tsp')
    expect(formatAmount(1.5, 'tbsp')).toBe('1 1/2 tbsp')
  })

  it('rounds bulk weight/volume to scale-friendly steps and groups thousands', () => {
    expect(formatAmount(333, 'g')).toBe('335 g')
    expect(formatAmount(1333, 'ml')).toBe('1,335 ml')
    expect(formatAmount(23.4, 'g')).toBe('23 g')
  })

  it('pcs render bare, pinches pluralise', () => {
    expect(formatAmount(10, 'pcs')).toBe('10')
    expect(formatAmount(1, 'pinch')).toBe('1 pinch')
    expect(formatAmount(3, 'pinch')).toBe('3 pinches')
  })

  it('null / non-positive amounts render as no-amount', () => {
    expect(formatAmount(null, 'g')).toBeNull()
    expect(formatAmount(5, null)).toBeNull()
  })
})

describe('scaleIngredient — exact math, unit preserved', () => {
  it('scales a gram ingredient and keeps grams', () => {
    const rice = { item: 'Basmati rice', qty: 400, unit: 'g' as const, note: 'washed' }
    expect(scaleIngredient(rice, 5)).toEqual({ amount: '2,000 g', label: 'Basmati rice', note: 'washed' })
  })

  it('scales a kg ingredient and keeps kg', () => {
    const chicken = { item: 'Chicken thighs', qty: 0.4, unit: 'kg' as const }
    expect(scaleIngredient(chicken, 25)).toEqual({ amount: '10 kg', label: 'Chicken thighs', note: null })
  })

  it('scales a spoon ingredient and keeps the spoon', () => {
    const chilli = { item: 'Red chilli powder', qty: 1, unit: 'tsp' as const }
    expect(scaleIngredient(chilli, 7)).toEqual({ amount: '7 tsp', label: 'Red chilli powder', note: null })
  })

  it('"to taste" ingredients never grow a fake number', () => {
    const salt = { item: 'Salt', qty: null, unit: null }
    expect(scaleIngredient(salt, 12)).toEqual({ amount: null, label: 'Salt', note: 'to taste' })
  })
})

describe('alternativeAmounts — chef-chosen view conversions', () => {
  const units = (qty: number, unit: Parameters<typeof alternativeAmounts>[1]) =>
    alternativeAmounts(qty, unit).map(o => `${o.approx ? '~' : ''}${o.unit}`)

  it('keeps the original unit first', () => {
    expect(alternativeAmounts(150, 'ml')[0]).toEqual({ qty: 150, unit: 'ml', approx: false })
  })

  it('offers spoons and a cross-system weight for a small liquid amount', () => {
    // 150 ml → tbsp/cup (exact), and ≈g (cross-system)
    expect(units(150, 'ml')).toContain('tbsp')
    expect(units(150, 'ml')).toContain('~g')
  })

  it('offers ml and a cross-system gram for a small spoon amount', () => {
    // 1 tsp → 5 ml (exact) and ≈5 g (cross-system)
    const opts = alternativeAmounts(1, 'tsp')
    expect(opts.find(o => o.unit === 'ml')).toMatchObject({ qty: 5, approx: false })
    expect(opts.find(o => o.unit === 'g')).toMatchObject({ qty: 5, approx: true })
  })

  it('does NOT offer spoons/cups for a bulk solid (no "160 tsp of chicken")', () => {
    const opts = units(800, 'g')
    expect(opts).not.toContain('tsp')
    expect(opts).not.toContain('tbsp')
    expect(opts).not.toContain('cup')
    // a millilitre equivalent is fine though
    expect(opts).toContain('~ml')
  })

  it('returns just the original for count/pinch units', () => {
    expect(alternativeAmounts(10, 'pcs')).toEqual([{ qty: 10, unit: 'pcs', approx: false }])
    expect(alternativeAmounts(2, 'pinch')).toEqual([{ qty: 2, unit: 'pinch', approx: false }])
  })
})

describe('getRecipeComponents — explicit components + legacy fallback', () => {
  const sec = (heading: string, item: string): RecipeSectionV2 => ({
    heading, items: [{ item, qty: 1, unit: 'g' }],
  })

  it('returns explicit components verbatim when present', () => {
    const recipe: RecipeV2 = {
      v: 2, baseServings: 4, notes: '',
      components: [
        { title: 'Rajma', sections: [sec('Ingredients', 'Rajma')], method: ['Cook the rajma.'] },
        { title: 'Rice', sections: [sec('Ingredients', 'Basmati rice')], method: ['Boil the rice.'] },
      ],
    }
    const comps = getRecipeComponents(recipe, 'Rajma Chawal')
    expect(comps.map(c => c.title)).toEqual(['Rajma', 'Rice'])
  })

  it('LEGACY: splits a curry + rice recipe at the "For the rice:" marker', () => {
    const recipe: RecipeV2 = {
      v: 2, baseServings: 4, notes: '',
      sections: [sec('For the chicken marinade', 'Chicken'), sec('For the gravy', 'Tomato'), sec('For the peas & carrot rice', 'Basmati rice')],
      method: [
        'Marinate the chicken.',
        'Fry the onion and make the gravy.',
        'Add the chicken back to the gravy.',
        'For the rice: wash the basmati rice.',
        'Cook the rice until soft.',
      ],
    }
    const comps = getRecipeComponents(recipe, 'Butter Chicken w/ Peas & Carrot Rice')
    expect(comps).toHaveLength(2)
    expect(comps[0].title).toBe('Butter Chicken')
    expect(comps[0].method).toHaveLength(3)
    expect(comps[0].sections.map(s => s.heading)).toEqual(['For the chicken marinade', 'For the gravy'])
    expect(comps[1].title).toBe('Rice')
    expect(comps[1].method[0]).toBe('wash the basmati rice.')
    expect(comps[1].sections.map(s => s.heading)).toEqual(['For the peas & carrot rice'])
  })

  it('LEGACY: returns a single component for a one-flow recipe (no markers)', () => {
    const recipe: RecipeV2 = {
      v: 2, baseServings: 4, notes: '',
      sections: [sec('For the Aloo Kheema', 'Lamb mince'), sec('For serving', 'Arabic Bread')],
      method: ['Fry the onion.', 'Add the mince and cook.', 'Serve with bread.'],
    }
    const comps = getRecipeComponents(recipe, 'Aloo Kheema w/ Arabic Bread')
    expect(comps).toHaveLength(1)
    expect(comps[0].method).toHaveLength(3)
  })

  it('LEGACY: ignores a stray "For X:" that matches no section heading', () => {
    const recipe: RecipeV2 = {
      v: 2, baseServings: 4, notes: '',
      sections: [sec('Ingredients', 'Chicken')],
      method: ['Cook the chicken.', 'For best results: rest it 5 minutes.'],
    }
    const comps = getRecipeComponents(recipe, 'Roast Chicken')
    expect(comps).toHaveLength(1)
  })
})

describe('recipe base servings + version discrimination', () => {
  it('reads baseServings from a v2 recipe, defaults legacy/v1 to 4', () => {
    const v2: RecipeV2 = { v: 2, baseServings: 6, sections: [], method: [], notes: '' }
    const v1: RecipeV1 = { sections: [{ heading: 'Ingredients', items: ['2 cups flour'] }], method: [], notes: '' }
    expect(recipeBaseServings(v2)).toBe(6)
    expect(recipeBaseServings(v1)).toBe(4)
    expect(recipeBaseServings(null)).toBe(4)
  })

  it('isRecipeV2 discriminates v2 from legacy v1', () => {
    const v2: RecipeV2 = { v: 2, baseServings: 4, sections: [], method: [], notes: '' }
    const v1: RecipeV1 = { sections: [], method: [], notes: '' }
    expect(isRecipeV2(v2)).toBe(true)
    expect(isRecipeV2(v1)).toBe(false)
    expect(isRecipeV2(null)).toBe(false)
  })
})
