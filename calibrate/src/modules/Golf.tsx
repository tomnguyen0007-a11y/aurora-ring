import { Pause, Play, Plus, Square, Target, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PhotoGallery } from '../components/PhotoGallery'
import { Bars, Empty, HudLabel, Panel, Sparkline, StatTile } from '../components/ui'
import { fmtDateShort, fmtHours, lastNDates, todayISO, weekDates } from '../lib/dates'
import { GOLF_CATEGORIES, golfMinutes, golfWeeklySeries } from '../lib/stats'
import { useStore } from '../store/store'
import type { GolfCategory } from '../store/types'

/** Coach diagnostic — the strokes-gained truth, editable, feeds Jarvis. */
function GolfDiagnostic() {
  const s = useStore()
  const g = s.golfStats
  const [edit, setEdit] = useState(false)
  const metrics: { key: keyof typeof g; label: string; suffix: string; good: number; higher: boolean }[] = [
    { key: 'fairwaysPct', label: 'Fairways', suffix: '%', good: 60, higher: true },
    { key: 'girPct', label: 'GIR', suffix: '%', good: 60, higher: true },
    { key: 'scramblePct', label: 'Scramble', suffix: '%', good: 50, higher: true },
    { key: 'lostBallsPerRound', label: 'Lost balls', suffix: '/rd', good: 1, higher: false },
  ]
  return (
    <Panel className="lit">
      <div className="mb-3 flex items-center justify-between">
        <HudLabel className="!mb-0">
          <Target size={11} className="text-alert" /> Diagnostic — the strokes-gained truth
        </HudLabel>
        <button className="btn btn-ghost !py-1 !text-xs" onClick={() => setEdit(!edit)}>
          {edit ? 'Done' : 'Edit'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {metrics.map((mtr) => {
          const val = g[mtr.key] as number
          const onTarget = mtr.higher ? val >= mtr.good : val <= mtr.good
          return (
            <div key={mtr.key} className="rounded-xl border border-edge bg-black/25 px-3 py-3">
              {edit ? (
                <input
                  className="field num w-full !py-1 text-lg"
                  inputMode="decimal"
                  aria-label={mtr.label}
                  value={val}
                  onChange={(e) => s.setGolfStats({ [mtr.key]: parseFloat(e.target.value) || 0 })}
                />
              ) : (
                <div className={`num text-2xl font-bold ${onTarget ? 'text-affirm' : 'text-alert'}`}>
                  {val}
                  <span className="text-xs text-fog">{mtr.suffix}</span>
                </div>
              )}
              <div className="hud-label !mb-0 mt-1 !text-[8px]">{mtr.label}</div>
            </div>
          )
        })}
      </div>
      {s.golfRounds.length > 0 && (
        <div className="mt-3">
          <div className="hud-label !mb-1.5 !text-[8px]">Recent rounds (Golfshot)</div>
          <div className="flex flex-wrap gap-1.5">
            {s.golfRounds.slice(0, 8).map((r) => (
              <span key={r.id} className="num rounded-lg border border-edge bg-black/25 px-2.5 py-1.5 text-sm text-ice" title={`${r.course} · ${r.date}`}>
                {r.score}
              </span>
            ))}
            <span className="self-center text-[10px] text-fog">latest first</span>
          </div>
        </div>
      )}
      <div className="mt-3 rounded-lg border border-alert/20 bg-alert/[0.05] p-3">
        <div className="hud-label !mb-1 !text-[8px] text-alert">Current Focus</div>
        {edit ? (
          <textarea
            className="field w-full text-sm"
            rows={2}
            value={g.focus}
            aria-label="Golf focus"
            onChange={(e) => s.setGolfStats({ focus: e.target.value })}
          />
        ) : (
          <p className="text-sm leading-relaxed text-ice">{g.focus}</p>
        )}
      </div>
    </Panel>
  )
}

const CAT_COLORS: Record<GolfCategory, string> = {
  putting: '#5dd39e',
  chipping: '#7fd8c9',
  'long-game': '#ff7e47',
  drills: '#e0a458',
  simulator: '#7fb4d8',
  'on-course': '#c9a3d4',
}

/**
 * Live practice timer — select a category, hit start, minutes log themselves.
 *
 * Elapsed time is always DERIVED from a wall-clock `startedAt` timestamp
 * (persisted in the store), never accumulated by counting setInterval ticks.
 * A ticking counter falls behind reality the moment the phone locks or the
 * PWA backgrounds — browsers throttle or fully suspend setInterval in the
 * background (especially iOS), so missed ticks mean the display undercounts
 * real elapsed time, sometimes badly. Deriving from Date.now() means every
 * render is correct regardless of how many ticks were actually delivered,
 * and persisting the timer means an iOS-killed background tab still shows
 * the right time on reload instead of resetting to zero.
 */
function PracticeTimer() {
  const timer = useStore((st) => st.golfTimer)
  const startGolfTimer = useStore((st) => st.startGolfTimer)
  const pauseGolfTimer = useStore((st) => st.pauseGolfTimer)
  const resumeGolfTimer = useStore((st) => st.resumeGolfTimer)
  const stopGolfTimer = useStore((st) => st.stopGolfTimer)
  const [cat, setCat] = useState<GolfCategory>('putting')
  // Forces a re-render every second while running so the derived elapsed value redraws.
  const [, forceTick] = useState(0)

  const running = !!timer
  const paused = !!timer && timer.startedAt === null

  useEffect(() => {
    if (!running || paused) return
    const id = setInterval(() => forceTick((n) => n + 1), 1000)
    // Also resync the instant the tab/screen comes back — don't wait up to 1s
    // for the next tick after a background suspension.
    const onVisible = () => document.visibilityState === 'visible' && forceTick((n) => n + 1)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [running, paused])

  const elapsed = timer ? timer.accumulatedSec + (timer.startedAt !== null ? (Date.now() - timer.startedAt) / 1000 : 0) : 0
  const elapsedInt = Math.floor(elapsed)
  const mm = String(Math.floor(elapsedInt / 60)).padStart(2, '0')
  const ss = String(elapsedInt % 60).padStart(2, '0')
  const activeCat = timer?.category ?? cat

  return (
    <Panel glow={running}>
      <HudLabel>Practice Timer</HudLabel>
      <div className="flex flex-wrap gap-1.5">
        {GOLF_CATEGORIES.map((c) => (
          <button
            key={c.id}
            disabled={running}
            onClick={() => setCat(c.id)}
            className={`rounded-full border px-3 py-1.5 font-display text-xs font-semibold tracking-wide transition-all disabled:opacity-40 ${
              activeCat === c.id ? 'border-transparent text-black' : 'border-edge text-haze hover:text-ice'
            }`}
            style={activeCat === c.id ? { background: CAT_COLORS[c.id] } : {}}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div className={`num text-5xl font-bold tabular-nums tracking-tight ${running ? 'text-signal' : 'text-fog'}`}>
          {mm}:{ss}
        </div>
        <div className="flex gap-2">
          {!running ? (
            <button className="btn btn-signal !px-5" onClick={() => startGolfTimer(cat)}>
              <Play size={16} /> Start
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => (paused ? resumeGolfTimer() : pauseGolfTimer())}>
                {paused ? <Play size={16} /> : <Pause size={16} />}
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button className="btn btn-danger" onClick={stopGolfTimer}>
                <Square size={15} /> Stop & log
              </button>
            </>
          )}
        </div>
      </div>
      {running && (
        <p className="mt-2 text-xs text-fog">
          Logging to <span style={{ color: CAT_COLORS[activeCat] }}>{GOLF_CATEGORIES.find((c) => c.id === activeCat)?.label}</span> when you stop.
        </p>
      )}
    </Panel>
  )
}

export function Golf() {
  const s = useStore()
  const week = golfMinutes(s, weekDates())
  const totalWeek = Object.values(week).reduce((a, b) => a + b, 0)
  const month = golfMinutes(s, lastNDates(30))
  const totalMonth = Object.values(month).reduce((a, b) => a + b, 0)
  const hcp = [...s.handicap].sort((a, b) => (a.date < b.date ? -1 : 1))
  const currentHcp = hcp[hcp.length - 1]?.value

  const [manCat, setManCat] = useState<GolfCategory>('putting')
  const [manMin, setManMin] = useState('')
  const [hcpVal, setHcpVal] = useState('')

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="h-lumen text-3xl font-bold tracking-wide">ELITE GOLF MASTERY</h1>
          <p className="mt-1 text-sm text-haze">From 2.4 to plus. Every minute of practice, accounted for.</p>
        </div>
        <div className="flex items-center gap-3">
          <StatTile label="Handicap" value={currentHcp?.toFixed(1) ?? '—'} sub="target: plus" accent="text-affirm" />
          <StatTile label="This week" value={fmtHours(totalWeek)} sub={`${fmtHours(totalMonth)} / 30d`} accent="text-ice" />
        </div>
      </header>

      <GolfDiagnostic />

      <PhotoGallery category="golf" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PracticeTimer />

        <Panel>
          <HudLabel>Manual Log</HudLabel>
          <form
            className="space-y-2.5"
            onSubmit={(e) => {
              e.preventDefault()
              const minutes = parseInt(manMin)
              if (!minutes) return
              s.addGolfSession({ date: todayISO(), category: manCat, minutes, notes: '' })
              setManMin('')
            }}
          >
            <div className="flex flex-wrap gap-1.5">
              {GOLF_CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setManCat(c.id)}
                  className={`rounded-full border px-3 py-1.5 font-display text-xs font-semibold tracking-wide transition-all ${
                    manCat === c.id ? 'border-transparent text-black' : 'border-edge text-haze hover:text-ice'
                  }`}
                  style={manCat === c.id ? { background: CAT_COLORS[c.id] } : {}}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="field num flex-1"
                placeholder="Minutes"
                inputMode="numeric"
                value={manMin}
                onChange={(e) => setManMin(e.target.value)}
              />
              <button className="btn btn-signal" type="submit">
                <Plus size={15} /> Log
              </button>
            </div>
          </form>

          <div className="mt-5 border-t border-edge pt-4">
            <HudLabel>Handicap Trend</HudLabel>
            <div className="flex items-center justify-between gap-4">
              <Sparkline points={hcp.map((h) => -h.value)} width={180} height={44} color="var(--color-affirm)" />
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const v = parseFloat(hcpVal)
                  if (isNaN(v)) return
                  s.addHandicap(v)
                  setHcpVal('')
                }}
              >
                <input
                  className="field num w-20"
                  placeholder="2.2"
                  inputMode="decimal"
                  aria-label="New handicap"
                  value={hcpVal}
                  onChange={(e) => setHcpVal(e.target.value)}
                />
                <button className="btn !px-3" type="submit" aria-label="Log handicap">
                  <Plus size={15} />
                </button>
              </form>
            </div>
          </div>
        </Panel>

        <Panel>
          <HudLabel>This Week by Category</HudLabel>
          <div className="space-y-2.5">
            {GOLF_CATEGORIES.map((c) => {
              const mins = week[c.id]
              const pct = totalWeek ? (mins / totalWeek) * 100 : 0
              return (
                <div key={c.id}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-haze">{c.label}</span>
                    <span className="num text-ice">{fmtHours(mins)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: CAT_COLORS[c.id] }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel>
          <HudLabel>Volume — hours per week</HudLabel>
          <Bars data={golfWeeklySeries(s)} color="var(--color-affirm)" unit="h" />
          <div className="mt-4 border-t border-edge pt-3">
            <HudLabel>Recent Sessions</HudLabel>
            {s.golfSessions.length ? (
              <ul className="space-y-1.5">
                {s.golfSessions.slice(0, 6).map((g) => (
                  <li key={g.id} className="group flex items-center justify-between rounded-lg bg-black/25 px-3 py-2 text-sm">
                    <span className="num text-xs text-fog">{fmtDateShort(g.date)}</span>
                    <span style={{ color: CAT_COLORS[g.category] }}>{GOLF_CATEGORIES.find((c) => c.id === g.category)?.label}</span>
                    <span className="num text-ice">{fmtHours(g.minutes)}</span>
                    <button
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Delete session"
                      onClick={() => s.removeGolfSession(g.id)}
                    >
                      <Trash2 size={14} className="text-alert/70" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No sessions yet. Start the timer or ask Jarvis: “log 30 min chipping”.</Empty>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
