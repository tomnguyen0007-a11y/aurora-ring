import type { Mantra } from '../store/types'

/** Deterministic quote-of-the-day: same quote all day, rotates daily. */
export function quoteOfDay(mantras: Mantra[]): Mantra | null {
  if (!mantras.length) return null
  const now = new Date()
  const dayNumber = Math.floor(Date.parse(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00`) / 86_400_000)
  return mantras[dayNumber % mantras.length]
}
