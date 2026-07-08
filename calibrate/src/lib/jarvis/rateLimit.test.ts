import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canCall, msUntilSlot, providerLimit, rateLimitStatus, recordCall, resetRateLimits } from './rateLimit'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  resetRateLimits()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rateLimit', () => {
  it('allows calls under the per-provider limit', () => {
    for (let i = 0; i < providerLimit('gemini'); i++) {
      expect(canCall('gemini')).toBe(true)
      recordCall('gemini')
    }
  })

  it('blocks the call once the limit is hit within the window', () => {
    const limit = providerLimit('gemini')
    for (let i = 0; i < limit; i++) recordCall('gemini')
    expect(canCall('gemini')).toBe(false)
  })

  it('providers are tracked independently', () => {
    const limit = providerLimit('gemini')
    for (let i = 0; i < limit; i++) recordCall('gemini')
    expect(canCall('gemini')).toBe(false)
    expect(canCall('groq')).toBe(true)
  })

  it('frees up a slot once the 60s window rolls past the oldest call', () => {
    const limit = providerLimit('gemini')
    for (let i = 0; i < limit; i++) recordCall('gemini')
    expect(canCall('gemini')).toBe(false)
    vi.setSystemTime(60_001)
    expect(canCall('gemini')).toBe(true)
  })

  it('msUntilSlot returns 0 when under the limit', () => {
    expect(msUntilSlot('gemini')).toBe(0)
  })

  it('msUntilSlot returns time remaining until the oldest call ages out', () => {
    const limit = providerLimit('gemini')
    for (let i = 0; i < limit; i++) recordCall('gemini')
    expect(msUntilSlot('gemini')).toBe(60_000)
    vi.setSystemTime(40_000)
    expect(msUntilSlot('gemini')).toBe(20_000)
  })

  it('rateLimitStatus reports not limited when under budget', () => {
    expect(rateLimitStatus('gemini')).toMatchObject({ limited: false, retryInSec: 0 })
  })

  it('rateLimitStatus reports limited with a retry estimate in seconds', () => {
    const limit = providerLimit('gemini')
    for (let i = 0; i < limit; i++) recordCall('gemini')
    const status = rateLimitStatus('gemini')
    expect(status.limited).toBe(true)
    expect(status.retryInSec).toBeGreaterThan(0)
    expect(status.retryInSec).toBeLessThanOrEqual(60)
  })

  it('resetRateLimits clears all tracked call history', () => {
    const limit = providerLimit('gemini')
    for (let i = 0; i < limit; i++) recordCall('gemini')
    expect(canCall('gemini')).toBe(false)
    resetRateLimits()
    expect(canCall('gemini')).toBe(true)
  })
})
