/**
 * Tests for scaleQuantity — locks in the kitchen recipe-scaling behaviour
 * (including the known limitations, so a regression OR an intentional future
 * fix is caught here first).
 */

import { describe, it, expect } from 'vitest'
import { scaleQuantity } from './recipe-scaling'

describe('scaleQuantity — supported cases', () => {
  it('returns the line untouched at 1×', () => {
    expect(scaleQuantity('2 cups flour', 1)).toBe('2 cups flour')
  })

  it('scales a leading integer quantity', () => {
    expect(scaleQuantity('2 cups flour', 4)).toBe('8 cups flour')
  })

  it('scales a leading decimal quantity', () => {
    expect(scaleQuantity('1.5 cups rice', 4)).toBe('6 cups rice')
  })

  it('renders a fractional result to one decimal place', () => {
    // multiplier can be fractional (e.g. 10 meals / 4 base = 2.5)
    expect(scaleQuantity('3 cloves garlic', 2.5)).toBe('7.5 cloves garlic')
  })

  it('leaves a line with no leading number unchanged', () => {
    expect(scaleQuantity('Salt to taste', 4)).toBe('Salt to taste')
  })
})

describe('scaleQuantity — KNOWN LIMITATIONS (documented current behaviour)', () => {
  it('scales only the first endpoint of a range, AND injects a stray space (not yet implemented)', () => {
    // Desired one day: "8-12 tomatoes". Current: only the leading 2 scales and
    // the replacement always appends a space → a stray space before the dash.
    expect(scaleQuantity('2-3 tomatoes', 4)).toBe('8 -3 tomatoes')
  })

  it('mis-handles fractions, AND injects a stray space (not yet implemented)', () => {
    // Desired one day: "2 cup". Current: the leading 1 scales to 4 + stray space.
    expect(scaleQuantity('1/2 cup oil', 4)).toBe('4 /2 cup oil')
  })

  it('does not scale numbers that are not at the start of the line', () => {
    expect(scaleQuantity('Salt 1 tsp, 2 cloves garlic', 4)).toBe('Salt 1 tsp, 2 cloves garlic')
  })
})
