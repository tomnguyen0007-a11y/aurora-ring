import { Pause, Play, Plus, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Bars, Empty, HudLabel, Panel, Sparkline, StatTile } from '../components/ui'
import { fmtDateShort, fmtHours, lastNDates, todayISO, weekDates } from '../lib/dates'
import { GOLF_CATEGORIES, golfMinutes, golfWeeklySeries } from '../lib/stats'
import { useStore } from '../store/store'
import type { GolfCategory } from '../store/types'

const CAT_COLORS: Record<GolfCategory, string> = {
  putting: '#5dd39e',
  chipping: '#7fd8c9',
  'long-game': '#f6b83c',
  drills: '#e0a458',
  simulator: '#7fb4d8',
  'on-course': '#c9a3d4',
}

/** Live practice timer — select a category, hit start, minutes log themselves. */
function PracticeTimer() {
  const addGolfSession = useStore((st) => st.addGolfSession)
  const [cat, setCat] = useState<GolfCategory>('putting')
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0) // seconds
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (running && !paused) {
      tick.current = setInterval(() => setElapsed((e) => e + 1), 1000)
      return () => {
        if (tick.current) clearInterval(tick.current)
      }
    }
  }, [running, paused])

  const stop = () => {
    const minutes = Math.max(1, Math.round(elapsed / 60))
    if (elapsed >= 30) addGolfSession({ date: todayISO(), category: cat, minutes, notes: 'timer' })
    setRunning(false)
    setPaused(false)
    setElapsed(0)
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

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
              cat === c.id ? 'border-transparent text-black' : 'border-edge text-haze hover:text-ice'
            }`}
            style={cat === c.id ? { background: CAT_COLORS[c.id] } : {}}
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
            <button className="btn btn-signal !px-5" onClick={() => setRunning(true)}>
              <Play size={16} /> Start
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => setPaused(!paused)}>
                {paused ? <Play size={16} /> : <Pause size={16} />}
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button className="btn btn-danger" onClick={stop}>
                <Square size={15} /> Stop & log
              </button>
            </>
          )}
        </div>
      </div>
      {running && (
        <p className="mt-2 text-xs text-fog">
          Logging to <span style={{ color: CAT_COLORS[cat] }}>{GOLF_CATEGORIES.find((c) => c.id === cat)?.label}</span> when you stop.
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
          <h1 className="font-display text-3xl font-bold tracking-wide text-ice">ELITE GOLF MASTERY</h1>
          <p className="mt-1 text-sm text-haze">From 2.4 to plus. Every minute of practice, accounted for.</p>
        </div>
        <div className="flex items-center gap-3">
          <StatTile label="Handicap" value={currentHcp?.toFixed(1) ?? '—'} sub="target: plus" accent="text-affirm" />
          <StatTile label="This week" value={fmtHours(totalWeek)} sub={`${fmtHours(totalMonth)} / 30d`} accent="text-ice" />
        </div>
      </header>

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
