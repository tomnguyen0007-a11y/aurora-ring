import type { CalibrateState } from '../store/store'
import type { Habit } from '../store/types'
import { lastNDates, todayISO, weekdayOf } from './dates'
import { macrosForDate } from './stats'

/* ════════════════════════════════════════════════════════════════════
   THE CONSISTENCY ENGINE
   Habits read from the data you already log. Drinking water in Fuel
   ticks the hydration habit; there is no second place to record the
   same fact. Only habits with no natural source fall back to a manual
   toggle, so the streak can never lie to you.
   ════════════════════════════════════════════════════════════════════ */

/** Seeded habit ids that derive their value from real logs. */
const DERIVED: Record<string, (s: CalibrateState, date: string) => number> = {
  'h-protein': (s, d) => macrosForDate(s, d).protein,
  'h-water': (s, d) => s.water[d] ?? 0,
  'h-read': (s, d) => s.readingLog[d] ?? 0,
  'h-blackout': (s, d) => (s.checkIns[d]?.blackoutOnTime === true ? 1 : 0),
  'h-checkin': (s, d) => (s.checkIns[d] ? 1 : 0),
  'h-train': (s, d) =>
    s.workoutLogs.some((l) => l.date === d && l.completed) ||
    s.hevySessions.some((h) => h.date === d) ||
    s.runLogs.some((r) => r.date === d)
      ? 1
      : 0,
  'h-golf': (s, d) => (s.golfSessions.some((g) => g.date === d) ? 1 : 0),
}

export function isDerived(habitId: string): boolean {
  return habitId in DERIVED
}

/** Current value for a habit on a date — derived where possible, manual otherwise. */
export function habitValue(s: CalibrateState, date: string, habit: Habit): number {
  const manual = s.habitLog[date]?.[habit.id]
  const derive = DERIVED[habit.id]
  if (derive) {
    const auto = derive(s, date)
    // A manual tick can only ever add to the derived truth, never contradict it.
    return Math.max(auto, manual ?? 0)
  }
  return manual ?? 0
}

/** Does this habit apply on this date at all? */
export function habitApplies(habit: Habit, date: string): boolean {
  if (!habit.days.length) return true
  const wd = weekdayOf(new Date(`${date}T12:00:00`))
  return habit.days.includes(wd)
}

export function habitHit(s: CalibrateState, date: string, habit: Habit): boolean {
  if (!habitApplies(habit, date)) return true
  return habitValue(s, date, habit) >= (habit.target || 1)
}

/**
 * Consecutive days ending today (or yesterday, if today is still open).
 * Today never breaks a streak — the day isn't over yet.
 */
export function habitStreak(s: CalibrateState, habit: Habit, window = 180): number {
  const dates = lastNDates(window)
  const today = todayISO()
  let count = 0
  for (let i = dates.length - 1; i >= 0; i--) {
    const d = dates[i]
    if (!habitApplies(habit, d)) continue
    if (habitHit(s, d, habit)) count++
    else if (d === today) continue
    else break
  }
  return count
}

/** Last N days as booleans, oldest first — for the don't-break-the-chain strip. */
export function habitChain(s: CalibrateState, habit: Habit, days = 28): boolean[] {
  return lastNDates(days).map((d) => habitApplies(habit, d) && habitHit(s, d, habit))
}

export function habitRate(s: CalibrateState, habit: Habit, days = 30): number {
  const applicable = lastNDates(days).filter((d) => habitApplies(habit, d))
  if (!applicable.length) return 0
  const hits = applicable.filter((d) => habitHit(s, d, habit)).length
  return Math.round((hits / applicable.length) * 100)
}

export interface DayScore {
  done: number
  total: number
  pct: number
}

/** How much of today is actually banked — the number the whole app hangs on. */
export function dayScore(s: CalibrateState, date = todayISO()): DayScore {
  const active = s.habits.filter((h) => !h.archived && habitApplies(h, date))
  const done = active.filter((h) => habitHit(s, date, h)).length
  return { done, total: active.length, pct: active.length ? Math.round((done / active.length) * 100) : 0 }
}

/** The single habit most worth doing next — nearest to target, still open. */
export function nextBestHabit(s: CalibrateState, date = todayISO()): Habit | null {
  const open = s.habits
    .filter((h) => !h.archived && habitApplies(h, date) && !habitHit(s, date, h))
    .sort((a, b) => {
      const pa = habitValue(s, date, a) / (a.target || 1)
      const pb = habitValue(s, date, b) / (b.target || 1)
      return pb - pa
    })
  return open[0] ?? null
}

/** Days since a habit was last hit — powers the "you've drifted" nudge. */
export function daysSince(s: CalibrateState, habit: Habit, window = 60): number | null {
  const dates = lastNDates(window)
  for (let i = dates.length - 1; i >= 0; i--) {
    if (habitHit(s, dates[i], habit)) return dates.length - 1 - i
  }
  return null
}
