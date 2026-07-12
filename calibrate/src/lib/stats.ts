import type { CalibrateState } from '../store/store'
import type { GolfCategory } from '../store/types'
import { fmtMonthKey, lastNDates, lastNMonthKeys, monthKey, todayISO, weekDates } from './dates'

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
  const logged = s.workoutLogs.filter((l) => dates.has(l.date) && l.completed).length
  const imported = s.hevySessions.filter((h) => dates.has(h.date)).length
  // planned = the Blueprint split (exclude the optional Ollie library)
  const planned = s.workouts.filter((w) => !w.id.startsWith('o-')).length
  return { done: logged + imported, planned }
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

// ——— Progressive overload coaching ———

/** Epley estimated 1RM */
export function est1RM(weight: number, reps: number): number {
  if (!weight || !reps) return 0
  return Math.round(weight * (1 + reps / 30))
}

export interface ExerciseInsight {
  best: { weight: number; reps: number; e1rm: number } | null
  last: { date: string; weight: number; reps: number } | null
  sessions: number
  trend: number[] // e1rm per session, chronological
  suggestion: string
}

/** Aggregate a single exercise across all logged sessions for the coach. */
export function exerciseInsight(s: CalibrateState, exerciseId: string, repLow: number, repHigh: number): ExerciseInsight {
  const logs = s.workoutLogs
    .filter((l) => l.entries[exerciseId]?.some((set) => set.weight != null && set.reps != null))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  let best: ExerciseInsight['best'] = null
  const trend: number[] = []
  let last: ExerciseInsight['last'] = null

  for (const log of logs) {
    let sessionBest = 0
    let sessionTop: { weight: number; reps: number } | null = null
    for (const set of log.entries[exerciseId]) {
      if (set.weight == null || set.reps == null) continue
      const e = est1RM(set.weight, set.reps)
      if (e > sessionBest) {
        sessionBest = e
        sessionTop = { weight: set.weight, reps: set.reps }
      }
      const e1rm = est1RM(set.weight, set.reps)
      if (!best || e1rm > best.e1rm) best = { weight: set.weight, reps: set.reps, e1rm }
    }
    if (sessionBest) trend.push(sessionBest)
    if (sessionTop) last = { date: log.date, ...sessionTop }
  }

  let suggestion = 'Log a set to start tracking progression.'
  if (last) {
    if (last.reps >= repHigh) {
      suggestion = `Hit ${last.reps} reps at ${last.weight}kg — top of the range. Add load next session.`
    } else if (last.reps < repLow) {
      suggestion = `${last.reps} reps is below ${repLow}. Repeat ${last.weight}kg until you clear ${repLow}+ clean.`
    } else {
      suggestion = `Repeat ${last.weight}kg and push for ${repHigh} reps to earn the load increase.`
    }
  }

  return { best, last, sessions: logs.length, trend, suggestion }
}

// ——— Long-horizon history ———
// Nothing is ever pruned from the store, so history views are pure aggregation:
// bucket dated entries by month and sum.

/** Bucket dated values into the last `months` calendar months (oldest → current). */
export function monthlySeries(entries: { date: string; value: number }[], months = 12): { label: string; value: number }[] {
  const keys = lastNMonthKeys(months)
  const sums = new Map(keys.map((k) => [k, 0]))
  for (const e of entries) {
    const k = monthKey(e.date)
    if (sums.has(k)) sums.set(k, sums.get(k)! + e.value)
  }
  return keys.map((k) => ({ label: fmtMonthKey(k), value: sums.get(k)! }))
}

/** Golf hours per month, last 12 months. */
export function golfMonthlySeries(s: CalibrateState, months = 12): { label: string; value: number }[] {
  return monthlySeries(
    s.golfSessions.map((g) => ({ date: g.date, value: g.minutes })),
    months,
  ).map((m) => ({ ...m, value: Math.round((m.value / 60) * 10) / 10 }))
}

export interface GolfAllTime {
  totalMinutes: number
  sessions: number
  byCategory: Record<GolfCategory, number>
  firstDate: string | null
  /** average minutes per week since the first logged session */
  avgWeekMinutes: number
}

export function golfAllTime(s: CalibrateState): GolfAllTime {
  const byCategory = { putting: 0, chipping: 0, 'long-game': 0, drills: 0, simulator: 0, 'on-course': 0 }
  let totalMinutes = 0
  let firstDate: string | null = null
  for (const g of s.golfSessions) {
    byCategory[g.category] += g.minutes
    totalMinutes += g.minutes
    if (!firstDate || g.date < firstDate) firstDate = g.date
  }
  const weeks = firstDate ? Math.max(1, (Date.now() - new Date(firstDate + 'T00:00').getTime()) / (7 * 86400000)) : 1
  return { totalMinutes, sessions: s.golfSessions.length, byCategory, firstDate, avgWeekMinutes: Math.round(totalMinutes / weeks) }
}

/** Completed workouts (logged + Hevy-imported) per month. */
export function trainingMonthlySeries(s: CalibrateState, months = 12): { label: string; value: number }[] {
  const entries = [
    ...s.workoutLogs.filter((l) => l.completed).map((l) => ({ date: l.date, value: 1 })),
    ...s.hevySessions.map((h) => ({ date: h.date, value: 1 })),
  ]
  return monthlySeries(entries, months)
}

/** Running distance (km) per month. */
export function runMonthlySeries(s: CalibrateState, months = 12): { label: string; value: number }[] {
  return monthlySeries(
    s.runLogs.map((r) => ({ date: r.date, value: r.distanceKm ?? 0 })),
    months,
  ).map((m) => ({ ...m, value: Math.round(m.value * 10) / 10 }))
}

/** Revenue per month. */
export function revenueMonthlySeries(s: CalibrateState, months = 12): { label: string; value: number }[] {
  return monthlySeries(
    s.revenue.map((r) => ({ date: r.date, value: r.amount })),
    months,
  ).map((m) => ({ ...m, value: Math.round(m.value) }))
}

/** Reading hours per month. */
export function readingMonthlySeries(s: CalibrateState, months = 12): { label: string; value: number }[] {
  return monthlySeries(
    Object.entries(s.readingLog).map(([date, minutes]) => ({ date, value: minutes })),
    months,
  ).map((m) => ({ ...m, value: Math.round((m.value / 60) * 10) / 10 }))
}

// ——— Weekly Review ———

export interface WeekSnapshot {
  golfMin: number
  workouts: number
  runKm: number
  revenue: number
  readingMin: number
  /** average completion % across days that had schedule blocks AND have already happened */
  schedulePct: number
  checkIns: number
}

/** Everything that happened in the given dates, one number per pillar. */
export function weekSnapshot(s: CalibrateState, dates: string[]): WeekSnapshot {
  const set = new Set(dates)
  const today = todayISO()
  const golfMin = s.golfSessions.filter((g) => set.has(g.date)).reduce((a, g) => a + g.minutes, 0)
  const workouts =
    s.workoutLogs.filter((l) => set.has(l.date) && l.completed).length + s.hevySessions.filter((h) => set.has(h.date)).length
  const runKm = s.runLogs.filter((r) => set.has(r.date)).reduce((a, r) => a + (r.distanceKm ?? 0), 0)
  const revenue = s.revenue.filter((r) => set.has(r.date)).reduce((a, r) => a + r.amount, 0)
  const readingMin = dates.reduce((a, d) => a + (s.readingLog[d] ?? 0), 0)
  const checkIns = dates.filter((d) => !!s.checkIns[d]).length

  const elapsed = dates.filter((d) => d <= today)
  let pctSum = 0
  let pctDays = 0
  for (const d of elapsed) {
    const wd = ((new Date(d + 'T12:00:00').getDay() + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6
    const p = dayProgress(s, d, wd)
    if (p.total > 0) {
      pctSum += p.pct
      pctDays++
    }
  }
  return {
    golfMin,
    workouts,
    runKm: Math.round(runKm * 10) / 10,
    revenue,
    readingMin,
    schedulePct: pctDays ? Math.round(pctSum / pctDays) : 0,
    checkIns,
  }
}

/** This week vs last — the raw material of the Sunday review. */
export function weeklyReview(s: CalibrateState): { current: WeekSnapshot; previous: WeekSnapshot } {
  const now = new Date()
  const prevRef = new Date(now)
  prevRef.setDate(now.getDate() - 7)
  return { current: weekSnapshot(s, weekDates(now)), previous: weekSnapshot(s, weekDates(prevRef)) }
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
