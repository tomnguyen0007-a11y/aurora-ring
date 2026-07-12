import { describe, expect, it } from 'vitest'
import { fmtMonthKey, lastNMonthKeys, monthKey } from './dates'
import { monthlySeries } from './stats'

describe('month bucketing helpers', () => {
  it('monthKey extracts YYYY-MM', () => {
    expect(monthKey('2026-07-11')).toBe('2026-07')
  })

  it('lastNMonthKeys ends with the current month, oldest first', () => {
    const keys = lastNMonthKeys(3, new Date(2026, 6, 15)) // July 2026
    expect(keys).toEqual(['2026-05', '2026-06', '2026-07'])
  })

  it('lastNMonthKeys crosses year boundaries correctly', () => {
    const keys = lastNMonthKeys(4, new Date(2026, 1, 10)) // Feb 2026
    expect(keys).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('fmtMonthKey adds the year on January so multi-year charts stay readable', () => {
    expect(fmtMonthKey('2026-01')).toMatch(/Jan 26/)
    expect(fmtMonthKey('2026-07')).toBe('Jul')
  })
})

describe('monthlySeries — full-history aggregation', () => {
  it('sums entries into their calendar months and zero-fills empty ones', () => {
    const ref = new Date()
    const thisKey = lastNMonthKeys(1, ref)[0]
    const twoAgoKey = lastNMonthKeys(3, ref)[0]
    const series = monthlySeries(
      [
        { date: `${thisKey}-05`, value: 30 },
        { date: `${thisKey}-20`, value: 45 },
        { date: `${twoAgoKey}-10`, value: 60 },
      ],
      3,
    )
    expect(series).toHaveLength(3)
    expect(series[0].value).toBe(60) // two months ago
    expect(series[1].value).toBe(0) // empty middle month stays zero
    expect(series[2].value).toBe(75) // this month
  })

  it('ignores entries older than the window instead of misbucketing them', () => {
    const old = { date: '2019-01-15', value: 999 }
    const series = monthlySeries([old], 12)
    expect(series.every((m) => m.value === 0)).toBe(true)
  })
})
