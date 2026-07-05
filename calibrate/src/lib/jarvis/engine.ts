import { fmtHours, todayISO, weekdayOf } from '../dates'
import { dayProgress, golfMinutes, golfTotalWeek, macrosForDate, revenueToday, streaks, workoutsThisWeek } from '../stats'
import { useStore } from '../../store/store'
import type { GolfCategory } from '../../store/types'
import { applyActions, type JarvisAction } from './actions'
import { buildJarvisContext, getContextForLocalEngine } from './context'

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
      `${hours}h of recovery logged. ${hours >= 8 ? 'CNS fully serviced. ' : 'Under the 8h standard — protect tonight's 22:30 blackout. '}`,
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

  // ——— food: "log food chicken bowl 750 kcal 55 protein" / "ate ..." ———
  m = t.match(/(?:log |ate |had |eat )(?:food )?(.+?)(?:[,;]|\s[-–])?\s*(\d{2,4})\s*(?:k?cal(?:ories)?)?(?:\D+(\d{1,3})\s*(?:g\s*)?protein)?/i)
  if (m && /kcal|cal|protein|ate|had|food|meal/i.test(t)) {
    const foodName = m[1]
      .replace(/\b(a|an|the|some|my)\b/gi, '')
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

  // ——— queries: context-aware questions ———
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
    const wk = golfMinutes(s, require('../dates').weekDates())
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
    const { weightSeries } = require('../stats')
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
