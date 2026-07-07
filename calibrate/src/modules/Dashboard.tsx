import { AlertTriangle, ArrowRight, Droplets, Flame, Moon, Timer } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Bars, CheckDot, HudLabel, Meter, Panel, Ring, TAG_COLORS } from '../components/ui'
import { computeAlerts, notifyAlerts } from '../lib/alerts'
import { fmtHours, nowMinutes, todayISO, toMinutes, weekdayOf } from '../lib/dates'
import { dayProgress, golfTotalWeek, golfWeeklySeries, macrosForDate, revenueToday, streaks, workoutsThisWeek } from '../lib/stats'
import { quoteOfDay } from '../lib/quote'
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
  const workout = s.workouts.find((w) => w.weekday === wd && !w.id.startsWith('o-'))
  const workoutLog = s.workoutLogs.find((l) => l.date === date && l.workoutId === workout?.id)
  const st = streaks(s)
  const wk = workoutsThisWeek(s)
  const golfWeek = golfTotalWeek(s)
  const rev = revenueToday(s)
  const weightLatest = Object.values(s.checkIns)
    .filter((c) => c.weightKg != null)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.weightKg

  const alerts = computeAlerts(s)
  const notify = s.settings.notifyEnabled

  // surface reminders as browser notifications while the app is open
  useEffect(() => {
    if (!notify) return
    notifyAlerts(alerts)
    const t = setInterval(() => notifyAlerts(computeAlerts(useStore.getState())), 5 * 60_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify])

  const quote = quoteOfDay(s.mantras)

  return (
    <div className="space-y-4">
      {/* ——— Command header: the day at a glance ——— */}
      <header className="px-1">
        <div className="hud-label !mb-1.5">
          {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()}
          <span className="mx-2 text-signal">·</span>
          <span className="text-signal">{DAY_CODENAMES[wd]}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <span className="h-lumen num text-6xl font-extralight leading-none tracking-tight sm:text-7xl">
                {prog.done}
                <span className="text-fog/60">/{prog.total}</span>
              </span>
              <span className="hud-label !mb-0 !text-[10px]">complete</span>
            </div>
            <p className="mt-2 text-sm text-haze">
              {current ? (
                <>
                  Now: <span className="font-medium text-ice">{current.title}</span>
                </>
              ) : next ? (
                <>
                  Up next: <span className="font-medium text-ice">{next.title}</span>{' '}
                  <span className="num text-fog">at {next.start}</span>
                </>
              ) : (
                'Day complete. Blackout at 22:30.'
              )}
            </p>
          </div>
          <Ring pct={prog.pct} size={88} stroke={4}>
            <span className="num text-lg font-light text-signal">{prog.pct}%</span>
          </Ring>
        </div>

        {/* Vital strip — one glance, everything that matters */}
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            { label: 'Weight', value: weightLatest ? `${weightLatest}` : '—', unit: 'kg', tone: 'text-ice' },
            { label: 'Protein', value: `${Math.round(macros.protein)}`, unit: `/${s.macros.protein[0]}g`, tone: macros.protein >= s.macros.protein[0] ? 'text-affirm' : 'text-ice' },
            { label: 'Water', value: (macros.water / 1000).toFixed(1), unit: '/3L', tone: 'text-arc' },
            { label: 'Golf wk', value: fmtHours(golfWeek), unit: '', tone: 'text-affirm' },
            { label: 'Lifts', value: `${wk.done}`, unit: `/${wk.planned}`, tone: 'text-signal' },
            { label: 'AURORA', value: `$${rev.toFixed(0)}`, unit: '/1k', tone: rev >= 1000 ? 'text-affirm' : 'text-steel' },
          ].map((v) => (
            <div key={v.label} className="glass rounded-xl px-3 py-2.5">
              <div className={`num text-lg font-medium leading-none ${v.tone}`}>
                {v.value}
                <span className="text-[10px] font-normal text-fog">{v.unit}</span>
              </div>
              <div className="hud-label !mb-0 mt-1 !text-[8px]">{v.label}</div>
            </div>
          ))}
        </div>
      </header>

      {/* Attention required */}
      {alerts.length > 0 && (
        <Panel className="!border-alert/25">
          <HudLabel>
            <AlertTriangle size={11} className="text-alert" /> Attention Required
          </HudLabel>
          <ul className="space-y-1.5">
            {alerts.map((a) => (
              <li key={a.id} className={`flex items-start gap-2 text-sm ${a.severity === 'warn' ? 'text-ice' : 'text-haze'}`}>
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.severity === 'warn' ? 'bg-alert' : 'bg-signal'}`} />
                {a.text}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Signal of the day */}
      {quote && (
        <button
          onClick={() => s.setView('mindset')}
          className="glass flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:border-edge-strong"
        >
          <span className="text-arc text-glow-arc text-lg leading-none">◆</span>
          <span className="min-w-0 flex-1">
            <span className="text-sm italic text-ice/90">"{quote.text}"</span>
            {quote.author && <span className="ml-2 text-xs text-fog">— {quote.author}</span>}
          </span>
          <span className="hud-label !mb-0 hidden shrink-0 !text-[8px] sm:block">Mindset →</span>
        </button>
      )}

      {/* ——— Execution timeline (the spine of the day) ——— */}
      <Panel>
        <HudLabel>Execution Timeline</HudLabel>
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
                    ? 'border-signal/40 bg-signal/[0.07] shadow-[0_0_24px_-8px_rgba(233,237,242,0.25)]'
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                <Droplets size={13} className="text-arc" /> Water
              </span>
              <div className="flex items-center gap-2">
                <span className="num text-sm text-ice">
                  {(macros.water / 1000).toFixed(1)}
                  <span className="text-fog">/{(s.macros.waterMl / 1000).toFixed(1)}L</span>
                </span>
                <button className="btn !px-2 !py-1 !text-xs" onClick={() => s.addWater(date, 500)}>
                  +500ml
                </button>
              </div>
            </div>
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
                <div className={`num text-2xl font-light ${x.v > 0 ? "text-signal" : "text-fog"}`}>{x.v}</div>
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
