import type { CalibrateState } from '../store/store'
import { nowMinutes, todayISO, weekdayOf } from './dates'
import { macrosForDate, workoutsThisWeek } from './stats'

export interface Alert {
  id: string
  severity: 'warn' | 'info'
  text: string
}

/**
 * Live compliance alerts — pace-based nudges so shortfalls surface before
 * the day is lost, not after.
 */
export function computeAlerts(s: CalibrateState): Alert[] {
  const date = todayISO()
  const now = nowMinutes()
  const m = macrosForDate(s, date)
  const alerts: Alert[] = []
  const dayFrac = Math.min(1, Math.max(0, (now - 6.5 * 60) / (16 * 60))) // 06:30 → 22:30 window

  // Water pace: expect proportional progress through the waking day
  const expectedWater = s.macros.waterMl * dayFrac
  if (now > 10 * 60 && m.water < expectedWater * 0.6) {
    alerts.push({
      id: 'water',
      severity: 'warn',
      text: `Hydration behind pace — ${(m.water / 1000).toFixed(1)}L of ~${(expectedWater / 1000).toFixed(1)}L expected by now. Front-load it.`,
    })
  }

  // Protein: check from mid-afternoon
  const expectedProtein = s.macros.protein[0] * dayFrac
  if (now > 15 * 60 && m.protein < expectedProtein * 0.65) {
    alerts.push({
      id: 'protein',
      severity: 'warn',
      text: `Protein behind — ${Math.round(m.protein)}g so far, pace needs ~${Math.round(expectedProtein)}g. Anchor the next meal at 40–50g.`,
    })
  }

  // Calories: evening check
  if (now > 19 * 60 && m.kcal < s.macros.kcal[0] * 0.7) {
    alerts.push({
      id: 'kcal',
      severity: 'warn',
      text: `Calories at ${m.kcal} — the lean-bulk floor is ${s.macros.kcal[0]}. Don't leave growth on the table tonight.`,
    })
  }

  // Workout day, not done by evening
  const workout = s.workouts.find((w) => w.weekday === weekdayOf() && !w.id.startsWith('o-'))
  if (workout && now > 18 * 60) {
    const log = s.workoutLogs.find((l) => l.date === date && l.workoutId === workout.id)
    if (!log?.completed) {
      alerts.push({ id: 'workout', severity: 'warn', text: `${workout.name} not logged yet — session window was 16:00.` })
    }
  }

  // Evening audit + blackout
  if (now > 21 * 60 && !s.checkIns[date]) {
    alerts.push({ id: 'audit', severity: 'info', text: 'Systems audit pending — log weight, sleep and blackout before shutdown.' })
  }
  if (now >= 22 * 60 && now < 22.5 * 60) {
    alerts.push({ id: 'blackout', severity: 'info', text: 'Blackout in under 30 minutes. Screens down, magnesium, wind-down.' })
  }

  // Weekly lift adherence (Sunday evening)
  if (weekdayOf() === 6 && now > 18 * 60) {
    const wk = workoutsThisWeek(s)
    if (wk.done < wk.planned) {
      alerts.push({ id: 'week', severity: 'info', text: `Week closed at ${wk.done}/${wk.planned} lifts. Audit what got in the way.` })
    }
  }

  return alerts
}

/** Fire browser notifications for new alerts (only while app is open). */
export function notifyAlerts(alerts: Alert[]) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const key = `calibrate-notified-${todayISO()}`
  const seen: string[] = JSON.parse(sessionStorage.getItem(key) ?? '[]')
  for (const a of alerts) {
    if (seen.includes(a.id)) continue
    try {
      new Notification('CALIBRATE — Jarvis', { body: a.text, icon: './icon-192.png' })
      seen.push(a.id)
    } catch {
      break
    }
  }
  sessionStorage.setItem(key, JSON.stringify(seen))
}
