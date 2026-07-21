/**
 * Tests for the method-step cleaners. The model occasionally leaks fixed
 * amounts into prose ("add 100 ml water") and emits standalone section-header
 * steps ("For the Lemon Rice:"). Both would confuse the kitchen (amounts are
 * scaled daily; header-steps render as bare numbered lines), so these run
 * unconditionally on every generated/converted recipe.
 */

import { describe, it, expect } from 'vitest'
import { cleanMethodStep, mergeHeaderSteps } from './recipe-generate'

describe('cleanMethodStep', () => {
  it('drops a leading step number', () => {
    expect(cleanMethodStep('1. Fry the onion until soft.')).toBe('Fry the onion until soft.')
    expect(cleanMethodStep('3) Add the tomato.')).toBe('Add the tomato.')
  })

  it('strips leaked cooking amounts but keeps the sentence readable', () => {
    expect(cleanMethodStep('Add 100 ml water to make gravy smooth.')).toBe('Add water to make gravy smooth.')
    expect(cleanMethodStep('Add salt and 0.25 tsp turmeric powder.')).toBe('Add salt and turmeric powder.')
    expect(cleanMethodStep('Blend the cashews with 50 ml water.')).toBe('Blend the cashews with water.')
  })

  it('strips "<amount> of the X" without leaving a dangling "of"', () => {
    expect(cleanMethodStep('Add 2 tbsp of the soy sauce.')).toBe('Add the soy sauce.')
    expect(cleanMethodStep('Pour in 200 ml of the coconut milk.')).toBe('Pour in the coconut milk.')
  })

  it('strips full-word measurements too', () => {
    expect(cleanMethodStep('Add 2 tablespoons of ginger-garlic paste.')).toBe('Add ginger-garlic paste.')
    expect(cleanMethodStep('Mix in 150 grams of onion.')).toBe('Mix in onion.')
  })

  it('swaps chef jargon for plain words', () => {
    expect(cleanMethodStep('Let the cumin seeds splutter.')).toBe('Let the cumin seeds crackle.')
    expect(cleanMethodStep('Dredge each piece in the flour.')).toBe('coat each piece in the flour.')
    expect(cleanMethodStep('Add the julienned carrots.')).toBe('Add the cut thin carrots.')
    expect(cleanMethodStep('Layer the par-cooked rice.')).toBe('Layer the partly cooked rice.')
  })

  it('leaves times, sizes, and temperatures alone', () => {
    expect(cleanMethodStep('Cook for 8-10 minutes until oil separates.')).toBe('Cook for 8-10 minutes until oil separates.')
    expect(cleanMethodStep('Cut the paneer into 1-inch cubes.')).toBe('Cut the paneer into 1-inch cubes.')
    expect(cleanMethodStep('Cook until fully done, no pink inside.')).toBe('Cook until fully done, no pink inside.')
  })
})

describe('mergeHeaderSteps', () => {
  it('folds a header-only step into the following step', () => {
    expect(mergeHeaderSteps(['For the Lemon Rice:', 'Wash the rice well.'])).toEqual([
      'For the Lemon Rice: Wash the rice well.',
    ])
  })

  it('drops a trailing header with no following step', () => {
    expect(mergeHeaderSteps(['Fry the onion.', 'For the rice:'])).toEqual(['Fry the onion.'])
  })

  it('leaves normal steps untouched', () => {
    expect(mergeHeaderSteps(['Fry the onion.', 'Add the tomato.'])).toEqual([
      'Fry the onion.',
      'Add the tomato.',
    ])
  })
})
