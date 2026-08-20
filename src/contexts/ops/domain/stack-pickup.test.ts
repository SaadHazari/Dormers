/**
 * The owner's instinct was right but the naive version double counts. These
 * lock in the version that does not: each stack photo counts boxes, the
 * overview counts STACKS, and no box is ever counted in two places.
 */

import { describe, it, expect } from 'vitest'
import {
  reconcileStacks,
  needsStackMode,
  stackPhotoPath,
  STACK_MODE_THRESHOLD,
} from './stack-pickup'

describe('reconcileStacks — the happy path', () => {
  it('adds the stacks up and opens the day', () => {
    const r = reconcileStacks({ target: 24, stackCounts: [8, 8, 8], overviewStackCount: 3 })
    expect(r.outcome).toBe('accepted')
    expect(r.total).toBe(24)
    expect(r.accepted).toBe(true)
  })

  it('does not require the stacks to be equal sized', () => {
    const r = reconcileStacks({ target: 19, stackCounts: [8, 8, 3], overviewStackCount: 3 })
    expect(r.accepted).toBe(true)
    expect(r.total).toBe(19)
  })

  it('never adds the overview to the total', () => {
    // The whole point: if the overview counted boxes too, this would be 30.
    const r = reconcileStacks({ target: 24, stackCounts: [8, 8, 8], overviewStackCount: 3 })
    expect(r.total).toBe(24)
  })
})

describe('reconcileStacks — the ways it goes wrong', () => {
  it('sends back only the stack that could not be read, not the whole load', () => {
    const r = reconcileStacks({ target: 24, stackCounts: [8, null, 8], overviewStackCount: 3 })
    expect(r.outcome).toBe('stack_unreadable')
    expect(r.unreadableStacks).toEqual([2])
    expect(r.accepted).toBe(false)
  })

  it('names every unreadable stack, not just the first', () => {
    const r = reconcileStacks({ target: 24, stackCounts: [null, 8, null], overviewStackCount: 3 })
    expect(r.unreadableStacks).toEqual([1, 3])
  })

  it('catches a forgotten stack', () => {
    // Four stacks in the van, only three photographed.
    const r = reconcileStacks({ target: 32, stackCounts: [8, 8, 8], overviewStackCount: 4 })
    expect(r.outcome).toBe('stack_missing')
    expect(r.accepted).toBe(false)
  })

  it('catches the same stack being photographed twice', () => {
    // Three stacks in the van, four photos taken. Without the overview this
    // would sail through as a bigger, wrong total.
    const r = reconcileStacks({ target: 24, stackCounts: [8, 8, 8, 8], overviewStackCount: 3 })
    expect(r.outcome).toBe('stack_extra')
    expect(r.accepted).toBe(false)
  })

  it('holds when the stacks add up to the wrong number', () => {
    const r = reconcileStacks({ target: 24, stackCounts: [8, 8, 7], overviewStackCount: 3 })
    expect(r.outcome).toBe('total_mismatch')
    expect(r.total).toBe(23)
    expect(r.accepted).toBe(false)
  })

  it('holds when it cannot tell how many stacks there are', () => {
    const r = reconcileStacks({ target: 24, stackCounts: [8, 8, 8], overviewStackCount: null })
    expect(r.outcome).toBe('overview_unreadable')
    expect(r.accepted).toBe(false)
  })

  it('reports an unreadable stack before anything else', () => {
    // Everything is wrong at once. The actionable one is the reshoot.
    const r = reconcileStacks({ target: 99, stackCounts: [8, null], overviewStackCount: 5 })
    expect(r.outcome).toBe('stack_unreadable')
    expect(r.total).toBeNull()
  })

  it('never accepts on a coincidence of wrong parts', () => {
    // Sum is right, but a stack was shot twice and one forgotten.
    const r = reconcileStacks({ target: 16, stackCounts: [8, 8], overviewStackCount: 3 })
    expect(r.accepted).toBe(false)
  })
})

describe('needsStackMode', () => {
  it('leaves a small load as a single photo', () => {
    expect(needsStackMode(6)).toBe(false)
    expect(needsStackMode(STACK_MODE_THRESHOLD)).toBe(false)
  })

  it('splits a load once it is past the threshold', () => {
    expect(needsStackMode(STACK_MODE_THRESHOLD + 1)).toBe(true)
    expect(needsStackMode(30)).toBe(true)
  })
})

describe('stackPhotoPath', () => {
  it('keeps every stack and every attempt on its own key', () => {
    expect(stackPhotoPath('2026-08-20', 1, 1)).toBe('2026-08-20/_pickup/stack-1-a1.jpg')
    expect(stackPhotoPath('2026-08-20', 2, 1)).toBe('2026-08-20/_pickup/stack-2-a1.jpg')
    expect(stackPhotoPath('2026-08-20', 1, 2)).toBe('2026-08-20/_pickup/stack-1-a2.jpg')
  })

  it('gives the overview its own key', () => {
    expect(stackPhotoPath('2026-08-20', null, 1)).toBe('2026-08-20/_pickup/overview-a1.jpg')
  })
})
