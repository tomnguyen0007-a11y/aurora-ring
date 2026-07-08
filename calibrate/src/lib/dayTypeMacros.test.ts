import { describe, expect, it } from 'vitest'
import { computeExample80kg, parseGkgRange } from './dayTypeMacros'

describe('parseGkgRange', () => {
  it('parses a hyphen range', () => {
    expect(parseGkgRange('3.5-4.5')).toEqual({ low: 3.5, high: 4.5, mid: 4 })
  })

  it('parses an en-dash range (existing seed data format)', () => {
    expect(parseGkgRange('1.8–2.2')).toEqual({ low: 1.8, high: 2.2, mid: 2 })
  })

  it('parses a single value as a degenerate range', () => {
    expect(parseGkgRange('4.5')).toEqual({ low: 4.5, high: 4.5, mid: 4.5 })
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseGkgRange(' 2.5 - 3.5 ')).toEqual({ low: 2.5, high: 3.5, mid: 3 })
  })

  it('treats unparseable input as zero', () => {
    expect(parseGkgRange('n/a')).toEqual({ low: 0, high: 0, mid: 0 })
  })
})

describe('computeExample80kg', () => {
  it('matches the Lift day reference figure from the seed table (within ≈1 kcal rounding)', () => {
    expect(computeExample80kg('1.8–2.2', '3.5–4.5', '0.6–0.8')).toBe('P160 C320 F56 ≈ 2424 kcal')
  })

  it('recomputes when a range is edited', () => {
    // Lift day carbs bumped from 3.5-4.5 to 5-6
    expect(computeExample80kg('1.8–2.2', '5-6', '0.6–0.8')).toBe('P160 C440 F56 ≈ 2904 kcal')
  })

  it('handles a single-value (non-range) input', () => {
    expect(computeExample80kg('2', '4', '0.7')).toBe('P160 C320 F56 ≈ 2424 kcal')
  })

  it('scales with a different reference bodyweight', () => {
    expect(computeExample80kg('2', '4', '0.7', 90)).toBe('P180 C360 F63 ≈ 2727 kcal')
  })
})
