import type { Weekday } from '../store/types'

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

export function todayISO(): string {
  return toISO(new Date())
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Monday-based weekday index (0 = Monday … 6 = Sunday) */
export function weekdayOf(d: Date = new Date()): Weekday {
  return ((d.getDay() + 6) % 7) as Weekday
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return toISO(d)
}

/** ISO dates of the current week, Monday first */
export function weekDates(ref: Date = new Date()): string[] {
  const monday = new Date(ref)
  monday.setDate(ref.getDate() - weekdayOf(ref))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toISO(d)
  })
}

export function lastNDates(n: number, ref: Date = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(ref)
    d.setDate(ref.getDate() - (n - 1 - i))
    return toISO(d)
  })
}

/** 'YYYY-MM' month bucket for an ISO date — history aggregation key */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** The last n month keys, oldest first, ending with the current month */
export function lastNMonthKeys(n: number, ref: Date = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(ref.getFullYear(), ref.getMonth() - (n - 1 - i), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

/** Short label for a 'YYYY-MM' key, e.g. 'Jul' (with year for January: 'Jan 27') */
export function fmtMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const name = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' })
  return m === 1 ? `${name} ${String(y).slice(2)}` : name
}

/** minutes since midnight for "HH:MM" */
export function toMinutes(hhmm: string): number {
  if (!hhmm) return 24 * 60
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function nowMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

export function fmtDateLong(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function fmtDateShort(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function fmtHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
