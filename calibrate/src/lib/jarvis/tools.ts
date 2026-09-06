import { useStore, type TaxonomyKey } from '../../store/store'
import type { CustomBlock, Weekday } from '../../store/types'
import { todayISO, WEEKDAY_NAMES, weekdayOf } from '../dates'
import { formatResults, webSearch } from '../search'
import { dayScore, habitStreak, habitValue } from '../habits'
import { macrosForDate, revenueToday, workoutsThisWeek, golfMinutes } from '../stats'
import { weekDates } from '../dates'
import { findFood, formatMatches } from '../foodSearch'
import { inferCategory, inferImportance } from './memoryCategorize'

/* ════════════════════════════════════════════════════════════════════
   JARVIS TOOLS
   Everything Jarvis can do is a tool with a schema, so every provider —
   Claude, Gemini, Groq, OpenRouter — drives the app through one contract
   instead of a hand-parsed JSON block that half of them get wrong.
   Each tool returns a short receipt string: what changed, in plain words.
   ════════════════════════════════════════════════════════════════════ */

export interface ToolDef {
  name: string
  description: string
  /** JSON Schema (draft subset every provider accepts) */
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  run: (args: Record<string, unknown>) => string | Promise<string>
  /** true when the tool changes state — drives the receipts trail in the UI */
  mutates: boolean
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : v == null ? fallback : String(v))
const numOf = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return isNaN(n) ? fallback : n
}
const boolOf = (v: unknown): boolean => v === true || v === 'true'

/** Forgiving lookup: exact → prefix → substring → word overlap. */
export function findBy<T>(list: T[], q: string, get: (x: T) => string): T | undefined {
  const needle = q.trim().toLowerCase()
  if (!needle) return undefined
  const norm = list.map((x) => ({ x, k: get(x).toLowerCase() }))
  return (
    norm.find((e) => e.k === needle)?.x ??
    norm.find((e) => e.k.startsWith(needle))?.x ??
    norm.find((e) => e.k.includes(needle) || needle.includes(e.k))?.x ??
    norm.find((e) => {
      const words = needle.split(/\s+/).filter((w) => w.length > 2)
      return words.length > 0 && words.every((w) => e.k.includes(w))
    })?.x
  )
}

const S = () => useStore.getState()

const enumProp = (values: string[], description: string) => ({ type: 'string', enum: values, description })
const strProp = (description: string) => ({ type: 'string', description })
const numProp = (description: string) => ({ type: 'number', description })
const boolProp = (description: string) => ({ type: 'boolean', description })

// ─────────────────────────────────────────────────────────────
// SNAPSHOTS — how Jarvis reads state without guessing
// ─────────────────────────────────────────────────────────────

const AREAS = [
  'today',
  'training',
  'golf',
  'nutrition',
  'recovery',
  'goals',
  'business',
  'books',
  'notes',
  'schedule',
  'habits',
  'sections',
  'memory',
  'all',
] as const

function snapshot(area: string): string {
  const s = S()
  const date = todayISO()
  const wd = weekdayOf()
  const parts: string[] = []
  const want = (a: string) => area === 'all' || area === a

  if (want('today')) {
    const score = dayScore(s)
    const m = macrosForDate(s, date)
    parts.push(
      `TODAY ${date} (${WEEKDAY_NAMES[wd]}) — ${score.done}/${score.total} habits banked (${score.pct}%).\n` +
        `Fuel: ${m.kcal} kcal, ${m.protein}g protein, ${m.carbs}g carbs, ${m.fat}g fat, ${(m.water / 1000).toFixed(1)}L water.\n` +
        `Targets: ${s.macros.kcal[0]}-${s.macros.kcal[1]} kcal, ${s.macros.protein[0]}-${s.macros.protein[1]}g protein, ${s.macros.waterMl / 1000}L water.`,
    )
    const blocks = s.schedule.filter((b) => b.weekday === wd).sort((a, b) => a.start.localeCompare(b.start))
    parts.push(
      `SCHEDULE TODAY:\n${blocks
        .map((b) => `  ${b.start}${b.end ? `-${b.end}` : ''} ${b.title}${s.dayChecks[date]?.[b.id] ? ' [done]' : ''}`)
        .join('\n')}`,
    )
  }

  if (want('training')) {
    const wk = workoutsThisWeek(s)
    parts.push(
      `TRAINING — ${wk.done}/${wk.planned} sessions this week.\nSPLIT:\n${s.workouts
        .map(
          (w) =>
            `  [${w.id}] ${WEEKDAY_NAMES[w.weekday]} · ${w.name}: ${
              w.exercises.map((e) => `${e.name} ${e.sets}x${e.reps}`).join(', ') || 'no exercises'
            }`,
        )
        .join('\n')}`,
    )
    if (s.runLogs.length) parts.push(`RECENT RUNS: ${s.runLogs.slice(0, 5).map((r) => `${r.date} ${r.minutes}min`).join(', ')}`)
  }

  if (want('golf')) {
    const week = golfMinutes(s, weekDates())
    const g = s.golfStats
    const hcp = [...s.handicap].sort((a, b) => (a.date < b.date ? -1 : 1)).pop()
    parts.push(
      `GOLF — handicap ${hcp?.value ?? '?'}. Fairways ${g.fairwaysPct}%, GIR ${g.girPct}%, scramble ${g.scramblePct}%, ${g.lostBallsPerRound} lost balls/round, avg ${g.avgScore}.\n` +
        `Focus: ${g.focus}\nThis week: ${Object.entries(week)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k} ${v}min`)
          .join(', ') || 'nothing logged'}\n` +
        `Categories: ${s.golfCategories.map((c) => `${c.label} (id ${c.id})`).join(', ')}`,
    )
  }

  if (want('nutrition')) {
    parts.push(
      `FOOD LOGGED TODAY: ${
        s.foodLogs.filter((f) => f.date === date).map((f) => `${f.name} ${f.kcal}kcal/${f.protein}p`).join(' | ') || 'nothing'
      }\nMEAL LIBRARY: ${s.meals.map((m) => `${m.name} (${m.window})`).join(', ')}`,
    )
  }

  if (want('recovery')) {
    const taken = s.supLog[date] ?? {}
    parts.push(
      `SUPPLEMENTS: ${s.supplements.map((x) => `${x.name}${taken[x.id] ? ' [taken]' : ''}`).join(', ')}\n` +
        `Last check-in: ${s.checkIns[date] ? `sleep ${s.checkIns[date].sleepH}h, weight ${s.checkIns[date].weightKg}kg` : 'not logged today'}`,
    )
  }

  if (want('goals')) {
    parts.push(
      `GOALS:\n${s.goals
        .map(
          (g) =>
            `  ${g.title} — ${g.target}${g.deadline ? ` (by ${g.deadline})` : ''}; milestones: ${
              g.milestones.map((m) => `${m.title}${m.done ? '✓' : ''}`).join(', ') || 'none'
            }`,
        )
        .join('\n')}`,
    )
  }

  if (want('business')) {
    parts.push(
      `AURORA — $${revenueToday(s).toFixed(0)} today of $${s.revenueTarget} target.\nOPEN TASKS: ${
        s.bizTasks.filter((t) => !t.done).map((t) => t.title).join(' | ') || 'none'
      }\nAREAS: ${s.bizAreas.map((a) => a.label).join(', ')}`,
    )
  }

  if (want('books')) {
    parts.push(`BOOKS: ${s.books.map((b) => `${b.title} (${b.status}, p${b.currentPage}/${b.totalPages})`).join(' | ')}`)
  }

  if (want('notes')) {
    parts.push(
      `NOTES: ${s.notes.map((n) => n.title).join(' | ') || 'none'}\nTABLES: ${s.tables.map((t) => t.name).join(' | ') || 'none'}`,
    )
  }

  if (want('schedule')) {
    parts.push(
      `FULL WEEK:\n${WEEKDAY_NAMES.map(
        (name, i) =>
          `  ${name}: ${s.schedule
            .filter((b) => b.weekday === i)
            .sort((a, b) => a.start.localeCompare(b.start))
            .map((b) => `${b.start} ${b.title}`)
            .join(' · ') || '—'}`,
      ).join('\n')}`,
    )
  }

  if (want('habits')) {
    parts.push(
      `HABITS:\n${s.habits
        .filter((h) => !h.archived)
        .map(
          (h) =>
            `  [${h.id}] ${h.label} — ${habitValue(s, date, h)}/${h.target}${h.unit} today, ${habitStreak(s, h)}d streak`,
        )
        .join('\n')}\nREMINDERS: ${s.reminders.map((r) => `${r.time} ${r.label}${r.enabled ? '' : ' (off)'}`).join(', ')}`,
    )
  }

  if (want('sections')) {
    parts.push(
      `SECTIONS (navigation is editable data):\n${s.groups
        .sort((a, b) => a.order - b.order)
        .map(
          (g) =>
            `  ${g.label} [id ${g.id}]: ${s.sections
              .filter((x) => x.group === g.id)
              .sort((a, b) => a.order - b.order)
              .map((x) => `${x.label} [id ${x.id}, module ${x.module}${x.hidden ? ', hidden' : ''}${x.bar ? ', in mobile bar' : ''}]`)
              .join(', ')}`,
        )
        .join('\n')}`,
    )
  }

  if (want('memory')) {
    parts.push(
      `MEMORY FACTS:\n${s.profile.facts.map((f) => `  [${f.id}] (${f.category}/${f.importance}) ${f.text}`).join('\n')}\n` +
        `KNOWLEDGE DOCS: ${s.knowledgeDocs.map((k) => `${k.title}${k.pinned ? ' [pinned]' : ''}`).join(' | ') || 'none'}`,
    )
  }

  return parts.join('\n\n') || 'No data for that area.'
}

// ─────────────────────────────────────────────────────────────
// THE REGISTRY
// ─────────────────────────────────────────────────────────────

export const TOOLS: ToolDef[] = [
  {
    name: 'search_web',
    description:
      'Search the live web for current facts: news, prices, releases, branded nutrition, courses, anything after your training data. Returns sourced results — cite them, and if it returns nothing, say so instead of guessing.',
    mutates: false,
    parameters: {
      type: 'object',
      properties: { query: strProp('What to search for, as a natural question or phrase.') },
      required: ['query'],
    },
    run: async (a) => formatResults(await webSearch(str(a.query), 6)),
  },

  {
    name: 'get_snapshot',
    description:
      "Read the current state of an area of Tom's system before answering or editing. Always read before you restructure something.",
    mutates: false,
    parameters: {
      type: 'object',
      properties: { area: enumProp([...AREAS], 'Which area to read.') },
      required: ['area'],
    },
    run: (a) => snapshot(str(a.area, 'today')),
  },

  {
    name: 'lookup_food',
    description:
      'Look a food up in real nutrition databases — a curated table of staples, USDA FoodData Central for generic whole foods, and Open Food Facts for branded and European products. ALWAYS call this before logging food you do not have explicit numbers for. Pass grams to get the portion computed for you instead of doing arithmetic in your head. Results are per 100 g and carry their source; cite the source when you report them.',
    mutates: false,
    parameters: {
      type: 'object',
      properties: {
        name: strProp('What to look up. Include the brand if there is one — "Pilos skyr", "Vilgain protein bar", "chicken breast".'),
        grams: numProp('Portion size in grams. When given, each candidate is also scaled to this portion.'),
      },
      required: ['name'],
    },
    run: async (a) => {
      const grams = a.grams != null ? numOf(a.grams) : undefined
      const matches = await findFood(str(a.name), S().settings.usdaKey ?? '')
      return formatMatches(matches, grams && grams > 0 ? grams : undefined)
    },
  },

  // ── logging ──
  {
    name: 'log_metric',
    description: 'Log a single numeric metric for a date (defaults to today).',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        metric: enumProp(
          ['water_ml', 'weight_kg', 'sleep_h', 'reading_min', 'revenue', 'handicap', 'blackout'],
          'Which metric.',
        ),
        value: numProp('The value. water_ml accepts negatives to correct an over-log.'),
        absolute: boolProp('For water_ml only: true overwrites the day total instead of adding.'),
        note: strProp('Optional source/notes, e.g. the revenue source.'),
      },
      required: ['metric', 'value'],
    },
    run: (a) => {
      const s = S()
      const date = todayISO()
      const v = numOf(a.value)
      switch (str(a.metric)) {
        case 'water_ml':
          if (boolOf(a.absolute)) {
            s.setWater(date, v)
            return `Water set to ${(Math.max(0, v) / 1000).toFixed(1)}L today.`
          }
          s.addWater(date, v)
          return `Water ${v >= 0 ? '+' : ''}${Math.round(v)}ml → ${((useStore.getState().water[date] ?? 0) / 1000).toFixed(1)}L.`
        case 'weight_kg': {
          const prev = s.checkIns[date]
          s.saveCheckIn({
            date,
            weightKg: v,
            sleepH: prev?.sleepH ?? null,
            sleepQuality: prev?.sleepQuality ?? null,
            energy: prev?.energy ?? null,
            blackoutOnTime: prev?.blackoutOnTime ?? null,
            notes: prev?.notes ?? '',
          })
          return `Weight logged: ${v} kg.`
        }
        case 'sleep_h': {
          const prev = s.checkIns[date]
          s.saveCheckIn({
            date,
            weightKg: prev?.weightKg ?? null,
            sleepH: v,
            sleepQuality: prev?.sleepQuality ?? null,
            energy: prev?.energy ?? null,
            blackoutOnTime: prev?.blackoutOnTime ?? null,
            notes: prev?.notes ?? '',
          })
          return `Sleep logged: ${v}h.`
        }
        case 'blackout': {
          const prev = s.checkIns[date]
          s.saveCheckIn({
            date,
            weightKg: prev?.weightKg ?? null,
            sleepH: prev?.sleepH ?? null,
            sleepQuality: prev?.sleepQuality ?? null,
            energy: prev?.energy ?? null,
            blackoutOnTime: v !== 0,
            notes: prev?.notes ?? '',
          })
          return `Blackout marked ${v !== 0 ? 'hit' : 'missed'}.`
        }
        case 'reading_min':
          s.logReading(date, Math.round(v))
          return `Reading +${Math.round(v)} min.`
        case 'revenue':
          s.addRevenue({ date, amount: v, source: str(a.note, 'store') })
          return `Revenue $${v} logged. Today: $${revenueToday(useStore.getState()).toFixed(0)}.`
        case 'handicap':
          s.addHandicap(v)
          return `Handicap updated to ${v}.`
        default:
          return 'Unknown metric.'
      }
    },
  },

  {
    name: 'log_food',
    description:
      'Log a food entry. Use lookup_food first; if the item is unknown, estimate and set estimated=true so the reply can say so.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        name: strProp('What was eaten.'),
        kcal: numProp('Calories.'),
        protein: numProp('Protein grams.'),
        carbs: numProp('Carb grams.'),
        fat: numProp('Fat grams.'),
        estimated: boolProp('True when the numbers are your estimate rather than a label or the local database.'),
      },
      required: ['name', 'kcal'],
    },
    run: (a) => {
      const s = S()
      s.addFood({
        date: todayISO(),
        name: str(a.name),
        kcal: Math.round(numOf(a.kcal)),
        protein: Math.round(numOf(a.protein)),
        carbs: Math.round(numOf(a.carbs)),
        fat: Math.round(numOf(a.fat)),
      })
      const m = macrosForDate(useStore.getState(), todayISO())
      return `Logged ${str(a.name)} — ${Math.round(numOf(a.kcal))} kcal${boolOf(a.estimated) ? ' (estimate)' : ''}. Day total ${m.kcal} kcal / ${m.protein}g protein.`
    },
  },

  {
    name: 'log_session',
    description: 'Log a golf practice session or a run.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        kind: enumProp(['golf', 'run'], 'Session type.'),
        category: strProp('For golf: the practice category id or label (putting, chipping, long-game, drills, simulator, on-course).'),
        minutes: numProp('Duration in minutes.'),
        distanceKm: numProp('For runs: distance in km.'),
        avgHr: numProp('For runs: average heart rate.'),
        notes: strProp('Optional notes.'),
      },
      required: ['kind', 'minutes'],
    },
    run: (a) => {
      const s = S()
      const minutes = Math.round(numOf(a.minutes))
      if (minutes <= 0) return 'Minutes must be positive.'
      if (str(a.kind) === 'run') {
        s.addRun({
          date: todayISO(),
          minutes,
          distanceKm: a.distanceKm != null ? numOf(a.distanceKm) : null,
          avgHr: a.avgHr != null ? Math.round(numOf(a.avgHr)) : null,
          notes: str(a.notes),
        })
        return `Run logged: ${minutes} min${a.distanceKm ? `, ${numOf(a.distanceKm)} km` : ''}.`
      }
      const cat = findBy(s.golfCategories, str(a.category, 'putting'), (c) => `${c.id} ${c.label}`) ?? s.golfCategories[0]
      s.addGolfSession({ date: todayISO(), category: cat.id, minutes, notes: str(a.notes) })
      return `Logged ${minutes} min of ${cat.label}.`
    },
  },

  {
    name: 'delete_entry',
    description: "Remove a logged entry Tom got wrong. Without a match, removes today's most recent of that kind.",
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        kind: enumProp(['food', 'golf', 'run', 'revenue', 'handicap'], 'What to remove.'),
        match: strProp('Name fragment identifying the entry.'),
      },
      required: ['kind'],
    },
    run: (a) => {
      const s = S()
      const date = todayISO()
      const kind = str(a.kind)
      const q = str(a.match)
      if (kind === 'food') {
        const todays = s.foodLogs.filter((f) => f.date === date)
        const hit = q ? findBy(todays, q, (f) => f.name) : todays[0]
        if (!hit) return 'No matching food entry today.'
        s.removeFood(hit.id)
        return `Removed food log: ${hit.name}.`
      }
      if (kind === 'golf') {
        const hit = s.golfSessions.find((g) => g.date === date)
        if (!hit) return 'No golf session logged today.'
        s.removeGolfSession(hit.id)
        return `Removed golf session: ${hit.minutes} min.`
      }
      if (kind === 'run') {
        const hit = s.runLogs.find((r) => r.date === date)
        if (!hit) return 'No run logged today.'
        s.removeRun(hit.id)
        return `Removed run: ${hit.minutes} min.`
      }
      if (kind === 'revenue') {
        const hit = s.revenue.find((r) => r.date === date)
        if (!hit) return 'No revenue logged today.'
        s.removeRevenue(hit.id)
        return `Removed revenue: $${hit.amount}.`
      }
      const last = [...s.handicap].pop()
      if (!last) return 'No handicap entries.'
      s.removeHandicap(last.id)
      return `Removed handicap entry ${last.value}.`
    },
  },

  {
    name: 'edit_food',
    description: "Correct a food entry logged today — rename it or fix its macros.",
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        match: strProp('Fragment of the entry name to fix.'),
        name: strProp('New name.'),
        kcal: numProp('New calories.'),
        protein: numProp('New protein grams.'),
        carbs: numProp('New carb grams.'),
        fat: numProp('New fat grams.'),
      },
      required: ['match'],
    },
    run: (a) => {
      const s = S()
      const todays = s.foodLogs.filter((f) => f.date === todayISO())
      const hit = findBy(todays, str(a.match), (f) => f.name)
      if (!hit) return 'No matching entry today.'
      s.updateFood(hit.id, {
        ...(a.name != null ? { name: str(a.name) } : {}),
        ...(a.kcal != null ? { kcal: Math.round(numOf(a.kcal)) } : {}),
        ...(a.protein != null ? { protein: Math.round(numOf(a.protein)) } : {}),
        ...(a.carbs != null ? { carbs: Math.round(numOf(a.carbs)) } : {}),
        ...(a.fat != null ? { fat: Math.round(numOf(a.fat)) } : {}),
      })
      return `Corrected ${str(a.name, hit.name)}.`
    },
  },

  {
    name: 'complete',
    description: 'Tick something off: a schedule block, the day\'s workout, a task, a milestone, a habit, a grocery item, a supplement.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        kind: enumProp(['block', 'workout', 'task', 'milestone', 'habit', 'grocery', 'supplement'], 'What kind of thing.'),
        match: strProp('Name fragment. For a milestone, the milestone title.'),
        goal: strProp('For milestones: which goal it belongs to.'),
        undo: boolProp('Set true to un-complete it instead.'),
      },
      required: ['kind'],
    },
    run: (a) => {
      const s = S()
      const date = todayISO()
      const q = str(a.match)
      const undo = boolOf(a.undo)
      switch (str(a.kind)) {
        case 'block': {
          const blocks = s.schedule.filter((b) => b.weekday === weekdayOf())
          const hit = findBy(blocks, q, (b) => b.title)
          if (!hit) return `No block today matching "${q}".`
          const isDone = !!s.dayChecks[date]?.[hit.id]
          if (isDone === !undo) return `"${hit.title}" was already ${isDone ? 'done' : 'open'}.`
          s.toggleBlock(date, hit.id)
          return `${undo ? 'Reopened' : 'Checked off'}: ${hit.title}.`
        }
        case 'workout': {
          const w = q ? findBy(s.workouts, q, (x) => x.name) : s.workouts.find((x) => x.weekday === weekdayOf())
          if (!w) return 'No workout matched.'
          s.setWorkoutDone(date, w.id, !undo)
          return `${w.name} marked ${undo ? 'incomplete' : 'complete'}.`
        }
        case 'task': {
          const hit = findBy(s.bizTasks, q, (t) => t.title)
          if (!hit) return `No task matching "${q}".`
          if (hit.done === !undo) return `"${hit.title}" already ${hit.done ? 'done' : 'open'}.`
          s.toggleBizTask(hit.id)
          return `Task ${undo ? 'reopened' : 'done'}: ${hit.title}.`
        }
        case 'milestone': {
          const g = findBy(s.goals, str(a.goal), (x) => x.title) ?? s.goals.find((x) => x.milestones.some((m) => m.title.toLowerCase().includes(q.toLowerCase())))
          const ms = g && findBy(g.milestones, q, (m) => m.title)
          if (!g || !ms) return 'No matching milestone.'
          s.toggleMilestone(g.id, ms.id)
          return `Milestone ${ms.done ? 'reopened' : 'completed'}: ${ms.title}.`
        }
        case 'habit': {
          const h = findBy(s.habits, q, (x) => `${x.id} ${x.label}`)
          if (!h) return `No habit matching "${q}".`
          s.setHabit(date, h.id, undo ? 0 : h.target || 1)
          return `${h.label} marked ${undo ? 'not done' : 'done'}.`
        }
        case 'grocery': {
          const hit = findBy(s.grocery, q, (g) => g.name)
          if (!hit) return `Nothing on the list matching "${q}".`
          s.toggleGrocery(hit.id)
          return `${hit.done ? 'Unchecked' : 'Checked off'}: ${hit.name}.`
        }
        default: {
          const sup = findBy(s.supplements, q, (x) => x.name)
          if (!sup) return `No supplement matching "${q}".`
          s.toggleSupplement(date, sup.id)
          return `${sup.name}: ${useStore.getState().supLog[date]?.[sup.id] ? 'taken' : 'unmarked'}.`
        }
      }
    },
  },
]

const OP = enumProp(['add', 'update', 'remove', 'move'], 'What to do.')

TOOLS.push(
  {
    name: 'manage_workout',
    description:
      'Restructure the training split: create, rename, move to another weekday, or delete a whole workout. Creating one can include all its exercises in a single call.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        op: OP,
        workout: strProp('For update/remove/move: the workout name to match.'),
        name: strProp('New or created workout name.'),
        weekday: numProp('0=Monday … 6=Sunday.'),
        exercises: {
          type: 'array',
          description: 'For add: the exercises to create with it.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              sets: { type: 'number' },
              reps: { type: 'string' },
              cue: { type: 'string' },
            },
            required: ['name'],
          },
        },
      },
      required: ['op'],
    },
    run: (a) => {
      const s = S()
      const op = str(a.op)
      if (op === 'add') {
        const list = Array.isArray(a.exercises) ? (a.exercises as Record<string, unknown>[]) : []
        s.addWorkout({
          name: str(a.name, 'New workout'),
          weekday: (numOf(a.weekday, weekdayOf()) as Weekday),
          exercises: list.map((e) => ({
            name: str(e.name),
            sets: Math.max(1, Math.round(numOf(e.sets, 3))),
            reps: str(e.reps, '8-12'),
            cue: str(e.cue),
          })),
        })
        return `Created workout "${str(a.name, 'New workout')}" on ${WEEKDAY_NAMES[numOf(a.weekday, weekdayOf())]} with ${list.length} exercises.`
      }
      const w = findBy(s.workouts, str(a.workout), (x) => x.name)
      if (!w) return `No workout matching "${str(a.workout)}".`
      if (op === 'remove') {
        s.removeWorkout(w.id)
        return `Removed workout: ${w.name}.`
      }
      if (op === 'move') {
        s.updateWorkout(w.id, { weekday: numOf(a.weekday, w.weekday) as Weekday })
        return `Moved ${w.name} to ${WEEKDAY_NAMES[numOf(a.weekday, w.weekday)]}.`
      }
      s.updateWorkout(w.id, {
        ...(a.name != null ? { name: str(a.name) } : {}),
        ...(a.weekday != null ? { weekday: numOf(a.weekday) as Weekday } : {}),
      })
      return `Updated workout: ${str(a.name, w.name)}.`
    },
  },

  {
    name: 'manage_exercise',
    description: 'Add, edit, reorder or remove an exercise inside a workout. Use this for "change bench to 4x12" style edits.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        op: OP,
        workout: strProp('Workout name fragment.'),
        exercise: strProp('For update/remove/move: existing exercise name fragment.'),
        name: strProp('New or created exercise name.'),
        sets: numProp('Number of working sets.'),
        reps: strProp('Rep range, e.g. "8-10".'),
        cue: strProp('Coaching cue.'),
        direction: numProp('For move: -1 up, 1 down.'),
      },
      required: ['op', 'workout'],
    },
    run: (a) => {
      const s = S()
      const w = findBy(s.workouts, str(a.workout), (x) => x.name)
      if (!w) return `No workout matching "${str(a.workout)}".`
      const op = str(a.op)
      if (op === 'add') {
        s.addExercise(w.id, {
          name: str(a.name),
          sets: Math.max(1, Math.round(numOf(a.sets, 3))),
          reps: str(a.reps, '8-12'),
          cue: str(a.cue),
        })
        return `Added ${str(a.name)} ${numOf(a.sets, 3)}×${str(a.reps, '8-12')} to ${w.name}.`
      }
      const ex = findBy(w.exercises, str(a.exercise), (e) => e.name)
      if (!ex) return `No exercise matching "${str(a.exercise)}" in ${w.name}.`
      if (op === 'remove') {
        s.removeExercise(w.id, ex.id)
        return `Removed ${ex.name} from ${w.name}.`
      }
      if (op === 'move') {
        s.moveExercise(w.id, ex.id, numOf(a.direction, -1) < 0 ? -1 : 1)
        return `Moved ${ex.name}.`
      }
      s.updateExercise(w.id, ex.id, {
        ...(a.name != null ? { name: str(a.name) } : {}),
        ...(a.sets != null ? { sets: Math.max(1, Math.round(numOf(a.sets))) } : {}),
        ...(a.reps != null ? { reps: str(a.reps) } : {}),
        ...(a.cue != null ? { cue: str(a.cue) } : {}),
      })
      return `${w.name}: ${str(a.name, ex.name)} → ${numOf(a.sets, ex.sets)}×${str(a.reps, ex.reps)}.`
    },
  },

  {
    name: 'manage_schedule',
    description: 'Add, move, edit or remove a block in the weekly blueprint.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        op: OP,
        title: strProp('Block title (to match, or to create).'),
        newTitle: strProp('Rename to this.'),
        start: strProp('Start time "HH:MM".'),
        end: strProp('End time "HH:MM".'),
        weekday: numProp('0=Monday … 6=Sunday. Defaults to today.'),
        detail: strProp('Sub-line detail.'),
        tag: strProp('Tag id or label (morning, gym, golf, business…).'),
      },
      required: ['op', 'title'],
    },
    run: (a) => {
      const s = S()
      const op = str(a.op)
      const wd = (a.weekday != null ? numOf(a.weekday) : weekdayOf()) as Weekday
      if (op === 'add') {
        const tag = findBy(s.blockTags, str(a.tag, 'study'), (t) => `${t.id} ${t.label}`) ?? s.blockTags[0]
        s.addBlock({
          weekday: wd,
          start: str(a.start, '09:00'),
          end: str(a.end),
          title: str(a.title),
          detail: str(a.detail),
          tag: tag.id,
        })
        return `Scheduled "${str(a.title)}" ${str(a.start, '09:00')} on ${WEEKDAY_NAMES[wd]}.`
      }
      const pool = s.schedule.filter((b) => (a.weekday != null ? b.weekday === wd : true))
      const hit = findBy(pool, str(a.title), (b) => b.title)
      if (!hit) return `No block matching "${str(a.title)}".`
      if (op === 'remove') {
        s.removeBlock(hit.id)
        return `Removed "${hit.title}" from ${WEEKDAY_NAMES[hit.weekday]}.`
      }
      const tag = a.tag != null ? findBy(s.blockTags, str(a.tag), (t) => `${t.id} ${t.label}`) : undefined
      s.updateBlock(hit.id, {
        ...(a.newTitle != null ? { title: str(a.newTitle) } : {}),
        ...(a.start != null ? { start: str(a.start) } : {}),
        ...(a.end != null ? { end: str(a.end) } : {}),
        ...(a.detail != null ? { detail: str(a.detail) } : {}),
        ...(a.weekday != null ? { weekday: wd } : {}),
        ...(tag ? { tag: tag.id } : {}),
      })
      return `Updated "${str(a.newTitle, hit.title)}".`
    },
  },

  {
    name: 'manage_goal',
    description: 'Create, edit or remove a strategic goal, or set its progress.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        op: OP,
        title: strProp('Goal title (to match, or to create).'),
        newTitle: strProp('Rename to this.'),
        target: strProp('The outcome in one line.'),
        deadline: strProp('ISO date yyyy-mm-dd.'),
        progress: numProp('0-100.'),
        pillar: enumProp(['physique', 'golf', 'business', 'recovery', 'custom'], 'Which pillar.'),
        notes: strProp('Longer notes.'),
      },
      required: ['op', 'title'],
    },
    run: (a) => {
      const s = S()
      const op = str(a.op)
      if (op === 'add') {
        s.addGoal({
          title: str(a.title),
          target: str(a.target),
          deadline: a.deadline ? str(a.deadline) : null,
          pillar: (str(a.pillar, 'custom') as 'custom'),
          notes: str(a.notes),
        })
        return `Goal added: ${str(a.title)}.`
      }
      const g = findBy(s.goals, str(a.title), (x) => x.title)
      if (!g) return `No goal matching "${str(a.title)}".`
      if (op === 'remove') {
        s.removeGoal(g.id)
        return `Goal removed: ${g.title}.`
      }
      s.updateGoal(g.id, {
        ...(a.newTitle != null ? { title: str(a.newTitle) } : {}),
        ...(a.target != null ? { target: str(a.target) } : {}),
        ...(a.deadline != null ? { deadline: str(a.deadline) || null } : {}),
        ...(a.progress != null ? { progress: Math.max(0, Math.min(100, numOf(a.progress))) } : {}),
        ...(a.notes != null ? { notes: str(a.notes) } : {}),
      })
      return `Updated goal: ${str(a.newTitle, g.title)}.`
    },
  },

  {
    name: 'manage_milestone',
    description: 'Add, rename or remove a milestone under a goal.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        op: enumProp(['add', 'update', 'remove'], 'What to do.'),
        goal: strProp('Goal title fragment.'),
        title: strProp('Milestone title (to match, or to create).'),
        newTitle: strProp('Rename to this.'),
      },
      required: ['op', 'goal', 'title'],
    },
    run: (a) => {
      const s = S()
      const g = findBy(s.goals, str(a.goal), (x) => x.title)
      if (!g) return `No goal matching "${str(a.goal)}".`
      const op = str(a.op)
      if (op === 'add') {
        s.addMilestone(g.id, str(a.title))
        return `Milestone added to ${g.title}: ${str(a.title)}.`
      }
      const ms = findBy(g.milestones, str(a.title), (m) => m.title)
      if (!ms) return `No milestone matching "${str(a.title)}".`
      if (op === 'remove') {
        s.removeMilestone(g.id, ms.id)
        return `Removed milestone: ${ms.title}.`
      }
      s.updateMilestone(g.id, ms.id, str(a.newTitle, ms.title))
      return `Renamed milestone to ${str(a.newTitle, ms.title)}.`
    },
  },

  {
    name: 'manage_list',
    description:
      'Add, edit or remove an item in any of the simple lists: grocery, aurora tasks, books, mantras, supplements, watchlist, meals.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        list: enumProp(['grocery', 'task', 'book', 'mantra', 'supplement', 'watch', 'meal'], 'Which list.'),
        op: enumProp(['add', 'update', 'remove'], 'What to do.'),
        name: strProp('Item name / title / text (to match, or to create).'),
        newName: strProp('Rename to this.'),
        detail: strProp('Secondary field: quantity, author, dose, meal description, ticker name.'),
        extra: strProp('Third field: task area, supplement timing, meal window, watch kind (crypto|stock).'),
      },
      required: ['list', 'op', 'name'],
    },
    run: (a) => {
      const s = S()
      const op = str(a.op)
      const name = str(a.name)
      const detail = str(a.detail)
      const extra = str(a.extra)
      switch (str(a.list)) {
        case 'grocery': {
          if (op === 'add') {
            s.addGrocery(name, detail)
            return `On the list: ${name}${detail ? ` (${detail})` : ''}.`
          }
          const hit = findBy(s.grocery, name, (g) => g.name)
          if (!hit) return `Nothing matching "${name}".`
          if (op === 'remove') {
            s.removeGrocery(hit.id)
            return `Removed ${hit.name} from the list.`
          }
          s.updateGrocery(hit.id, { name: str(a.newName, hit.name), qty: detail || hit.qty })
          return `Updated ${str(a.newName, hit.name)}.`
        }
        case 'task': {
          if (op === 'add') {
            const area = findBy(s.bizAreas, extra, (x) => `${x.id} ${x.label}`)
            s.addBizTask(name, area?.id)
            return `Aurora task queued: ${name}.`
          }
          const hit = findBy(s.bizTasks, name, (t) => t.title)
          if (!hit) return `No task matching "${name}".`
          if (op === 'remove') {
            s.removeBizTask(hit.id)
            return `Removed task: ${hit.title}.`
          }
          const area = extra ? findBy(s.bizAreas, extra, (x) => `${x.id} ${x.label}`) : undefined
          s.updateBizTask(hit.id, { title: str(a.newName, hit.title), ...(area ? { area: area.id } : {}) })
          return `Updated task: ${str(a.newName, hit.title)}.`
        }
        case 'book': {
          if (op === 'add') {
            s.addBook({ title: name, author: detail, status: (extra as 'reading') || 'queued' })
            return `Added to the library: ${name}.`
          }
          const hit = findBy(s.books, name, (b) => b.title)
          if (!hit) return `No book matching "${name}".`
          if (op === 'remove') {
            s.removeBook(hit.id)
            return `Removed ${hit.title}.`
          }
          s.updateBook(hit.id, {
            title: str(a.newName, hit.title),
            ...(detail ? { author: detail } : {}),
            ...(extra === 'reading' || extra === 'queued' || extra === 'finished' ? { status: extra } : {}),
          })
          return `Updated ${str(a.newName, hit.title)}.`
        }
        case 'mantra': {
          if (op === 'add') {
            s.addMantra(name, detail, extra || 'custom')
            return 'Added to the mindset library.'
          }
          const hit = findBy(s.mantras, name, (m) => m.text)
          if (!hit) return `No principle matching "${name}".`
          if (op === 'remove') {
            s.removeMantra(hit.id)
            return 'Removed from the mindset library.'
          }
          s.updateMantra(hit.id, { text: str(a.newName, hit.text), ...(detail ? { author: detail } : {}) })
          return 'Principle updated.'
        }
        case 'supplement': {
          if (op === 'add') {
            s.addSupplement(name, detail, extra)
            return `Added to the stack: ${name}.`
          }
          const hit = findBy(s.supplements, name, (x) => x.name)
          if (!hit) return `No supplement matching "${name}".`
          if (op === 'remove') {
            s.removeSupplement(hit.id)
            return `Removed ${hit.name} from the stack.`
          }
          s.updateSupplement(hit.id, {
            name: str(a.newName, hit.name),
            ...(detail ? { dose: detail } : {}),
            ...(extra ? { timing: extra } : {}),
          })
          return `Updated ${str(a.newName, hit.name)}.`
        }
        case 'watch': {
          if (op === 'add') {
            s.addWatch({ kind: extra === 'stock' ? 'stock' : 'crypto', symbol: name.toUpperCase(), name: detail || name.toUpperCase() })
            return `Watching ${name.toUpperCase()}.`
          }
          const hit = findBy(s.watchlist, name, (w) => `${w.symbol} ${w.name}`)
          if (!hit) return `Not on the watchlist: "${name}".`
          s.removeWatch(hit.id)
          return `Removed ${hit.symbol} from the watchlist.`
        }
        default: {
          if (op === 'add') {
            const win = findBy(s.mealWindows, extra, (w) => `${w.id} ${w.label}`) ?? s.mealWindows[0]
            s.addMeal({ window: win.id, name, detail })
            return `Added meal option: ${name} (${win.label}).`
          }
          const hit = findBy(s.meals, name, (m) => m.name)
          if (!hit) return `No meal matching "${name}".`
          if (op === 'remove') {
            s.removeMeal(hit.id)
            return `Removed meal option: ${hit.name}.`
          }
          const win = extra ? findBy(s.mealWindows, extra, (w) => `${w.id} ${w.label}`) : undefined
          s.updateMeal(hit.id, { name: str(a.newName, hit.name), ...(detail ? { detail } : {}), ...(win ? { window: win.id } : {}) })
          return `Updated meal option: ${str(a.newName, hit.name)}.`
        }
      }
    },
  },

  {
    name: 'manage_note',
    description: 'Create, rewrite, append to, or delete a note. Appending is the right call for adding lines to a list note.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        op: enumProp(['add', 'update', 'append', 'remove'], 'What to do.'),
        title: strProp('Note title (to match, or to create).'),
        body: strProp('Full body for add/update, or the lines to append.'),
        newTitle: strProp('Rename to this.'),
      },
      required: ['op', 'title'],
    },
    run: (a) => {
      const s = S()
      const op = str(a.op)
      if (op === 'add') {
        s.addNote(str(a.title), str(a.body))
        return `Note created: "${str(a.title)}".`
      }
      const hit = findBy(s.notes, str(a.title), (n) => n.title)
      if (!hit) return `No note matching "${str(a.title)}".`
      if (op === 'remove') {
        s.removeNote(hit.id)
        return `Deleted note: "${hit.title}".`
      }
      if (op === 'append') {
        const add = str(a.body).trim()
        if (!add) return 'Nothing to append.'
        s.updateNote(hit.id, { body: hit.body ? `${hit.body}\n${add}` : add })
        return `Appended to "${hit.title}".`
      }
      s.updateNote(hit.id, { ...(a.body != null ? { body: str(a.body) } : {}), ...(a.newTitle != null ? { title: str(a.newTitle) } : {}) })
      return `Rewrote "${str(a.newTitle, hit.title)}".`
    },
  },
)

TOOLS.push(
  {
    name: 'manage_section',
    description:
      "Reshape the app itself: create a new section, rename one, move it to another group, hide it, pin it to the mobile bar, reorder it, or delete it. Section ids are stable — read get_snapshot('sections') first.",
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        op: enumProp(['add', 'update', 'remove', 'move'], 'What to do.'),
        section: strProp('Section id or current label to act on.'),
        label: strProp('New or created section name.'),
        group: strProp('Group id or label to place it in.'),
        icon: strProp('Glyph name: custom, today, goals, training, golf, nutrition, recovery, grocery, business, notes, books, mindset, markets, news, schedule, water, heart, spark, flag, compass, layers, bolt, wave, box, clock, star, flame, sun, key, timer.'),
        hidden: boolProp('Hide it from navigation without deleting its data.'),
        bar: boolProp('Pin it to the mobile bottom bar.'),
        direction: numProp('For move: -1 up, 1 down within its group.'),
      },
      required: ['op'],
    },
    run: (a) => {
      const s = S()
      const op = str(a.op)
      if (op === 'add') {
        const group = findBy(s.groups, str(a.group), (g) => `${g.id} ${g.label}`)
        const id = s.addSection({
          label: str(a.label, 'New section'),
          module: 'custom',
          icon: str(a.icon, 'custom'),
          group: group?.id,
          bar: boolOf(a.bar),
        })
        return `Created section "${str(a.label, 'New section')}" (id ${id}) in ${group?.label ?? s.groups[0]?.label}. It's an empty custom page — add blocks with manage_block.`
      }
      const sec = findBy(s.sections, str(a.section), (x) => `${x.id} ${x.label}`)
      if (!sec) return `No section matching "${str(a.section)}".`
      if (op === 'remove') {
        if (sec.module !== 'custom')
          return `"${sec.label}" is a built-in section — hide it instead of deleting, so its data survives. Call manage_section with op=update and hidden=true.`
        s.removeSection(sec.id)
        return `Deleted section "${sec.label}".`
      }
      if (op === 'move') {
        s.moveSection(sec.id, numOf(a.direction, -1) < 0 ? -1 : 1)
        return `Moved "${sec.label}".`
      }
      const group = a.group != null ? findBy(s.groups, str(a.group), (g) => `${g.id} ${g.label}`) : undefined
      s.updateSection(sec.id, {
        ...(a.label != null ? { label: str(a.label) } : {}),
        ...(group ? { group: group.id } : {}),
        ...(a.icon != null ? { icon: str(a.icon) } : {}),
        ...(a.hidden != null ? { hidden: boolOf(a.hidden) } : {}),
        ...(a.bar != null ? { bar: boolOf(a.bar) } : {}),
      })
      return `Updated section "${str(a.label, sec.label)}"${group ? ` → ${group.label}` : ''}${a.hidden != null ? (boolOf(a.hidden) ? ' (hidden)' : ' (visible)') : ''}.`
    },
  },

  {
    name: 'manage_group',
    description: 'Create, rename or remove a navigation group (the headings sections sit under).',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        op: enumProp(['add', 'update', 'remove'], 'What to do.'),
        group: strProp('Group id or label to act on.'),
        label: strProp('New or created group name.'),
      },
      required: ['op'],
    },
    run: (a) => {
      const s = S()
      const op = str(a.op)
      if (op === 'add') {
        s.addGroup(str(a.label, 'New group'))
        return `Created group "${str(a.label, 'New group')}".`
      }
      const g = findBy(s.groups, str(a.group), (x) => `${x.id} ${x.label}`)
      if (!g) return `No group matching "${str(a.group)}".`
      if (op === 'remove') {
        s.removeGroup(g.id)
        return `Removed group "${g.label}" — its sections moved to the first group.`
      }
      s.updateGroup(g.id, { label: str(a.label, g.label) })
      return `Renamed group to "${str(a.label, g.label)}".`
    },
  },

  {
    name: 'manage_block',
    description:
      'Build the contents of a custom section: add a checklist, counter, note, table or metric block; rename it; add checklist items; or remove it.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        op: enumProp(['add', 'update', 'remove', 'add_item'], 'What to do.'),
        section: strProp('Custom section id or label.'),
        block: strProp('For update/remove/add_item: the block title to match.'),
        kind: enumProp(['checklist', 'counter', 'note', 'table', 'metric'], 'For add: what type of block.'),
        title: strProp('Block title.'),
        body: strProp('For note blocks: the text. For add_item: the item text.'),
        unit: strProp('For counter/metric blocks: the unit.'),
        target: numProp('For counter blocks: the daily target.'),
      },
      required: ['op', 'section'],
    },
    run: (a) => {
      const s = S()
      const sec = findBy(s.sections, str(a.section), (x) => `${x.id} ${x.label}`)
      if (!sec) return `No section matching "${str(a.section)}".`
      if (sec.module !== 'custom') return `"${sec.label}" is a built-in section and doesn't take blocks.`
      const op = str(a.op)
      const blocks = s.customBlocks[sec.id] ?? []
      if (op === 'add') {
        const kind = (str(a.kind, 'checklist') as CustomBlock['kind'])
        s.addBlockTo(sec.id, kind, str(a.title) || undefined)
        return `Added a ${kind} block to ${sec.label}.`
      }
      const b = findBy(blocks, str(a.block), (x) => x.title)
      if (!b) return `No block matching "${str(a.block)}" in ${sec.label}.`
      if (op === 'remove') {
        s.removeCustomBlock(sec.id, b.id)
        return `Removed "${b.title}" from ${sec.label}.`
      }
      if (op === 'add_item') {
        if (b.kind !== 'checklist') return `"${b.title}" isn't a checklist.`
        s.updateCustomBlock(sec.id, b.id, {
          items: [...(b.items ?? []), { id: `it-${Date.now().toString(36)}`, text: str(a.body), done: false }],
        })
        return `Added "${str(a.body)}" to ${b.title}.`
      }
      s.updateCustomBlock(sec.id, b.id, {
        ...(a.title != null ? { title: str(a.title) } : {}),
        ...(a.body != null ? { body: str(a.body) } : {}),
        ...(a.unit != null ? { unit: str(a.unit) } : {}),
        ...(a.target != null ? { target: numOf(a.target) } : {}),
      })
      return `Updated "${str(a.title, b.title)}".`
    },
  },

  {
    name: 'manage_taxonomy',
    description:
      'Rename or extend the editable label sets: golf practice categories, schedule tags, Aurora areas, meal windows. Renaming never breaks historic logs.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        taxonomy: enumProp(['golfCategories', 'blockTags', 'bizAreas', 'mealWindows'], 'Which set.'),
        op: enumProp(['add', 'update', 'remove'], 'What to do.'),
        item: strProp('Existing id or label to act on.'),
        label: strProp('New or created label.'),
      },
      required: ['taxonomy', 'op'],
    },
    run: (a) => {
      const s = S()
      const key = str(a.taxonomy) as TaxonomyKey
      const list = s[key]
      const op = str(a.op)
      if (op === 'add') {
        s.addTaxon(key, str(a.label, 'New'))
        return `Added "${str(a.label, 'New')}".`
      }
      const t = findBy(list, str(a.item), (x) => `${x.id} ${x.label}`)
      if (!t) return `No entry matching "${str(a.item)}".`
      if (op === 'remove') {
        s.removeTaxon(key, t.id)
        return `Removed "${t.label}".`
      }
      s.renameTaxon(key, t.id, str(a.label, t.label))
      return `Renamed "${t.label}" → "${str(a.label, t.label)}".`
    },
  },

  {
    name: 'manage_habit',
    description: 'Create, edit or remove a tracked daily habit. Habits drive the streaks and the day score.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        op: enumProp(['add', 'update', 'remove'], 'What to do.'),
        habit: strProp('Habit id or label to act on.'),
        label: strProp('New or created habit name.'),
        kind: enumProp(['boolean', 'count'], 'boolean = done/not; count = accumulate to a target.'),
        target: numProp('Target value for count habits.'),
        unit: strProp('Unit for count habits, e.g. g, ml, min.'),
      },
      required: ['op'],
    },
    run: (a) => {
      const s = S()
      const op = str(a.op)
      if (op === 'add') {
        s.addHabit(str(a.label, 'New habit'), (str(a.kind, 'boolean') as 'boolean'), numOf(a.target, 1), str(a.unit))
        return `Tracking "${str(a.label, 'New habit')}".`
      }
      const h = findBy(s.habits, str(a.habit), (x) => `${x.id} ${x.label}`)
      if (!h) return `No habit matching "${str(a.habit)}".`
      if (op === 'remove') {
        s.removeHabit(h.id)
        return `Stopped tracking "${h.label}".`
      }
      s.updateHabit(h.id, {
        ...(a.label != null ? { label: str(a.label) } : {}),
        ...(a.kind != null ? { kind: str(a.kind) as 'boolean' } : {}),
        ...(a.target != null ? { target: numOf(a.target) } : {}),
        ...(a.unit != null ? { unit: str(a.unit) } : {}),
      })
      return `Updated habit "${str(a.label, h.label)}".`
    },
  },

  {
    name: 'manage_reminder',
    description: 'Create, edit, disable or remove a scheduled reminder.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        op: enumProp(['add', 'update', 'remove'], 'What to do.'),
        reminder: strProp('Reminder label to act on.'),
        label: strProp('New or created reminder name.'),
        time: strProp('Time "HH:MM".'),
        body: strProp('The message text.'),
        enabled: boolProp('Turn it on or off.'),
        days: { type: 'array', items: { type: 'number' }, description: 'Weekdays 0=Mon…6=Sun. Empty means every day.' },
      },
      required: ['op'],
    },
    run: (a) => {
      const s = S()
      const op = str(a.op)
      const days = Array.isArray(a.days) ? (a.days as number[]).map((d) => numOf(d) as Weekday) : undefined
      if (op === 'add') {
        s.addReminder({ label: str(a.label, 'Reminder'), time: str(a.time, '09:00'), body: str(a.body), days })
        return `Reminder set: "${str(a.label, 'Reminder')}" at ${str(a.time, '09:00')}.`
      }
      const r = findBy(s.reminders, str(a.reminder), (x) => x.label)
      if (!r) return `No reminder matching "${str(a.reminder)}".`
      if (op === 'remove') {
        s.removeReminder(r.id)
        return `Removed reminder "${r.label}".`
      }
      s.updateReminder(r.id, {
        ...(a.label != null ? { label: str(a.label) } : {}),
        ...(a.time != null ? { time: str(a.time) } : {}),
        ...(a.body != null ? { body: str(a.body) } : {}),
        ...(a.enabled != null ? { enabled: boolOf(a.enabled) } : {}),
        ...(days ? { days } : {}),
      })
      return `Updated reminder "${str(a.label, r.label)}".`
    },
  },

  {
    name: 'set_targets',
    description: 'Change the numbers the app measures against: macro bands, water, revenue target.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        kcalMin: numProp('Calorie floor.'),
        kcalMax: numProp('Calorie ceiling.'),
        proteinMin: numProp('Protein floor in grams.'),
        proteinMax: numProp('Protein ceiling in grams.'),
        carbsMin: numProp('Carb floor in grams.'),
        carbsMax: numProp('Carb ceiling in grams.'),
        fatMin: numProp('Fat floor in grams.'),
        fatMax: numProp('Fat ceiling in grams.'),
        waterMl: numProp('Daily water target in millilitres.'),
        revenueTarget: numProp('Daily Aurora revenue target in dollars.'),
      },
    },
    run: (a) => {
      const s = S()
      const m = s.macros
      const pair = (lo: unknown, hi: unknown, cur: [number, number]): [number, number] => [
        lo != null ? Math.round(numOf(lo)) : cur[0],
        hi != null ? Math.round(numOf(hi)) : cur[1],
      ]
      s.setMacros({
        kcal: pair(a.kcalMin, a.kcalMax, m.kcal),
        protein: pair(a.proteinMin, a.proteinMax, m.protein),
        carbs: pair(a.carbsMin, a.carbsMax, m.carbs),
        fat: pair(a.fatMin, a.fatMax, m.fat),
        waterMl: a.waterMl != null ? Math.round(numOf(a.waterMl)) : m.waterMl,
      })
      if (a.revenueTarget != null) s.setRevenueTarget(numOf(a.revenueTarget))
      const n = useStore.getState().macros
      return `Targets updated: ${n.kcal[0]}-${n.kcal[1]} kcal, ${n.protein[0]}-${n.protein[1]}g protein, ${n.waterMl / 1000}L water, $${useStore.getState().revenueTarget}/day.`
    },
  },

  {
    name: 'set_golf_stats',
    description: "Update the golf diagnostic — the strokes-gained truth Jarvis coaches from.",
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        fairwaysPct: numProp('Fairways hit %.'),
        girPct: numProp('Greens in regulation %.'),
        scramblePct: numProp('Scramble %.'),
        puttsPerRound: numProp('Putts per round.'),
        lostBallsPerRound: numProp('Lost balls per round.'),
        avgScore: numProp('Average score.'),
        focus: strProp('The current mental/technical focus, in one or two sentences.'),
      },
    },
    run: (a) => {
      const s = S()
      const patch: Record<string, number | string> = {}
      for (const k of ['fairwaysPct', 'girPct', 'scramblePct', 'puttsPerRound', 'lostBallsPerRound', 'avgScore'])
        if (a[k] != null) patch[k] = numOf(a[k])
      if (a.focus != null) patch.focus = str(a.focus)
      if (!Object.keys(patch).length) return 'Nothing to update.'
      patch.updated = todayISO()
      s.setGolfStats(patch)
      return `Golf diagnostic updated: ${Object.keys(patch).filter((k) => k !== 'updated').join(', ')}.`
    },
  },

  {
    name: 'remember',
    description:
      'Store a durable fact about Tom — a preference, a constraint, a decision, a plan. Use this whenever he tells you something that should outlive the conversation.',
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        fact: strProp('The fact, written as a standalone sentence.'),
        importance: numProp('1-10. Rules and non-negotiables score 8+.'),
      },
      required: ['fact'],
    },
    run: (a) => {
      const text = str(a.fact).trim()
      if (!text) return 'Nothing to remember.'
      S().addFact(text, inferCategory(text), a.importance != null ? Math.round(numOf(a.importance)) : inferImportance(text))
      return `Remembered: ${text}`
    },
  },

  {
    name: 'forget',
    description: 'Remove a stored memory fact that is wrong or out of date.',
    mutates: true,
    parameters: { type: 'object', properties: { match: strProp('Fragment of the fact to erase.') }, required: ['match'] },
    run: (a) => {
      const s = S()
      const hit = findBy(s.profile.facts, str(a.match), (f) => f.text)
      if (!hit) return `No stored fact matching "${str(a.match)}".`
      s.removeFact(hit.id)
      return `Forgotten: ${hit.text}`
    },
  },

  {
    name: 'manage_knowledge',
    description:
      "Manage Tom's reference library — long-form notes from his second brain that you read for context. Pinned docs are always in your context; the rest surface on keyword match.",
    mutates: true,
    parameters: {
      type: 'object',
      properties: {
        op: enumProp(['add', 'update', 'remove'], 'What to do.'),
        title: strProp('Document title.'),
        body: strProp('Document contents (markdown is fine).'),
        pinned: boolProp('Always include this in context.'),
      },
      required: ['op', 'title'],
    },
    run: (a) => {
      const s = S()
      const op = str(a.op)
      if (op === 'add') {
        s.addKnowledgeDoc(str(a.title), str(a.body), 'jarvis', boolOf(a.pinned))
        return `Filed "${str(a.title)}" into the reference library.`
      }
      const doc = findBy(s.knowledgeDocs, str(a.title), (k) => k.title)
      if (!doc) return `No document matching "${str(a.title)}".`
      if (op === 'remove') {
        s.removeKnowledgeDoc(doc.id)
        return `Removed "${doc.title}".`
      }
      s.updateKnowledgeDoc(doc.id, {
        ...(a.body != null ? { body: str(a.body) } : {}),
        ...(a.pinned != null ? { pinned: boolOf(a.pinned) } : {}),
      })
      return `Updated "${doc.title}".`
    },
  },

  {
    name: 'navigate',
    description: 'Open a section in the app for him.',
    mutates: true,
    parameters: { type: 'object', properties: { section: strProp('Section id or label.') }, required: ['section'] },
    run: (a) => {
      const s = S()
      const sec = findBy(
        s.sections.filter((x) => !x.hidden),
        str(a.section),
        (x) => `${x.id} ${x.label}`,
      )
      if (!sec) return `No section matching "${str(a.section)}".`
      s.setView(sec.id)
      return `Opened ${sec.label}.`
    },
  },
)

// ─────────────────────────────────────────────────────────────
// EXECUTION + PROVIDER SCHEMAS
// ─────────────────────────────────────────────────────────────

const byName = new Map(TOOLS.map((t) => [t.name, t]))

export function isMutating(name: string): boolean {
  return byName.get(name)?.mutates ?? false
}

/** Run a tool by name. Never throws — the model gets the error as an observation. */
export async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = byName.get(name)
  if (!tool) return `Unknown tool "${name}". Available: ${TOOLS.map((t) => t.name).join(', ')}.`
  try {
    return await tool.run(args ?? {})
  } catch (e) {
    return `Tool "${name}" failed: ${e instanceof Error ? e.message : 'unknown error'}`
  }
}

export function anthropicTools() {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }))
}

export function openAiTools() {
  return TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}

/** Gemini rejects unknown JSON-Schema keywords, so strip everything it doesn't take. */
function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema)
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (k === 'additionalProperties' || k === '$schema') continue
      out[k] = geminiSchema(v)
    }
    return out
  }
  return schema
}

export function geminiTools() {
  return [
    {
      functionDeclarations: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: geminiSchema(t.parameters),
      })),
    },
  ]
}

export function toolNames(): string[] {
  return TOOLS.map((t) => t.name)
}
