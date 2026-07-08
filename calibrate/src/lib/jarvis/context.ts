import { fmtHours, todayISO, WEEKDAY_NAMES, weekdayOf } from '../dates'
import { dayProgress, golfMinutes, golfTotalWeek, macrosForDate, revenueToday, streaks, weightSeries, workoutsThisWeek } from '../stats'
import { DAY_CODENAMES } from '../../store/seed'
import { useStore } from '../../store/store'
import { weekDates } from '../dates'
import { fullKnowledge } from './knowledge'
import { formatMemoriesForPrompt, retrieveRelevantMemories, touchMemories } from './memory'

/**
 * Unified context object that Jarvis always carries.
 * Built once per user query, injected into ALL processing paths (local + LLM).
 * This ensures consistent reasoning across the pipeline.
 *
 * CRITICAL: This is the single source of truth for Jarvis's knowledge state.
 * Every response path (local engine, LLM, voice) reads from this context.
 */
export interface JarvisContext {
  // User profile & persistent memory
  profile: string
  relevantMemory: string
  knowledge: string

  // Current live state
  snapshot: string

  // Settings & capabilities
  userName: string
  hasLlmBrain: boolean
  primaryProvider: 'anthropic' | 'gemini' | 'none'
}

/**
 * Build the user's persistent profile + key facts.
 * Used by both local engine and LLM.
 */
function buildProfile(): string {
  const s = useStore.getState()
  const p = s.profile
  const g = s.golfStats
  return [
    `IDENTITY: ${p.name}${p.age ? `, age ${p.age}` : ''}${p.location ? `, ${p.location}` : ''}. ${p.identity}`,
    `INSPIRATION: ${p.inspiration}`,
    `OPERATING PHILOSOPHY: ${p.philosophy}`,
    `GOLF SNAPSHOT: handicap-focus "${g.focus}" — fairways ${g.fairwaysPct}%, GIR ${g.girPct}%, scramble ${g.scramblePct}%, ~${g.lostBallsPerRound} lost balls/round, avg ${g.avgScore}.`,
    `KEY FACTS ABOUT ${p.name.toUpperCase()}:`,
    ...p.facts.map((f) => `  • ${f.text}`),
    s.mantras.length ? `MANTRAS HE LIVES BY: ${s.mantras.slice(0, 6).map((m) => `"${m.text}"`).join(' ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Semantic memory retrieval: rank stored facts by relevance to the current query.
 * Delegates scoring to memory.ts (token overlap + recency + importance + frequency)
 * and marks whatever surfaces as accessed, so useful memories keep resurfacing.
 */
function retrieveRelevantMemory(query: string): string {
  const relevant = retrieveRelevantMemories(query, 5)
  if (!relevant.length) return ''

  touchMemories(relevant.map((f) => f.id))
  return 'RELEVANT MEMORIES:\n' + formatMemoriesForPrompt(relevant)
}

/**
 * Build live snapshot of the entire app state — Jarvis's situational awareness.
 * Used by both local engine and LLM to understand current context.
 *
 * Includes:
 * - Schedule progress for today
 * - Nutrition macros vs targets
 * - Training & golf metrics
 * - Goals & open tasks
 * - Revenue/business status
 * - Recovery indicators (sleep, streaks)
 */
function buildSnapshot(): string {
  const s = useStore.getState()
  const date = todayISO()
  const wd = weekdayOf()
  const prog = dayProgress(s, date, wd)
  const m = macrosForDate(s, date)
  const st = streaks(s)
  const wk = workoutsThisWeek(s)
  const golfWeek = golfMinutes(s, weekDates())
  const weights = weightSeries(s, 30)
  const latestW = weights[weights.length - 1]
  const hcp = [...s.handicap].sort((a, b) => (a.date < b.date ? -1 : 1)).pop()

  const todayBlocks = s.schedule
    .filter((b) => b.weekday === wd)
    .map((b) => `${b.start}${b.end ? '-' + b.end : ''} ${b.title}${s.dayChecks[date]?.[b.id] ? ' [DONE]' : ''}`)

  const workout = s.workouts.find((w) => w.weekday === wd)
  const openBiz = s.bizTasks.filter((t) => !t.done).slice(0, 10)
  const openGrocery = s.grocery.filter((g) => !g.done)
  const reading = s.books.filter((b) => b.status === 'reading')

  // Compute macro progress (current vs targets)
  const kcalRemaining = Math.max(0, s.macros.kcal[0] - m.kcal)
  const proteinRemaining = Math.max(0, s.macros.protein[0] - m.protein)
  const waterRemaining = Math.max(0, s.macros.waterMl - m.water)

  return [
    `DATE: ${date} (${WEEKDAY_NAMES[wd]} — "${DAY_CODENAMES[wd]}")`,
    `DAY PROGRESS: ${prog.done}/${prog.total} schedule blocks done (${prog.pct}%)`,
    `TODAY'S SCHEDULE:\n${todayBlocks.map((b) => '  ' + b).join('\n')}`,
    workout
      ? `TODAY'S WORKOUT: ${workout.name} (${workout.exercises.map((e) => `${e.name} ${e.sets}x${e.reps}`).join(', ')})`
      : `TODAY'S WORKOUT: none scheduled${wd === 3 ? ' — Thursday is the Zone 2 engine run.' : ''}`,
    `WEEKLY TRAINING SPLIT (all defined workouts — restructure via add_workout/update_workout/remove_workout):\n${s.workouts
      .map((w) => `  ${WEEKDAY_NAMES[w.weekday]}: ${w.name} — ${w.exercises.map((e) => `${e.name} ${e.sets}x${e.reps}`).join(', ') || 'no exercises yet'}`)
      .join('\n')}`,
    `NUTRITION TODAY: ${m.kcal}/${s.macros.kcal[0]}-${s.macros.kcal[1]} kcal, protein ${m.protein}/${s.macros.protein[0]}-${s.macros.protein[1]}g, carbs ${m.carbs}g, fat ${m.fat}g, water ${(m.water / 1000).toFixed(1)}/${s.macros.waterMl / 1000}L${kcalRemaining > 0 ? ` — ${kcalRemaining} kcal & ${proteinRemaining}g protein still needed` : ' — targets hit'}${waterRemaining > 0 ? `, ${(waterRemaining / 1000).toFixed(1)}L water still needed` : ''}`,
    `WEIGHT: ${latestW ? `${latestW.value} kg (logged ${latestW.date})` : 'no recent log'} — target 87-90 kg lean`,
    `GOLF THIS WEEK: ${fmtHours(golfTotalWeek(s))} total — ${Object.entries(golfWeek)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} ${fmtHours(v)}`)
      .join(', ')}`,
    `HANDICAP: ${hcp?.value ?? 'unknown'} (goal: +handicap)`,
    `STRENGTH TRAINING: ${wk.done}/${wk.planned} sessions completed this week`,
    `STREAKS: blackout ${st.blackout}d, reading ${st.reading}d, check-in ${st.checkin}d`,
    `AURORA REVENUE: $${revenueToday(s).toFixed(0)}/${s.macros.kcal[0]} target${revenueToday(s) >= 1000 ? ' — TARGET HIT' : ''}`,
    openBiz.length ? `AURORA TASKS (${openBiz.length} open): ${openBiz.slice(0, 5).map((t) => t.title).join(' | ')}` : 'AURORA: no open tasks',
    `GOALS: ${s.goals.length} active — ${s.goals
      .slice(0, 3)
      .map((g) => `${g.title} [${g.milestones.filter((x) => x.done).length}/${g.milestones.length} done]`)
      .join(', ')}`,
    openGrocery.length ? `GROCERY: ${openGrocery.map((g) => g.name).join(', ')}` : 'GROCERY: empty',
    reading.length ? `READING: ${reading.map((b) => `${b.title} (p${b.currentPage})`).join(', ')}` : 'READING: none active',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Build the complete unified context for a user query.
 * This is THE single source of truth for Jarvis's knowledge state.
 *
 * Called once per user message, then passed to both local engine and LLM.
 * Ensures consistent context across all reasoning paths.
 */
export function buildJarvisContext(userQuery?: string): JarvisContext {
  const s = useStore.getState()

  const hasLlmBrain =
    (s.settings.provider === 'anthropic' && !!s.settings.anthropicKey) ||
    (s.settings.provider === 'gemini' && !!s.settings.geminiKey)

  return {
    profile: buildProfile(),
    relevantMemory: userQuery ? retrieveRelevantMemory(userQuery) : '',
    knowledge: fullKnowledge(),
    snapshot: buildSnapshot(),
    userName: s.settings.userName || 'sir',
    hasLlmBrain,
    primaryProvider: s.settings.provider as 'anthropic' | 'gemini' | 'none',
  }
}

/**
 * Format context for system prompt injection (used by LLM).
 * Constructs the complete system context that grounds the LLM's reasoning.
 */
export function formatContextForLlm(ctx: JarvisContext): string {
  const basePrompt = `You are JARVIS — ${ctx.userName}'s personal chief of staff and coach inside his "Calibrate" life operating system.

VOICE & STYLE: Speak exactly like the JARVIS of the Iron Man films — refined British butler, composed, effortlessly articulate, warm but understated, with dry wit. Flowing natural prose, never robotic. Your words are SPOKEN ALOUD as much as read: write tight, speakable sentences — no bullet lists, no headers, no markdown unless the user asks for a table or plan. Address him as "sir" sparingly, the way the films do. Brevity is the default; depth on request. One sharp insight beats three generic ones.

CAPABILITIES: You see his entire dashboard (live state below), execute actions against it (log, edit, delete, schedule, remember, navigate), read photos, and you have LIVE WEB SEARCH for anything beyond your knowledge — current facts, branded nutrition, courses, prices, news. You are not a closed system; never say you can't look something up.

CORE COMMITMENT: Ground every piece of advice in his real data, goals, and documented strategies. Never invent specifics about his training, nutrition, golf technique, or business. If you don't have specifics from his KNOWLEDGE or LIVE STATE below, be honest: "I don't have that detail."

ANTI-HALLUCINATION: When giving training, nutrition, golf, recovery, business or book advice, ground it in the KNOWLEDGE and LIVE STATE above and use his real numbers. If you don't have a specific, cite what you DO know and ask clarifying questions.`

  const sections = [
    basePrompt,
    '',
    `━━━ WHO HE IS (your persistent memory of ${ctx.userName}) ━━━`,
    ctx.profile,
  ]

  if (ctx.relevantMemory) {
    sections.push('', `━━━ MEMORIES RELEVANT TO THIS QUERY ━━━`, ctx.relevantMemory)
  }

  sections.push(
    '',
    `━━━ GROUNDED KNOWLEDGE (his real plans & domain facts — advise from THESE, never invent specifics) ━━━`,
    ctx.knowledge,
    '',
    `━━━ LIVE STATE OF HIS SYSTEM (right now) ━━━`,
    ctx.snapshot,
  )

  return sections.filter(Boolean).join('\n')
}

/**
 * Extract key context fields for the local engine.
 * Keeps the fast path smart about user state without duplicating all LLM logic.
 */
export function getContextForLocalEngine(ctx: JarvisContext): {
  userName: string
  todayProgress: string
  currentNutrition: string
  currentGolf: string
  relevantMemory: string
} {
  const lines = ctx.snapshot.split('\n')
  return {
    userName: ctx.userName,
    todayProgress: lines.find((l) => l.startsWith('DAY PROGRESS:')) || '',
    currentNutrition: lines.find((l) => l.startsWith('NUTRITION TODAY:')) || '',
    currentGolf: lines.find((l) => l.startsWith('GOLF THIS WEEK:')) || '',
    relevantMemory: ctx.relevantMemory,
  }
}
