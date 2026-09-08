import { describe, expect, it } from 'vitest'
import { correct, editDistance, normalise } from './normalise'

describe('editDistance', () => {
  it('is zero for identical strings', () => expect(editDistance('golf', 'golf')).toBe(0))
  it('counts a single substitution', () => expect(editDistance('golf', 'gols')).toBe(1))
  it('bails out past the ceiling rather than computing the true distance', () =>
    expect(editDistance('protein', 'zzzzzzzzzz', 2)).toBeGreaterThan(2))
})

describe('correct', () => {
  it('fixes a common misspelling towards the vocabulary', () => expect(correct('protien')).toBe('protein'))
  it('fixes a transposition', () => expect(correct('wieght')).toBe('weight'))
  it('leaves short tokens alone — too little signal to disambiguate', () => expect(correct('rn')).toBe('rn'))
  it('leaves unknown words alone', () => expect(correct('kubernetes')).toBe('kubernetes'))
  it('leaves an exact vocabulary word untouched', () => expect(correct('water')).toBe('water'))
})

describe('normalise', () => {
  it('spaces a unit stuck to its number', () => expect(normalise('30m putting')).toBe('30 min putting'))
  it('expands a domain abbreviation', () => expect(normalise('log 30m gf')).toBe('log 30 min golf'))
  it('reads a decimal comma', () => expect(normalise('drank 1,5l')).toContain('1.5 l'))
  it('keeps a thousands comma intact', () => expect(normalise('revenue 1,200')).toContain('1,200'))
  it('collapses a spaced phrase', () => expect(normalise('did my work out')).toContain('workout'))
  it('maps h2o to water', () => expect(normalise('add 500ml h2o')).toContain('water'))
  it('corrects a misspelling inside a sentence', () => expect(normalise('protien target today')).toContain('protein'))
  it('preserves punctuation around a corrected token', () => expect(normalise('protien, today?')).toContain('protein,'))
  it('is idempotent', () => {
    const once = normalise('log 30m gf')
    expect(normalise(once)).toBe(once)
  })
  it('does not mangle ordinary prose', () => {
    const s = normalise('what should i focus on this afternoon')
    expect(s).toBe('what should i focus on this afternoon')
  })
})

describe('normalise — regressions it must not cause', () => {
  // Each of these broke a real engine rule the first time the layer went in.
  it('leaves "that" alone even though it is one edit from "what"', () =>
    expect(normalise('make that 800 kcal')).toBe('make that 800 kcal'))
  it('does not rewrite "delete that meal"', () => expect(normalise('delete that meal')).toBe('delete that meal'))
  it('does not rewrite a correction phrase', () =>
    expect(normalise('that was tuna not salmon')).toBe('that was tuna not salmon'))
  it('leaves "lift" as a day type rather than mapping it to session', () =>
    expect(normalise('set lift day carbs to 4-5')).toContain('lift day'))
})
