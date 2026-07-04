import type { CalibrateState } from '../store/store'
import type { GolfCategory } from '../store/types'
import { lastNDates, todayISO, weekDates } from './dates'

export const GOLF_CATEGORIES: { id: GolfCategory; label: string }[] = [
  { id: 'putting', label: 'Putting' },
  { id: 'chipping', label: 'Chipping' },
  { id: 'long-game', label: 'Long Game' },
  { id: 'drills', label: 'Drills' },
  { id: 'simulator', label: 'Simulator' },
  { id: 'on-course', label: 'On-Course' },
]

export function golfMinutes(s: CalibrateState, dates: string[]): Record<GolfCategory, number> {
  const out = { putting: 0, chipping: 0, 'long-game': 0, drills: 0, simulator: 0, 'on-course': 0 }
  const set = new Set(dates)
  for (const g of s.golfSessions) if (set.has(g.date)) out[g.category] += g.minutes
  return out
}

export function golfTotalWeek(s: CalibrateState): number {
  const m = golfMinutes(s, weekDates())
  return Object.values(m).reduce((a, b) => a + b, 0)
}

export function macrosForDate(s: CalibrateState, date: string) {
  const logs = s.foodLogs.filter((f) => f.date === date)
  return {
    kcal: logs.reduce((a, f) => a + f.kcal, 0),
    protein: logs.reduce((a, f) => a + f.protein, 0),
    carbs: logs.reduce((a, f) => a + f.carbs, 0),
    fat: logs.reduce((a, f) => a + f.fat, 0),
    water: s.water[date] ?? 0,
  }
}

export function dayProgress(s: CalibrateState, date: string, weekday: number) {
  const blocks = s.schedule.filter((b) => b.weekday === weekday)
  const checks = s.dayChecks[date] ?? {}
  const done = blocks.filter((b) => checks[b.id]).length
  return { done, total: blocks.length, pct: blocks.length ? Math.round((done / blocks.length) * 100) : 0 }
}

/** consecutive days (ending today or yesterday) where predicate holds */
function streak(pred: (date: string) => boolean): number {
  let count = 0
  const dates = lastNDates(120)
  for (let i = dates.length - 1; i >= 0; i--) {
    const d = dates[i]
    if (pred(d)) count++
    else if (d === todayISO()) continue // today not failed yet
    else break
  }
  return count
}

export function streaks(s: CalibrateState) {
  return {
    blackout: streak((d) => s.checkIns[d]?.blackoutOnTime === true),
    reading: streak((d) => (s.readingLog[d] ?? 0) >= 15),
    checkin: streak((d) => !!s.checkIns[d]),
  }
}

export function workoutsThisWeek(s: CalibrateState) {
  const dates = new Set(weekDates())
  const done = s.workoutLogs.filter((l) => dates.has(l.date) && l.completed).length
  return { done, planned: s.workouts.length }
}

export function weightSeries(s: CalibrateState, days = 60): { date: string; value: number }[] {
  return lastNDates(days)
    .map((d) => ({ date: d, value: s.checkIns[d]?.weightKg ?? null }))
    .filter((p): p is { date: string; value: number } => p.value != null)
}

export function revenueToday(s: CalibrateState): number {
  const t = todayISO()
  return s.revenue.filter((r) => r.date === t).reduce((a, r) => a + r.amount, 0)
}

export function revenueSeries(s: CalibrateState, days = 30): { date: string; value: number }[] {
  return lastNDates(days).map((d) => ({
    date: d,
    value: s.revenue.filter((r) => r.date === d).reduce((a, r) => a + r.amount, 0),
  }))
}

export function golfWeeklySeries(s: CalibrateState, weeks = 8): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = []
  const now = new Date()
  for (let w = weeks - 1; w >= 0; w--) {
    const ref = new Date(now)
    ref.setDate(now.getDate() - w * 7)
    const dates = new Set(weekDates(ref))
    const mins = s.golfSessions.filter((g) => dates.has(g.date)).reduce((a, g) => a + g.minutes, 0)
    out.push({ label: w === 0 ? 'now' : `-${w}w`, value: Math.round((mins / 60) * 10) / 10 })
  }
  return out
}
