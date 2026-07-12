import { fmtHours, todayISO, weekDates, weekdayOf } from '../dates'
import { dayProgress, golfMinutes, golfTotalWeek, macrosForDate, revenueToday, streaks, weightSeries, workoutsThisWeek } from '../stats'
import { useStore } from '../../store/store'
import type { DayTypeMacro } from '../../store/seed'
import type { Exercise, FoodLog, GolfCategory, Weekday, Workout } from '../../store/types'
import { applyActions, type JarvisAction } from './actions'
import { lookupFood } from './foodDb'
import { llmConfigured } from './llm'

// ————————————————————————————————————————————————————————
// UNIFIED JARVIS LOCAL ENGINE (PHASE 1)
// ————————————————————————————————————————————————————————
// This engine now operates within the unified Jarvis pipeline:
// 1. Input → buildJarvisContext() [ONCE, shared across all paths]
// 2. Local engine attempts fast regex-based patterns using full context
// 3. If no local match → forward to LLM with same context (consistent)
//
// Key improvements:
// - All responses use full profile + memory + knowledge context
// - No duplication of context logic between local & LLM paths
// - Semantic memory is consulted for relevance
// - Grounded knowledge informs local rule decisions
// ————————————————————————————————————————————————————————

export interface EngineResult {
  reply: string
  receipts: string[]
}

const num = (s: string) => parseFloat(s.replace(',', '.'))

function minutesFrom(match: RegExpMatchArray, valueIdx: number, unitIdx: number): number {
  const v = num(match[valueIdx])
  const unit = (match[unitIdx] ?? 'min').toLowerCase()
  return unit.startsWith('h') ? Math.round(v * 60) : Math.round(v)
}

const GOLF_WORDS: [RegExp, GolfCategory][] = [
  [/putt/i, 'putting'],
  [/chip|short game/i, 'chipping'],
  [/long game|driver|driving|range|full swing/i, 'long-game'],
  [/drill/i, 'drills'],
  [/sim(ulator)?/i, 'simulator'],
  [/course|round/i, 'on-course'],
]

function act(actions: JarvisAction[], reply: string): EngineResult {
  const receipts = applyActions(actions)
  return { reply, receipts }
}

// ————————————————————————————————————————————————————————
// Deterministic resolvers for workout/nutrition edit patterns.
// Tiered exact -> startsWith -> contains matching; ambiguous or
// zero hits both resolve to null so the caller falls through to
// the next pattern (and ultimately to the LLM) rather than guessing.
// ————————————————————————————————————————————————————————
type StoreState = ReturnType<typeof useStore.getState>

function tierMatch<T>(items: T[], nameOf: (item: T) => string, query: string): T | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const exact = items.filter((i) => nameOf(i).toLowerCase() === q)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null
  const starts = items.filter((i) => nameOf(i).toLowerCase().startsWith(q))
  if (starts.length === 1) return starts[0]
  if (starts.length > 1) return null
  const contains = items.filter((i) => nameOf(i).toLowerCase().includes(q))
  if (contains.length === 1) return contains[0]
  return null
}

function resolveExercise(s: StoreState, query: string): { workout: Workout; exercise: Exercise } | null {
  const all: { workout: Workout; exercise: Exercise }[] = []
  for (const w of s.workouts) for (const e of w.exercises) all.push({ workout: w, exercise: e })
  return tierMatch(all, (h) => h.exercise.name, query)
}

function resolveWorkout(s: StoreState, query: string): Workout | null {
  return tierMatch(s.workouts, (w) => w.name, query)
}

function resolveFood(s: StoreState, query?: string): FoodLog | null {
  const todays = s.foodLogs.filter((f) => f.date === todayISO())
  if (!todays.length) return null
  if (!query) return todays[0] // addFood prepends: index 0 is most recent
  return tierMatch(todays, (f) => f.name, query)
}

function resolveDayType(s: StoreState, query: string): DayTypeMacro | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const byCode = s.dayTypeMacros.find((d) => d.code.toLowerCase() === q)
  if (byCode) return byCode
  return tierMatch(s.dayTypeMacros, (d) => d.label, q)
}

function numericReps(reps: string): number | null {
  return /^\d+$/.test(reps.trim()) ? parseInt(reps, 10) : null
}

const WEEKDAY_MAP: Record<string, Weekday> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
}

/**
 * Unified local engine: attempt to handle input without LLM.
 * Now receives full context from the unified pipeline.
 *
 * Returns null if this query needs the LLM (vision, complex reasoning, strategy).
 * Returns EngineResult if handled locally (logging, quick facts, navigation).
 *
 * All responses use grounded context (profile, memory, knowledge, live state).
 */
export function runLocalEngine(input: string, contextUserName?: string): EngineResult | null {
  const t = input.trim()
  const s = useStore.getState()
  const name = contextUserName || s.settings.userName || 'sir'
  let m: RegExpMatchArray | null

  // ——— greetings / identity ———
  if (/^(hi|hey|hello|yo|jarvis)[\s!.,]*$/i.test(t)) {
    const prog = dayProgress(s, todayISO(), weekdayOf())
    return {
      reply: `At your service, ${name}. ${prog.done} of ${prog.total} blocks executed today. Say things like "log 30 min putting", "add eggs to grocery", "protein today?", or "what's next?"`,
      receipts: [],
    }
  }

  // ——— golf logging: "log 45 min putting", "did 1h chipping" ———
  m = t.match(/(?:log|add|did|track|record)\s.*?(\d+(?:[.,]\d+)?)\s*(min(?:ute)?s?|h(?:ou)?rs?|h)\s*(?:of\s+)?(.*)/i)
  if (m) {
    const rest = (m[3] || t).toLowerCase()
    const golfCat = GOLF_WORDS.find(([re]) => re.test(rest) || re.test(t))
    const minutes = minutesFrom(m, 1, 2)

    if (golfCat && minutes > 0) {
      const receipts = applyActions([{ type: 'log_golf', category: golfCat[1], minutes }])
      const total = golfTotalWeek(useStore.getState())
      return {
        reply: `Logged, ${name}. ${fmtHours(minutes)} of ${golfCat[1].replace('-', ' ')} on the books — ${fmtHours(total)} total this week.`,
        receipts,
      }
    }

    if (/read/i.test(rest) || /read/i.test(t)) {
      return act([{ type: 'log_reading', minutes }], `${minutes} minutes of reading logged. Sharp mind, sharp game.`)
    }

    if (/(run|ran|jog|cardio|zone ?2)/i.test(rest) || /(run|ran|jog|zone ?2)/i.test(t)) {
      const km = t.match(/(\d+(?:[.,]\d+)?)\s*k(?:m|ilometer)/i)
      return act(
        [{ type: 'log_run', minutes, distanceKm: km ? num(km[1]) : undefined }],
        `Engine work logged: ${minutes} minutes${km ? `, ${km[1]} km` : ''}. Zone 2 builds champions.`,
      )
    }
  }

  // ——— water corrections FIRST (they'd otherwise be swallowed by the additive pattern):
  // "set water to 1l", "remove 500ml water", "correct my water to 1500ml" ———
  m = t.match(/(?:set|correct|fix|make)\s+(?:my\s+)?water\s*(?:to|at)?\s*(\d+(?:[.,]\d+)?)\s*(ml|l|liter|litre)s?/i)
  if (m) {
    const v = num(m[1])
    const ml = (m[2] ?? 'l').toLowerCase() === 'ml' ? v : v * 1000
    return act([{ type: 'set_water', ml }], `Water corrected to ${(ml / 1000).toFixed(1)}L today, ${name}.`)
  }
  m = t.match(/(?:remove|subtract|minus|take off|undo)\s.*?(\d+(?:[.,]\d+)?)\s*(ml|l|liter|litre)s?\b.*water|water.*?(?:remove|subtract|minus)\s*(\d+(?:[.,]\d+)?)\s*(ml|l|liter|litre)s?/i)
  if (m) {
    const v = num(m[1] ?? m[3])
    const unit = (m[2] ?? m[4] ?? 'ml').toLowerCase()
    const ml = unit === 'ml' ? v : v * 1000
    const after = Math.max(0, macrosForDate(s, todayISO()).water - ml)
    return act([{ type: 'log_water', ml: -ml }], `Removed ${ml >= 1000 ? `${(ml / 1000).toFixed(1)}L` : `${Math.round(ml)}ml`} — ${(after / 1000).toFixed(1)}L on the books today.`)
  }

  // ——— water: "500ml water", "log water", "drank a liter" ———
  m = t.match(
    /(\d+(?:[.,]\d+)?)\s*(ml|l|liter|litre)s?\b.*(water|hydrat)|(?:water|hydrat).*?(\d+(?:[.,]\d+)?)\s*(ml|l|liter|litre)s?\b/i,
  )
  if (m) {
    const v = num(m[1] ?? m[4])
    const unit = (m[2] ?? m[5] ?? 'ml').toLowerCase()
    const ml = unit === 'ml' ? v : v * 1000
    const after = (macrosForDate(s, todayISO()).water + ml) / 1000
    return act([{ type: 'log_water', ml }], `Hydration +${Math.round(ml)}ml → ${after.toFixed(1)}L of your ${s.macros.waterMl / 1000}L target.`)
  }
  if (/^(log |add )?water$/i.test(t)) {
    return act([{ type: 'log_water', ml: 500 }], `+500ml water. Stay above baseline, ${name}.`)
  }

  // ——— weight: "log weight 84.2", "i weigh 85 kg" ———
  m = t.match(/(?:weight|weigh(?:ed)?)\s*(?:is|:)?\s*(\d{2,3}(?:[.,]\d+)?)\s*(?:kg)?/i)
  if (m && num(m[1]) > 30 && num(m[1]) < 200) {
    const kg = num(m[1])
    const to90 = (90 - kg).toFixed(1)
    return act(
      [{ type: 'log_weight', kg }],
      `Weight logged: ${kg} kg. ${kg < 90 ? `${to90} kg from the 90 kg ceiling — stay in the lean surplus.` : 'Target zone. Hold it lean.'}`,
    )
  }

  // ——— sleep: "slept 8 hours", "sleep 7.5" ———
  m = t.match(/sle(?:pt|ep)\s*(?:for|:)?\s*(\d(?:[.,]\d+)?)\s*h/i)
  if (m) {
    const hours = num(m[1])
    return act(
      [{ type: 'log_sleep', hours }],
      `${hours}h of recovery logged. ${hours >= 8 ? 'CNS fully serviced. ' : 'Under the 8h standard — protect tonight’s 22:30 blackout. '}`,
    )
  }

  // ——— handicap: "handicap 2.1" ———
  m = t.match(/handicap\s*(?:is|to|:)?\s*(\+?-?\d(?:[.,]\d+)?)/i)
  if (m) {
    const v = num(m[1].replace('+', '-')) // "+1" → plus handicap, store as negative
    return act([{ type: 'log_handicap', value: v }], `Handicap updated to ${m[1]}. The plus is coming.`)
  }

  // ——— grocery: "add X (and Y) to grocery/shopping/list" ———
  m = t.match(/(?:add|put|need|buy)\s+(.+?)\s+(?:to|on)\s+(?:the\s+)?(?:grocery|groceries|shopping|list|supply)/i) ??
    t.match(/^(?:grocery|buy)[:\s]+(.+)/i)
  if (m) {
    const items = m[1]
      .split(/,|\band\b/i)
      .map((x) => x.trim())
      .filter(Boolean)
    return act(
      items.map((name_) => ({ type: 'add_grocery' as const, name: name_ })),
      items.length > 1 ? `${items.length} items on the supply list.` : `"${items[0]}" is on the list.`,
    )
  }

  // ——— revenue: "made 250 today", "log revenue 300", "$120 sale" ———
  m = t.match(/(?:revenue|made|earned|sold|sale)\D*?\$?\s?(\d+(?:[.,]\d+)?)/i)
  if (m && /revenue|made|earned|sold|sale|\$/i.test(t)) {
    const amount = num(m[1])
    const after = revenueToday(s) + amount
    return act(
      [{ type: 'log_revenue', amount }],
      `$${amount} logged. Today: $${after.toFixed(0)} of the $1,000 target${after >= 1000 ? ' — target hit. Exceptional.' : '.'}`,
    )
  }

  // ————————————————————————————————————————————————————————
  // WORKOUT: sets × reps
  // ————————————————————————————————————————————————————————
  m = t.match(/^(?:reduce|change|update)\s+(.+?)\s+from\s+\d+\s*x\s*\d+\s+to\s+(\d+)\s*x\s*(\d+)/i)
  if (m) {
    const target = resolveExercise(s, m[1])
    const sets = parseInt(m[2], 10)
    if (target && sets > 0) {
      return act(
        [{ type: 'update_exercise', workout: target.workout.name, exercise: target.exercise.name, sets, reps: m[3] }],
        `${target.exercise.name} → ${sets}×${m[3]}.`,
      )
    }
  }

  m = t.match(/^set\s+(.+?)\s+to\s+(\d+)\s*x\s*(\d+)$/i)
  if (m) {
    const target = resolveExercise(s, m[1])
    const sets = parseInt(m[2], 10)
    if (target && sets > 0) {
      return act(
        [{ type: 'update_exercise', workout: target.workout.name, exercise: target.exercise.name, sets, reps: m[3] }],
        `${target.exercise.name} → ${sets}×${m[3]}.`,
      )
    }
  }

  m = t.match(/^(\d+)\s*x\s*(\d+)\s+(.+)/i)
  if (m) {
    const sets = parseInt(m[1], 10)
    const target = resolveExercise(s, m[3])
    if (target && sets > 0) {
      return act(
        [{ type: 'update_exercise', workout: target.workout.name, exercise: target.exercise.name, sets, reps: m[2] }],
        `${target.exercise.name} → ${sets}×${m[2]}.`,
      )
    }
  }

  m = t.match(/^(.+?)\s+(\d+)\s*x\s*(\d+)(?:\s+instead)?$/i)
  if (m) {
    const target = resolveExercise(s, m[1])
    const sets = parseInt(m[2], 10)
    if (target && sets > 0) {
      return act(
        [{ type: 'update_exercise', workout: target.workout.name, exercise: target.exercise.name, sets, reps: m[3] }],
        `${target.exercise.name} → ${sets}×${m[3]}.`,
      )
    }
  }

  m = t.match(/^(.+?):?\s+(\d+)\s*sets?\s+of\s+(\d+)/i)
  if (m) {
    const target = resolveExercise(s, m[1])
    const sets = parseInt(m[2], 10)
    if (target && sets > 0) {
      return act(
        [{ type: 'update_exercise', workout: target.workout.name, exercise: target.exercise.name, sets, reps: m[3] }],
        `${target.exercise.name} → ${sets}×${m[3]}.`,
      )
    }
  }

  m = t.match(/^increase\s+(.+?)\s+by\s+(\d+)\s*reps?/i) ?? t.match(/^add\s+(\d+)\s*reps?\s+to\s+(.+)/i)
  if (m) {
    const isFirstForm = /^increase/i.test(t)
    const exerciseQuery = isFirstForm ? m[1] : m[2]
    const delta = parseInt(isFirstForm ? m[2] : m[1], 10)
    const target = resolveExercise(s, exerciseQuery)
    const current = target ? numericReps(target.exercise.reps) : null
    if (target && current != null) {
      const reps = String(current + delta)
      return act(
        [{ type: 'update_exercise', workout: target.workout.name, exercise: target.exercise.name, reps }],
        `${target.exercise.name} reps → ${reps}.`,
      )
    }
  }

  m = t.match(/^drop\s+(\d+)\s*sets?\s+from\s+(.+)/i)
  if (m) {
    const delta = parseInt(m[1], 10)
    const target = resolveExercise(s, m[2])
    if (target) {
      const sets = Math.max(1, target.exercise.sets - delta)
      return act(
        [{ type: 'update_exercise', workout: target.workout.name, exercise: target.exercise.name, sets }],
        `${target.exercise.name} → ${sets} sets.`,
      )
    }
  }

  // ——— add exercise: "add calf raise 3x15 to leg day" ———
  m = t.match(/^add\s+(.+?)\s+(\d+)\s*x\s*(\d+)\s+to\s+(?:the\s+)?(.+)/i)
  if (m) {
    const workout = resolveWorkout(s, m[4])
    const sets = parseInt(m[2], 10)
    if (workout && m[1].trim() && sets > 0) {
      return act(
        [{ type: 'add_exercise', workout: workout.name, name: m[1].trim(), sets, reps: m[3] }],
        `Added to ${workout.name}: ${m[1].trim()} ${sets}×${m[3]}.`,
      )
    }
  }

  // ——— rename exercise/workout: "rename X to Y", "change X to Y", "X → Y" ———
  m = t.match(/^(?:rename|change)\s+(.+?)\s+to\s+(.+)$/i) ?? t.match(/^(.+?)\s*→\s*(.+)$/)
  if (m) {
    const oldQuery = m[1].trim()
    const newName = m[2].trim()
    const exTarget = resolveExercise(s, oldQuery)
    if (exTarget) {
      return act(
        [{ type: 'update_exercise', workout: exTarget.workout.name, exercise: exTarget.exercise.name, name: newName }],
        `Renamed to "${newName}".`,
      )
    }
    const woTarget = resolveWorkout(s, oldQuery)
    if (woTarget) {
      return act([{ type: 'update_workout', workout: woTarget.name, name: newName }], `Workout renamed to "${newName}".`)
    }
  }

  // ——— cue management ———
  m = t.match(/^(.+?)\s+add\s+cue:?\s+(.+)/i)
  if (m) {
    const target = resolveExercise(s, m[1])
    if (target) {
      return act(
        [{ type: 'update_exercise', workout: target.workout.name, exercise: target.exercise.name, cue: m[2].trim() }],
        `Cue added to ${target.exercise.name}: "${m[2].trim()}".`,
      )
    }
  }
  m = t.match(/^set\s+(.+?)\s+cue\s+to\s+(.+)/i)
  if (m) {
    const target = resolveExercise(s, m[1])
    if (target) {
      return act(
        [{ type: 'update_exercise', workout: target.workout.name, exercise: target.exercise.name, cue: m[2].trim() }],
        `Cue set for ${target.exercise.name}: "${m[2].trim()}".`,
      )
    }
  }
  m = t.match(/^add\s+tempo\s+(.+?)\s+to\s+(.+)/i)
  if (m) {
    const target = resolveExercise(s, m[2])
    if (target) {
      return act(
        [{ type: 'update_exercise', workout: target.workout.name, exercise: target.exercise.name, cue: `tempo ${m[1].trim()}` }],
        `Tempo cue added to ${target.exercise.name}.`,
      )
    }
  }
  m = t.match(/^(?:remove|clear)\s+cue\s+from\s+(.+)/i) ?? t.match(/^clear\s+(?:the\s+)?(.+?)\s+note$/i)
  if (m) {
    const target = resolveExercise(s, m[1])
    if (target) {
      return act(
        [{ type: 'update_exercise', workout: target.workout.name, exercise: target.exercise.name, cue: '' }],
        `Cue cleared for ${target.exercise.name}.`,
      )
    }
  }

  // ————————————————————————————————————————————————————————
  // WORKOUT: workout-level restructuring
  // ————————————————————————————————————————————————————————
  m = t.match(/^move\s+(.+?)\s+to\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i)
  if (m) {
    const target = resolveWorkout(s, m[1])
    const weekday = WEEKDAY_MAP[m[2].toLowerCase()]
    if (target) {
      return act(
        [{ type: 'update_workout', workout: target.name, weekday }],
        `${target.name} moved to ${m[2]}.`,
      )
    }
  }

  m = t.match(/^(?:create|add)\s+(?:a\s+|new\s+)?workout:?\s+(.+?)\s+on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i)
  if (m) {
    const weekday = WEEKDAY_MAP[m[2].toLowerCase()]
    return act([{ type: 'add_workout', name: m[1].trim(), weekday }], `New workout: ${m[1].trim()} on ${m[2]}.`)
  }

  // ——— generic delete/remove: exercise → workout → food ———
  m = t.match(/^delete that meal$/i) ?? t.match(/^undo last food$/i)
  if (m) {
    const food = resolveFood(s)
    if (food) return act([{ type: 'delete_food', name: food.name }], `Removed food log: ${food.name}.`)
  }
  m = t.match(/^(?:remove|delete)\s+(?:the\s+)?(.+)/i) ?? t.match(/^drop\s+the\s+(.+)/i)
  if (m) {
    const query = m[1].trim()
    const exTarget = resolveExercise(s, query)
    if (exTarget) {
      return act(
        [{ type: 'remove_exercise', workout: exTarget.workout.name, exercise: exTarget.exercise.name }],
        `Removed from ${exTarget.workout.name}: ${exTarget.exercise.name}.`,
      )
    }
    const woTarget = resolveWorkout(s, query)
    if (woTarget) {
      return act([{ type: 'remove_workout', workout: woTarget.name }], `Workout removed: ${woTarget.name}.`)
    }
    const food = resolveFood(s, query)
    if (food) {
      return act([{ type: 'delete_food', name: food.name }], `Removed food log: ${food.name}.`)
    }
  }
  m = t.match(/^i\s+didn'?t\s+eat\s+(?:the\s+)?(.+)/i)
  if (m) {
    const food = resolveFood(s, m[1].trim())
    if (food) return act([{ type: 'delete_food', name: food.name }], `Removed food log: ${food.name}.`)
  }

  // ————————————————————————————————————————————————————————
  // NUTRITION: rename food entry
  // ————————————————————————————————————————————————————————
  m = t.match(/^(?:that|it)\s+was\s+(.+?)\s+not\s+(.+)/i)
  if (m) {
    const food = resolveFood(s, m[2].trim())
    if (food) {
      return act([{ type: 'update_food', name: food.name, newName: m[1].trim() }], `Corrected: "${m[1].trim()}".`)
    }
  }
  m = t.match(/^rename it to\s+(.+)/i) ?? t.match(/^fix the name to\s+(.+)/i) ?? t.match(/^call it\s+(.+)/i)
  if (m) {
    const food = resolveFood(s)
    if (food) {
      return act([{ type: 'update_food', name: food.name, newName: m[1].trim() }], `Renamed to "${m[1].trim()}".`)
    }
  }

  // ————————————————————————————————————————————————————————
  // NUTRITION: macro corrections
  // ————————————————————————————————————————————————————————
  m = t.match(/^make\s+(?:that|it)\s+(\d+)\s*k?cal/i)
  if (m) {
    const food = resolveFood(s)
    if (food) return act([{ type: 'update_food', name: food.name, kcal: parseInt(m[1], 10) }], `Updated: ${food.name} → ${m[1]} kcal.`)
  }
  m = t.match(/^fix the protein to\s+(\d+)/i)
  if (m) {
    const food = resolveFood(s)
    if (food) return act([{ type: 'update_food', name: food.name, protein: parseInt(m[1], 10) }], `Updated: ${food.name} → ${m[1]}g protein.`)
  }
  m = t.match(/^change carbs to\s+(\d+)/i)
  if (m) {
    const food = resolveFood(s)
    if (food) return act([{ type: 'update_food', name: food.name, carbs: parseInt(m[1], 10) }], `Updated: ${food.name} → ${m[1]}g carbs.`)
  }
  m = t.match(/^set fat to\s+(\d+)/i)
  if (m) {
    const food = resolveFood(s)
    if (food) return act([{ type: 'update_food', name: food.name, fat: parseInt(m[1], 10) }], `Updated: ${food.name} → ${m[1]}g fat.`)
  }
  m = t.match(/^correct\s+(.+?)\s+to\s+(\d+)\s*g?\s*protein/i)
  if (m) {
    const food = resolveFood(s, m[1].trim())
    if (food) return act([{ type: 'update_food', name: food.name, protein: parseInt(m[2], 10) }], `Updated: ${food.name} → ${m[2]}g protein.`)
  }
  m = t.match(/^(.+?)\s+was\s+(\d+)\s*k?cal\s+not\s+\d+/i)
  if (m) {
    const food = resolveFood(s, m[1].trim())
    if (food) return act([{ type: 'update_food', name: food.name, kcal: parseInt(m[2], 10) }], `Corrected: ${food.name} → ${m[2]} kcal.`)
  }
  m = t.match(/^update\s+(.+?):\s*(\d+)\s*k?cal\s*\/\s*(\d+)\s*g?\s*protein\s*\/\s*(\d+)\s*g?\s*carbs/i)
  if (m) {
    const food = resolveFood(s, m[1].trim())
    if (food) {
      return act(
        [{ type: 'update_food', name: food.name, kcal: parseInt(m[2], 10), protein: parseInt(m[3], 10), carbs: parseInt(m[4], 10) }],
        `Updated: ${food.name} → ${m[2]} kcal / ${m[3]}g protein / ${m[4]}g carbs.`,
      )
    }
  }

  // ————————————————————————————————————————————————————————
  // NUTRITION: fuelling framework — day-type carb periodisation
  // "set lift day carbs to 4-5", "change recovery protein to 2-2.2", "update quality run fat to 0.65"
  // ————————————————————————————————————————————————————————
  m = t.match(/^(?:set|change|update)\s+(.+?)\s+(?:day\s+)?(carbs?|protein|fat)\s+(?:target\s+)?(?:to|at)\s+([\d.]+(?:\s*[-–]\s*[\d.]+)?)/i)
  if (m) {
    const dayType = resolveDayType(s, m[1])
    const value = m[3].trim()
    const kw = m[2].toLowerCase()
    if (dayType) {
      const patch: JarvisAction = kw.startsWith('carb')
        ? { type: 'update_day_type_macro', dayType: dayType.code, carbGkg: value }
        : kw === 'protein'
          ? { type: 'update_day_type_macro', dayType: dayType.code, proteinGkg: value }
          : { type: 'update_day_type_macro', dayType: dayType.code, fatGkg: value }
      return act([patch], `${dayType.label} ${kw} target → ${value} g/kg.`)
    }
  }

  // ——— food WITH explicit calories: "log food chicken bowl 750 kcal 55 protein" / "ate ... 800 kcal" ———
  // The kcal unit is REQUIRED: a bare number after a food is usually grams or a
  // quantity ("150 g of yogurt"), and logging grams as calories is exactly the
  // kind of garbage entry that destroys trust. Messages describing food without
  // explicit calories fall through to the LLM, which estimates like a
  // nutritionist per item (or hits the food database) instead of regex-guessing.
  // Multi-item messages ("porridge, then 150g yogurt") also belong to the LLM —
  // each item needs its own entry with its own macros.
  const multiItem = /(?:,|\band then\b|\bplus\b|\bfollowed by\b|&)/i.test(t)
  m = t.match(/(?:log |ate |had |eat )(?:food )?(.+?)(?:[,;]|\s[-–])?\s*(\d{2,4})\s*k?cal(?:ories)?\b(?:\D+(\d{1,3})\s*(?:g\s*)?protein)?/i)
  if (m && !multiItem) {
    const foodName = m[1]
      .replace(/\b(a|an|the|some|my|in)\b/gi, '')
      .trim()
    const kcal = parseInt(m[2])
    const protein = m[3] ? parseInt(m[3]) : undefined

    if (foodName && kcal > 20) {
      const after = macrosForDate(s, todayISO())
      return act(
        [{ type: 'log_food', name: foodName, kcal, protein }],
        `Fuel logged: ${foodName}, ${kcal} kcal${protein ? ` / ${protein}g protein` : ''}. Running total ${after.kcal + kcal} kcal.`,
      )
    }
  }

  // ——— food WITHOUT numbers: "ate a banana", "had chicken breast", "log my protein shake" ———
  // Anti-hallucination: only intercept when the item is a confirmed hit in the local food
  // database (real figures) — log it immediately without ever going near the LLM.
  // If it's NOT a hit, fall through (return null) rather than guess here: could be casual
  // conversation ("had a great day"), and the LLM's system prompt is instructed to ask
  // for the label instead of inventing a number for anything outside the food database.
  m =
    t.match(/^(?:ate|had|eat|eating)\s+(?:my |a |an |the )?(.+)/i) ??
    t.match(/^(?:log|add|track|record)\s+(?:my |a |an |the )?(.+?(?:shake|smoothie|meal|snack|breakfast|lunch|dinner|protein|whey|yogurt|yoghurt))\b.*/i)
  if (m) {
    const foodName = m[1].trim()
    const found = lookupFood(foodName)

    if (found) {
      const after = macrosForDate(s, todayISO())
      return act(
        [{ type: 'log_food', name: foodName || found.matchedAlias, kcal: found.kcal, protein: found.protein, carbs: found.carbs, fat: found.fat }],
        `Logged: ${foodName || found.matchedAlias} (${found.serving}) — ${found.kcal} kcal / ${found.protein}g protein from my food database. Running total ${after.kcal + found.kcal} kcal.`,
      )
    }
  }

  // ——— check off block: "done with gym", "check off dinner", "finished deep work" ———
  m = t.match(/(?:done with|check(?: off)?|finished|completed?|tick)\s+(?:the\s+)?(.+)/i)
  if (m) {
    const target = m[1].trim()

    if (/workout|gym|session|lift/i.test(target)) {
      return act(
        [{ type: 'complete_workout' }, { type: 'complete_block', title: 'gym' }],
        `Session closed out. Recovery protocol from here, ${name}.`,
      )
    }

    const res = act([{ type: 'complete_block', title: target }], '')
    if (res.receipts.length) {
      const prog = dayProgress(useStore.getState(), todayISO(), weekdayOf())
      return { ...res, reply: `Done. ${prog.done}/${prog.total} blocks executed today.` }
    }
  }

  // ——— memory: "remember (that) X" ———
  m = t.match(/^remember(?:\s+that)?[:\s]+(.+)/is)
  if (m) {
    return act([{ type: 'remember', fact: m[1].trim() }], `Locked into memory, ${name}. I won't forget that.`)
  }

  // ——— notes: "note: ..." / "take a note ..." ———
  m = t.match(/^(?:take a |new |add )?note[:\s]+(.+)/is)
  if (m) {
    const body = m[1].trim()
    const title = body.split(/[.!?\n]/)[0].slice(0, 48)
    return act([{ type: 'add_note', title, body }], `Noted: "${title}".`)
  }

  // ——— goals: "add goal ..." ———
  m = t.match(/^(?:add |new |set )goal[:\s]+(.+)/i)
  if (m) {
    return act([{ type: 'add_goal', title: m[1].trim() }], `Goal locked in: "${m[1].trim()}". I'll hold you to it.`)
  }

  // ——— biz task: "aurora task ..." / "add task ... " ———
  m = t.match(/^(?:add )?(?:aurora|business|biz)?\s*task[:\s]+(.+)/i)
  if (m) {
    return act([{ type: 'add_biz_task', title: m[1].trim() }], `Queued for the next deep work block: "${m[1].trim()}".`)
  }

  // ——— book: "add book Deep Work by Cal Newport" ———
  m = t.match(/^add book[:\s]+(.+?)(?:\s+by\s+(.+))?$/i)
  if (m) {
    return act([{ type: 'add_book', title: m[1].trim(), author: m[2]?.trim() }], `"${m[1].trim()}" added to the library.`)
  }


  // ————————————————————————————————————————————————————
  // Q&A handlers below are FALLBACK-ONLY. When an LLM brain is configured,
  // questions route to it — it has the same live snapshot plus real reasoning
  // and web search. The regex handlers here once hijacked general-knowledge
  // questions ("how many calories does a big mac have" → answered with the
  // user's daily macro summary), which made Jarvis look broken.
  // Logging/action commands above this line stay local always: instant + free.
  // ————————————————————————————————————————————————————————
  if (llmConfigured()) return null

  // ——— queries: context-aware questions (no-LLM fallback) ———
  if (/what'?s next|next block|what now|next up/i.test(t)) {
    const wd = weekdayOf()
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    const next = s.schedule
      .filter((b) => b.weekday === wd)
      .sort((a, b) => a.start.localeCompare(b.start))
      .find((b) => {
        const [h, mm] = b.start.split(':').map(Number)
        return h * 60 + mm > nowMin
      })

    return {
      reply: next
        ? `Next: ${next.title} at ${next.start}${next.detail ? ` — ${next.detail}` : ''}.`
        : `Nothing left on today's blueprint. Execute the blackout at 22:30 and reset.`,
      receipts: [],
    }
  }

  // ——— macro queries: use context to inform precision ———
  if (/protein|calories|kcal|macros|how much.*(eat|food)/i.test(t) && /\?|today|now|left|how/i.test(t)) {
    const mm = macrosForDate(s, todayISO())
    const pLeft = Math.max(0, s.macros.protein[0] - mm.protein)
    const cLeft = Math.max(0, s.macros.kcal[0] - mm.kcal)

    return {
      reply: `Today: ${mm.kcal}/${s.macros.kcal[0]}-${s.macros.kcal[1]} kcal, protein ${mm.protein}/${s.macros.protein[0]}-${s.macros.protein[1]}g, carbs ${mm.carbs}g, fat ${mm.fat}g. ${cLeft > 0 ? `${cLeft} kcal & ${pLeft}g protein left to hit targets.` : 'Targets hit.'}`,
      receipts: [],
    }
  }

  // ——— golf analytics ———
  if (/golf.*(hours?|time|week|stats?)|how much.*(golf|practi[cs]e)|practi[cs]e.*(week|hours?)/i.test(t)) {
    const wk = golfMinutes(s, weekDates())
    const total = Object.values(wk).reduce((a, b) => a + b, 0)
    const parts = Object.entries(wk)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k.replace('-', ' ')} ${fmtHours(v)}`)

    return {
      reply: total
        ? `${fmtHours(total)} of golf work this week — ${parts.join(', ')}.`
        : `No golf logged this week yet. Wednesday simulator block is your next scheduled rep.`,
      receipts: [],
    }
  }

  // ——— streaks ———
  if (/streak|blackout|discipline/i.test(t) && /\?|how|what/i.test(t)) {
    const st = streaks(s)
    return {
      reply: `Streaks — blackout: ${st.blackout} days, reading: ${st.reading} days, check-in: ${st.checkin} days.`,
      receipts: [],
    }
  }

  // ——— weight trend ———
  if (/weight|weigh/i.test(t) && /\?|trend|how|what/i.test(t)) {
    const ws = weightSeries(s, 30)

    if (!ws.length) {
      return {
        reply: `No weight data yet. Log tonight during the systems audit — say "weight 84.2".`,
        receipts: [],
      }
    }

    const first = ws[0]
    const last = ws[ws.length - 1]
    const delta = (last.value - first.value).toFixed(1)

    return {
      reply: `Current: ${last.value} kg. ${ws.length > 1 ? `${Number(delta) >= 0 ? '+' : ''}${delta} kg over ${ws.length} logs. ` : ''}Target: 87–90 kg lean.`,
      receipts: [],
    }
  }

  // ——— revenue ———
  if (/revenue|sales|aurora.*(today|how)|how.*aurora/i.test(t) && /\?|today|how|what/i.test(t)) {
    const r = revenueToday(s)
    return {
      reply: `AURORA today: $${r.toFixed(0)} of $1,000. ${r >= 1000 ? 'Target achieved.' : `$${(1000 - r).toFixed(0)} to go.`}`,
      receipts: [],
    }
  }

  // ——— training ———
  if (/workout|training|session/i.test(t) && /\?|today|what/i.test(t)) {
    const w = s.workouts.find((x) => x.weekday === weekdayOf())
    const wk = workoutsThisWeek(s)

    return {
      reply: w
        ? `Today: ${w.name}. ${w.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(' · ')}. ${wk.done}/${wk.planned} sessions done this week.`
        : weekdayOf() === 3
          ? `No lift today — Thursday is the 45-minute Zone 2 engine run. Nasal breathing, conversational pace.`
          : `No lift scheduled today. ${wk.done}/${wk.planned} sessions done this week.`,
      receipts: [],
    }
  }

  // ——— help ———
  if (/^(help|what can you do|commands?)\??$/i.test(t)) {
    return {
      reply: `Built-in commands, ${name}: log golf ("log 45 min putting"), water ("500ml water"), weight ("weight 84.2"), sleep ("slept 8h"), food ("ate salmon rice 800 kcal 45 protein"), revenue ("made 250"), notes, tasks, goals, grocery. I can navigate views, execute plans, and remember facts about you. For strategy, analysis, or open conversation — use my full brain.`,
      receipts: [],
    }
  }

  // ——— No local match — forward to LLM ———
  return null
}
