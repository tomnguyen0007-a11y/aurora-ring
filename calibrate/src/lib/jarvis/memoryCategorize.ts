import type { MemoryCategory } from '../../store/types'

// Pure heuristics with no store dependency — kept separate from memory.ts so the
// store's migration step (store.ts) can import them without a circular import
// (memory.ts itself depends on the store to read/write facts).

/** Guess which category a new fact belongs to, from its wording. */
export function inferCategory(text: string): MemoryCategory {
  const t = text.toLowerCase()
  if (/golf|handicap|putt|chip|fairway|swing|scramble/.test(t)) return 'golf'
  if (/lift|gym|workout|training|run|zone ?2|reps?|sets?|hypertrophy/.test(t)) return 'fitness'
  if (/food|meal|kcal|calor|protein|carb|macro|diet|nutrition|water|hydrat/.test(t)) return 'nutrition'
  if (/sleep|recover|blackout|supplement|caffeine|alcohol|stress/.test(t)) return 'recovery'
  if (/aurora|revenue|business|sale|client|store|marketing/.test(t)) return 'business'
  return 'life'
}

/** Heuristic importance: durable preferences/rules score higher than passing remarks. */
export function inferImportance(text: string): number {
  const t = text.toLowerCase()
  if (/always|never|non-negotiable|must|prefer|hate|allerg/.test(t)) return 8
  return 5
}
