import { fmtHours, todayISO, WEEKDAY_NAMES, weekdayOf } from '../dates'
import { dayProgress, golfMinutes, golfTotalWeek, macrosForDate, revenueToday, streaks, weightSeries, workoutsThisWeek } from '../stats'
import { DAY_CODENAMES } from '../../store/seed'
import { useStore } from '../../store/store'
import { weekDates } from '../dates'

/** Who Tom is — persistent memory Jarvis always carries. */
export function buildProfile(): string {
  const s = useStore.getState()
  const p = s.profile
  const g = s.golfStats
  return [
    `IDENTITY: ${p.name}${p.age ? `, age ${p.age}` : ''}${p.location ? `, ${p.location}` : ''}. ${p.identity}`,
    `INSPIRATION: ${p.inspiration}`,
    `OPERATING PHILOSOPHY: ${p.philosophy}`,
    `GOLF SNAPSHOT: handicap-focus "${g.focus}" — fairways ${g.fairwaysPct}%, GIR ${g.girPct}%, scramble ${g.scramblePct}%, ~${g.lostBallsPerRound} lost balls/round, avg ${g.avgScore}.`,
    `KEY FACTS ABOUT ${p.name.toUpperCase()}:`,
    ...p.facts.map((f) => `  • ${f}`),
    s.mantras.length ? `MANTRAS HE LIVES BY: ${s.mantras.slice(0, 6).map((m) => `"${m.text}"`).join(' ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Compact plain-text snapshot of the whole app state — Jarvis's situational awareness. */
export function buildSnapshot(): string {
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

  return [
    `DATE: ${date} (${WEEKDAY_NAMES[wd]} — "${DAY_CODENAMES[wd]}")`,
    `DAY PROGRESS: ${prog.done}/${prog.total} schedule blocks done (${prog.pct}%)`,
    `TODAY'S SCHEDULE:\n${todayBlocks.map((b) => '  ' + b).join('\n')}`,
    workout ? `TODAY'S WORKOUT: ${workout.name} (${workout.exercises.map((e) => `${e.name} ${e.sets}x${e.reps}`).join(', ')})` : `TODAY'S WORKOUT: none scheduled${wd === 3 ? ' — Thursday is the 45min Zone 2 run' : ''}`,
    `NUTRITION TODAY: ${m.kcal} kcal (target ${s.macros.kcal[0]}-${s.macros.kcal[1]}), protein ${m.protein}g (target ${s.macros.protein[0]}-${s.macros.protein[1]}g), carbs ${m.carbs}g, fat ${m.fat}g, water ${(m.water / 1000).toFixed(1)}L/${(s.macros.waterMl / 1000).toFixed(0)}L`,
    `WEIGHT: ${latestW ? `${latestW.value} kg (logged ${latestW.date})` : 'no recent log'} — goal 87-90 kg lean`,
    `GOLF THIS WEEK: total ${fmtHours(golfTotalWeek(s))} — ${Object.entries(golfWeek).map(([k, v]) => `${k}: ${fmtHours(v)}`).join(', ')}`,
    `HANDICAP: ${hcp?.value ?? 'unknown'} (goal: plus handicap)`,
    `LIFTS THIS WEEK: ${wk.done}/${wk.planned} completed`,
    `STREAKS: blackout ${st.blackout}d, reading ${st.reading}d, check-in ${st.checkin}d`,
    `AURORA REVENUE: today $${revenueToday(s)} (target $1000/day)`,
    openBiz.length ? `AURORA OPEN TASKS: ${openBiz.map((t) => t.title).join(' | ')}` : 'AURORA OPEN TASKS: none',
    `GOALS:\n${s.goals.map((g) => `  - ${g.title}: ${g.target} [${g.milestones.filter((x) => x.done).length}/${g.milestones.length} milestones]`).join('\n')}`,
    openGrocery.length ? `GROCERY LIST: ${openGrocery.map((g) => g.name).join(', ')}` : 'GROCERY LIST: empty',
    reading.length ? `READING NOW: ${reading.map((b) => `${b.title} (p.${b.currentPage}/${b.totalPages || '?'})`).join(', ')}` : 'READING NOW: nothing',
    `NOTES: ${s.notes.length} notes, ${s.tables.length} tables`,
    `WATCHLIST: ${s.watchlist.map((w) => w.symbol).join(', ')}`,
  ].join('\n')
}
