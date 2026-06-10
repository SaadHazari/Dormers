import { describe, expect, it } from 'vitest'
import {
  fitDishName, fitSingleLine, formatCustomerName,
  DISH_MAX_W, DISH_SIZE_LADDER,
  type MeasureFn,
} from './label-spec'

// Fake glyph measurer: width grows linearly with chars × size. The real
// engine uses pdfkit metrics; the fitting CONTRACT must hold for any measure.
const measure: MeasureFn = (text, _weight, sizeMm) => text.length * sizeMm * 0.6

describe('fitDishName', () => {
  it('keeps a single word on one line at full size when it fits', () => {
    const fit = fitDishName('Shakshouka', measure)
    expect(fit.lines).toEqual(['Shakshouka'])
    expect(fit.sizeMm).toBe(DISH_SIZE_LADDER[0])
  })

  it('stacks multi-word names into a balanced two-line hero (locked design)', () => {
    const fit = fitDishName('Chicken Biryani', measure)
    expect(fit.lines).toEqual(['Chicken', 'Biryani'])
    expect(fit.sizeMm).toBe(DISH_SIZE_LADDER[0])
  })

  it('balances the split to minimise the longer line', () => {
    const fit = fitDishName('Veg Hakka Noodles w/ Manchurian', measure)
    expect(fit.lines).toHaveLength(2)
    // Balanced: no split puts everything-but-one-word on a single line when
    // a more even break exists.
    const widths = fit.lines.map(l => measure(l, 800, fit.sizeMm, 0))
    expect(Math.max(...widths)).toBeLessThanOrEqual(DISH_MAX_W)
  })

  it('never overflows and never breaks mid-word, even for pathological names', () => {
    const cases = [
      'Slow-Braised Lamb Shank w/ Saffron Risotto and Charred Vegetables',
      'Supercalifragilisticexpialidocious',
      'A',
      'Paneer Tikka Masala w/ Garlic Butter Naan',
    ]
    for (const name of cases) {
      const fit = fitDishName(name, measure)
      expect(fit.lines.length).toBeLessThanOrEqual(2)
      for (const line of fit.lines) {
        expect(measure(line, 800, fit.sizeMm, 0)).toBeLessThanOrEqual(DISH_MAX_W + 1e-9)
      }
      // Every word survives intact, in order.
      expect(fit.lines.join(' ')).toBe(name.trim().replace(/\s+/g, ' '))
    }
  })
})

describe('fitSingleLine', () => {
  it('returns base size when text fits', () => {
    expect(fitSingleLine('Aman V.', 6.2, 87.6, 600, 0.1, measure)).toBe(6.2)
  })

  it('shrinks proportionally so long names exactly fit', () => {
    const size = fitSingleLine('Mohammed Abdulrahman Alshamsi A.', 6.2, 87.6, 600, 0.1, measure)
    expect(size).toBeLessThan(6.2)
    expect(measure('Mohammed Abdulrahman Alshamsi A.', 600, size, 0.1)).toBeLessThanOrEqual(87.6 + 1e-9)
  })
})

describe('formatCustomerName', () => {
  it('formats first name + last initial (brief: "Aman V.")', () => {
    expect(formatCustomerName('Aman Verma')).toBe('Aman V.')
    expect(formatCustomerName('Mohammed Abdulrahman Alshamsi')).toBe('Mohammed A.')
  })

  it('passes single names through and survives messy spacing', () => {
    expect(formatCustomerName('Lina')).toBe('Lina')
    expect(formatCustomerName('  Sara   Khan  ')).toBe('Sara K.')
  })
})
