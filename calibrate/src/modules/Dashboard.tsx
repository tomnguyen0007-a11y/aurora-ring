import { ArrowRight, Droplets, Flame, Moon, Timer } from 'lucide-react'
import { useMemo } from 'react'
import { Bars, CheckDot, HudLabel, Meter, Panel, Ring, StatTile, TAG_COLORS } from '../components/ui'
import { fmtHours, nowMinutes, todayISO, toMinutes, weekdayOf } from '../lib/dates'
import { dayProgress, golfTotalWeek, golfWeeklySeries, macrosForDate, revenueToday, streaks, workoutsThisWeek } from '../lib/stats'
import { DAY_CODENAMES } from '../store/seed'
import { useStore } from '../store/store'
import { CheckInCard } from './CheckInCard'

export function Dashboard() {
  const s = useStore()
  const date = todayISO()
  const wd = weekdayOf()
  const now = nowMinutes()

  const blocks = useMemo(
    () => s.schedule.filter((b) => b.weekday === wd).sort((a, b) => toMinutes(a.start) - toMinutes(b.start)),
    [s.schedule, wd],
  )
  const checks = s.dayChecks[date] ?? {}
  const prog = dayProgress(s, date, wd)
  const current = blocks.find((b) => toMinutes(b.start) <= now && now < toMinutes(b.end || '24:00'))
  const next = blocks.find((b) => toMinutes(b.start) > now)

  const macros = macrosForDate(s, date)
  const workout = s.workouts.find((w) => w.weekday === wd)
  const workoutLog = s.workoutLogs.find((l) => l.date === date && l.workoutId === workout?.id)
  const st = streaks(s)
  const wk = workoutsThisWeek(s)
  const golfWeek = golfTotalWeek(s)
  const rev = revenueToday(s)
  const weightLatest = Object.values(s.checkIns)
    .filter((c) => c.weightKg != null)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.weightKg

  const hour = new Date().getHours()
  const greeting = hour < 11 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <div className="hud-label !mb-1">
            {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()}
          </div>
          <h1 className="font-display text-3xl font-bold leading-none tracking-wide text-ice sm:text-4xl">
            {DAY_CODENAMES[wd]}
          </h1>
          <p className="mt-1.5 text-sm text-haze">
            {greeting}, {s.settings.userName}. {prog.done}/{prog.total} blocks executed.
          </p>
        </div>
        <Ring pct={prog.pct} size={92} stroke={7}>
          <span className="num text-xl font-bold text-signal">{prog.pct}%</span>
          <span className="hud-label !mb-0 !text-[8px]">DAY</span>
        </Ring>
      </header>

      {/* Bento grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Timeline — spans 2 cols, 2 rows */}
        <Panel className="lg:col-span-2 lg:row-span-2">
          <HudLabel>Today's Execution Timeline</HudLabel>
          <ol className="space-y-1">
            {blocks.map((b) => {
              const active = current?.id === b.id
              const past = toMinutes(b.end || '24:00') <= now
              const done = !!checks[b.id]
              return (
                <li
                  key={b.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
                    active
                      ? 'border-signal/40 bg-signal/[0.07] shadow-[0_0_24px_-8px_rgba(246,184,60,0.4)]'
                      : done
                        ? 'border-transparent opacity-55'
                        : past
                          ? 'border-transparent bg-black/20'
                          : 'border-transparent'
                  }`}
                >
                  <span
                    className="h-9 w-1 shrink-0 rounded-full"
                    style={{ background: TAG_COLORS[b.tag], opacity: done ? 0.4 : 0.9 }}
                  />
                  <div className="num w-[86px] shrink-0 text-[11px] leading-tight text-fog">
                    {b.start}
                    {b.end && (
                      <>
                        <br />
                        {b.end}
                      </>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate font-display text-[0.95rem] font-semibold tracking-wide ${done ? 'text-fog line-through' : 'text-ice'}`}>
                      {b.title}
                      {active && <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-signal align-middle" />}
                    </div>
                    {b.detail && <div className="truncate text-xs text-fog">{b.detail}</div>}
                  </div>
                  <CheckDot checked={done} onToggle={() => s.toggleBlock(date, b.id)} label={b.title} />
                </li>
              )
            })}
          </ol>
          {next && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-black/25 px-3 py-2 text-xs text-haze">
              <ArrowRight size={14} className="text-signal" />
              Up next: <span className="font-medium text-ice">{next.title}</span>
              <span className="num text-fog">at {next.start}</span>
            </div>
          )}
        </Panel>

        {/* Today's session */}
        <Panel glow>
          <HudLabel>Today's Session</HudLabel>
          {workout ? (
            <>
              <div className="font-display text-xl font-bold tracking-wide text-ice">{workout.name}</div>
              <div className="mt-1 text-xs text-fog">
                {workout.exercises.length} exercises · {workout.exercises.reduce((a, e) => a + e.sets, 0)} working sets
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-haze">
                {workout.exercises.slice(0, 4).map((e) => (
                  <li key={e.id} className="flex justify-between gap-2">
                    <span className="truncate">{e.name}</span>
                    <span className="num shrink-0 text-fog">
                      {e.sets}×{e.reps}
                    </span>
                  </li>
                ))}
                {workout.exercises.length > 4 && <li className="text-xs text-fog">+ {workout.exercises.length - 4} more…</li>}
              </ul>
              <button
                className={`btn mt-4 w-full ${workoutLog?.completed ? '' : 'btn-signal'}`}
                onClick={() => s.setView('training')}
              >
                {workoutLog?.completed ? 'Session complete ✓' : 'Open session'}
              </button>
            </>
          ) : wd === 3 ? (
            <>
              <div className="font-display text-xl font-bold tracking-wide text-ice">Aerobic Engine Run</div>
              <div className="mt-1 text-xs text-fog">45 min · Zone 2 · nasal breathing</div>
              <button className="btn btn-signal mt-4 w-full" onClick={() => s.setView('training')}>
                Log the run
              </button>
            </>
          ) : (
            <div className="text-sm text-haze">
              Rest / golf day. Sunday is on-course execution — log it in{' '}
              <button className="text-signal underline-offset-2 hover:underline" onClick={() => s.setView('golf')}>
                Golf
              </button>
              .
            </div>
          )}
        </Panel>

        {/* Fuel */}
        <Panel>
          <HudLabel>
            <Flame size={11} className="text-signal" /> Fuel — Today
          </HudLabel>
          <div className="space-y-3">
            <Meter label="Calories" value={macros.kcal} min={s.macros.kcal[0]} max={s.macros.kcal[1]} unit="" />
            <Meter label="Protein" value={macros.protein} min={s.macros.protein[0]} max={s.macros.protein[1]} unit="g" color="var(--color-steel)" />
            <div className="flex items-center justify-between rounded-lg bg-black/25 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs text-haze">
                <Droplets size={13} className="text-steel" /> Water
              </span>
              <div className="flex items-center gap-2">
                <span className="num text-sm text-ice">
                  {(macros.water / 1000).toFixed(1)}<span className="text-fog">/{(s.macros.waterMl / 1000).toFixed(1)}L</span>
                </span>
                <button className="btn !px-2 !py-1 !text-xs" onClick={() => s.addWater(date, 500)}>
                  +500ml
                </button>
              </div>
            </div>
          </div>
        </Panel>

        {/* Stat row */}
        <Panel className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatTile
              label="Weight"
              value={weightLatest ? `${weightLatest}` : '—'}
              sub={weightLatest ? 'kg · target 87–90' : 'log tonight'}
              accent="text-ice"
            />
            <StatTile label="Golf / week" value={fmtHours(golfWeek)} sub="all categories" accent="text-affirm" />
            <StatTile label="Lifts / week" value={`${wk.done}/${wk.planned}`} sub="sessions complete" accent="text-signal" />
            <StatTile
              label="AURORA today"
              value={`$${rev.toFixed(0)}`}
              sub="of $1,000/day target"
              accent={rev >= 1000 ? 'text-affirm' : 'text-steel'}
            />
          </div>
        </Panel>

        {/* Streaks */}
        <Panel>
          <HudLabel>
            <Moon size={11} className="text-steel" /> Discipline Streaks
          </HudLabel>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: 'Blackout', v: st.blackout },
              { label: 'Reading', v: st.reading },
              { label: 'Check-in', v: st.checkin },
            ].map((x) => (
              <div key={x.label} className="rounded-xl border border-edge bg-black/25 px-2 py-3 text-center">
                <div className={`num text-2xl font-bold ${x.v > 0 ? 'text-signal' : 'text-fog'}`}>{x.v}</div>
                <div className="hud-label !mb-0 mt-1 !text-[8px]">{x.label}</div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Golf hours chart */}
        <Panel className="lg:col-span-2">
          <HudLabel>
            <Timer size={11} className="text-affirm" /> Golf Volume — hours per week
          </HudLabel>
          <Bars data={golfWeeklySeries(s)} color="var(--color-affirm)" unit="h" />
        </Panel>

        {/* Check-in */}
        <CheckInCard />
      </div>
    </div>
  )
}
