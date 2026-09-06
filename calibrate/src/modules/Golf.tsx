import { useEffect, useState } from 'react'
import { Icon } from '../components/icons'
import {
  Bar,
  Chip,
  Cols,
  DangerBtn,
  Empty,
  Eyebrow,
  InlineArea,
  InlineText,
  NumCell,
  Page,
  Reorder,
  Scroller,
  Section,
  Spark,
  Stat,
  Tools,
} from '../components/ui'
import { fmtDateShort, fmtHours, lastNDates, todayISO, weekDates } from '../lib/dates'
import { PhotoGallery } from '../components/PhotoGallery'
import { golfAllTime, golfMinutes, golfMonthlySeries, golfWeeklySeries } from '../lib/stats'
import { useStore } from '../store/store'

/** The diagnostic Jarvis coaches from — every figure editable in place. */
function Diagnostic() {
  const s = useStore()
  const g = s.golfStats
  const metrics: {
    key: 'fairwaysPct' | 'girPct' | 'scramblePct' | 'lostBallsPerRound' | 'puttsPerRound' | 'avgScore'
    label: string
    suffix: string
    good: number
    higher: boolean
  }[] = [
    { key: 'fairwaysPct', label: 'Fairways', suffix: '%', good: 60, higher: true },
    { key: 'girPct', label: 'GIR', suffix: '%', good: 60, higher: true },
    { key: 'scramblePct', label: 'Scramble', suffix: '%', good: 50, higher: true },
    { key: 'lostBallsPerRound', label: 'Lost balls', suffix: '/rd', good: 1, higher: false },
    { key: 'puttsPerRound', label: 'Putts', suffix: '/rd', good: 30, higher: false },
    { key: 'avgScore', label: 'Avg score', suffix: '', good: 74, higher: false },
  ]
  return (
    <Section label="Diagnostic — the strokes-gained truth">
      <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => {
          const val = g[m.key]
          const onTarget = m.higher ? val >= m.good : val <= m.good
          return (
            <div key={m.key}>
              <span className="flex items-baseline">
                <NumCell value={val} onChange={(v) => s.setGolfStats({ [m.key]: v ?? 0, updated: todayISO() })} ariaLabel={m.label} width="w-12" />
                <span className="text-micro text-faint">{m.suffix}</span>
              </span>
              <div className="eyebrow mt-1.5">{m.label}</div>
              <Bar pct={m.higher ? Math.min(100, (val / m.good) * 100) : Math.min(100, (m.good / Math.max(val, 0.1)) * 100)} className="mt-2" />
              {!onTarget && (
                <div className="mt-1.5 text-micro text-faint">
                  target {m.higher ? '≥' : '≤'}
                  {m.good}
                  {m.suffix}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-7 border-t border-line pt-5">
        <Eyebrow className="mb-2">Current focus</Eyebrow>
        <InlineArea
          value={g.focus}
          onChange={(v) => s.setGolfStats({ focus: v })}
          ariaLabel="Golf focus"
          className="max-w-2xl !text-lede !leading-relaxed !text-paper"
        />
      </div>
      {s.golfRounds.length > 0 && (
        <div className="mt-7 border-t border-line pt-5">
          <Eyebrow className="mb-3">Recent rounds</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {s.golfRounds.slice(0, 12).map((r) => (
              <span key={r.id} className="num border border-line px-2.5 py-1 text-body text-paper" title={`${r.course} · ${r.date}`}>
                {r.score}
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

/** Live practice timer — start it and the minutes log themselves. */
/**
 * Practice timer. Elapsed is DERIVED from wall-clock stamps held in the store,
 * never ticked by a counter — so locking the phone, backgrounding the tab or iOS
 * killing the PWA mid-session cannot make it drift. The interval below only
 * forces a re-render; it is not the source of truth.
 */
function PracticeTimer() {
  const s = useStore()
  const timer = s.golfTimer
  const [cat, setCat] = useState(s.golfCategories[0]?.id ?? 'putting')
  const [, force] = useState(0)

  const running = !!timer
  const paused = !!timer && timer.startedAt === null

  useEffect(() => {
    if (!running || paused) return
    const id = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [running, paused])

  // Re-derive on every wake: visibilitychange fires when the phone comes back.
  useEffect(() => {
    const onWake = () => force((n) => n + 1)
    document.addEventListener('visibilitychange', onWake)
    return () => document.removeEventListener('visibilitychange', onWake)
  }, [])

  const elapsed = timer
    ? Math.floor(timer.accumulatedSec + (timer.startedAt !== null ? (Date.now() - timer.startedAt) / 1000 : 0))
    : 0
  const activeCat = timer?.category ?? cat
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  const catLabel = s.golfCategories.find((c) => c.id === activeCat)?.label ?? activeCat

  return (
    <Section label="Practice timer">
      <Scroller className="mb-6">
        {s.golfCategories.map((c) => (
          <Chip key={c.id} active={activeCat === c.id} onClick={() => !running && setCat(c.id)}>
            {c.label}
          </Chip>
        ))}
      </Scroller>
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className={`readout text-[3rem] leading-none ${running && !paused ? 'glow text-paper' : 'text-faint'}`}>
          {mm}:{ss}
        </div>
        <div className="flex gap-2">
          {!running ? (
            <button className="btn btn-solid" onClick={() => s.startGolfTimer(cat)}>
              <Icon name="play" size={13} /> Start {catLabel}
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => (paused ? s.resumeGolfTimer() : s.pauseGolfTimer())}>
                <Icon name={paused ? 'play' : 'pause'} size={13} /> {paused ? 'Resume' : 'Pause'}
              </button>
              <button className="btn" onClick={() => s.stopGolfTimer()}>
                <Icon name="stop" size={13} /> Stop and log
              </button>
            </>
          )}
        </div>
      </div>
      {running && <p className="mt-4 text-micro text-faint">Running in the background — lock the phone, the clock keeps real time.</p>}
    </Section>
  )
}

export function Golf({ label }: { label: string }) {
  const s = useStore()
  const week = golfMinutes(s, weekDates())
  const totalWeek = Object.values(week).reduce((a, b) => a + b, 0)
  const month = golfMinutes(s, lastNDates(30))
  const totalMonth = Object.values(month).reduce((a, b) => a + b, 0)
  const allTime = golfAllTime(s)
  const hcp = [...s.handicap].sort((a, b) => (a.date < b.date ? -1 : 1))
  const currentHcp = hcp[hcp.length - 1]?.value

  const [manCat, setManCat] = useState(s.golfCategories[0]?.id ?? 'putting')
  const [manMin, setManMin] = useState('')
  const [hcpVal, setHcpVal] = useState('')
  const [editCats, setEditCats] = useState(false)

  return (
    <Page
      title={label}
      lede="From 2.4 to plus. Every minute of practice accounted for — and every category renameable to match how you actually train."
      actions={
        <>
          <div className="text-right">
            <div className="readout text-[1.375rem]">{currentHcp?.toFixed(1) ?? '—'}</div>
            <Eyebrow className="mt-1">Handicap</Eyebrow>
          </div>
          <div className="ml-6 text-right">
            <div className="readout text-[1.375rem]">{fmtHours(totalWeek)}</div>
            <Eyebrow className="mt-1">This week</Eyebrow>
          </div>
        </>
      }
    >
      <Diagnostic />
      <PracticeTimer />

      <Section
        label="Log by hand"
        aside={
          <button className="btn btn-sm" onClick={() => setEditCats(!editCats)}>
            {editCats ? 'Done' : 'Edit categories'}
          </button>
        }
      >
        {editCats ? (
          <div>
            <ul>
              {s.golfCategories.map((c, i) => (
                <li key={c.id} className="group flex items-center gap-3 border-b border-line py-2.5">
                  <span className="min-w-0 flex-1">
                    <InlineText value={c.label} onChange={(v) => s.renameTaxon('golfCategories', c.id, v)} ariaLabel="Category name" className="text-body text-paper" />
                  </span>
                  <Tools>
                    <Reorder
                      onUp={() => s.moveTaxon('golfCategories', c.id, -1)}
                      onDown={() => s.moveTaxon('golfCategories', c.id, 1)}
                      first={i === 0}
                      last={i === s.golfCategories.length - 1}
                    />
                    <DangerBtn onConfirm={() => s.removeTaxon('golfCategories', c.id)} label={`Delete ${c.label}`} />
                  </Tools>
                </li>
              ))}
            </ul>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const input = e.currentTarget.elements.namedItem('cat') as HTMLInputElement
                if (!input.value.trim()) return
                s.addTaxon('golfCategories', input.value.trim())
                input.value = ''
              }}
            >
              <input name="cat" className="field min-w-0 flex-1" placeholder="New category…" aria-label="New category" />
              <button className="btn" type="submit">
                Add
              </button>
            </form>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const minutes = parseInt(manMin)
              if (!minutes) return
              s.addGolfSession({ date: todayISO(), category: manCat, minutes, notes: '' })
              setManMin('')
            }}
          >
            <Scroller className="mb-5">
              {s.golfCategories.map((c) => (
                <Chip key={c.id} active={manCat === c.id} onClick={() => setManCat(c.id)}>
                  {c.label}
                </Chip>
              ))}
            </Scroller>
            <div className="flex gap-2">
              <input
                className="field num w-28"
                placeholder="Minutes"
                inputMode="numeric"
                value={manMin}
                onChange={(e) => setManMin(e.target.value)}
                aria-label="Minutes"
              />
              <button className="btn btn-solid" type="submit">
                Log
              </button>
            </div>
          </form>
        )}
      </Section>

      <div className="grid gap-x-14 gap-y-9 lg:grid-cols-2">
        <Section label="This week by category">
          <div className="space-y-4">
            {s.golfCategories.map((c) => {
              const mins = week[c.id] ?? 0
              const pct = totalWeek ? (mins / totalWeek) * 100 : 0
              return (
                <div key={c.id}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-body text-mute">{c.label}</span>
                    <span className="num text-body text-paper">{fmtHours(mins)}</span>
                  </div>
                  <Bar pct={pct} />
                </div>
              )
            })}
          </div>
          <div className="mt-6 border-t border-line pt-4 text-body text-faint">
            <span className="num text-paper">{fmtHours(totalMonth)}</span> over the last 30 days.
          </div>
        </Section>

        <Section label="Handicap trend">
          <div className="flex items-center justify-between gap-6">
            <Spark points={hcp.map((h) => -h.value)} width={200} height={44} />
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const v = parseFloat(hcpVal.replace(',', '.'))
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
              <button className="btn" type="submit">
                Log
              </button>
            </form>
          </div>
          <ul className="mt-6">
            {[...hcp]
              .reverse()
              .slice(0, 5)
              .map((h) => (
                <li key={h.id} className="group flex items-center justify-between border-b border-line py-2 last:border-b-0">
                  <span className="num text-micro text-faint">{fmtDateShort(h.date)}</span>
                  <span className="num text-body text-paper">{h.value.toFixed(1)}</span>
                  <Tools>
                    <DangerBtn onConfirm={() => s.removeHandicap(h.id)} label="Delete entry" />
                  </Tools>
                </li>
              ))}
          </ul>
        </Section>
      </div>

      <Section label="Volume — hours per week">
        <Cols data={golfWeeklySeries(s)} unit="h" height={84} />
      </Section>

      <Section label="All time">
        <Cols data={golfMonthlySeries(s)} unit="h" height={92} />
        <div className="mt-7 grid grid-cols-2 gap-x-10 gap-y-6 border-t border-line pt-6 sm:grid-cols-4">
          <Stat label="Total practice" value={fmtHours(allTime.totalMinutes)} strong />
          <Stat label="Sessions" value={allTime.sessions} strong />
          <Stat label="Weekly average" value={fmtHours(allTime.avgWeekMinutes)} strong />
          <Stat label="Since" value={allTime.firstDate ? fmtDateShort(allTime.firstDate) : '—'} strong />
        </div>
        {allTime.totalMinutes > 0 && (
          <div className="mt-7 border-t border-line pt-5">
            {s.golfCategories.map((c) => {
              const mins = allTime.byCategory[c.id] ?? 0
              return (
                <div key={c.id} className="flex items-center gap-4 border-b border-line py-2.5 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate text-body text-mute">{c.label}</span>
                  <span className="hidden w-40 sm:block">
                    <Bar pct={(mins / Math.max(1, allTime.totalMinutes)) * 100} />
                  </span>
                  <span className="num w-16 shrink-0 text-right text-body text-paper">{fmtHours(mins)}</span>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <PhotoGallery category="golf" />

      <Section label="Recent sessions">
        {s.golfSessions.length ? (
          <ul>
            {s.golfSessions.slice(0, 10).map((g) => (
              <li key={g.id} className="group flex items-center gap-4 border-b border-line py-2.5 last:border-b-0">
                <input
                  type="date"
                  value={g.date}
                  onChange={(e) => s.updateGolfSession(g.id, { date: e.target.value })}
                  aria-label="Session date"
                  className="field-line num w-[6.5rem] shrink-0 text-micro text-faint"
                />
                <select
                  value={g.category}
                  onChange={(e) => s.updateGolfSession(g.id, { category: e.target.value })}
                  aria-label="Session category"
                  className="field-line min-w-0 flex-1 truncate bg-transparent text-body text-mute"
                >
                  {s.golfCategories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-ink text-paper">
                      {c.label}
                    </option>
                  ))}
                </select>
                <span className="num flex shrink-0 items-baseline text-body text-paper">
                  <NumCell
                    value={g.minutes}
                    onChange={(v) => s.updateGolfSession(g.id, { minutes: Math.max(1, v ?? 1) })}
                    ariaLabel="Session minutes"
                    width="w-12"
                    suffix="min"
                  />
                </span>
                <Tools>
                  <DangerBtn onConfirm={() => s.removeGolfSession(g.id)} label="Delete session" />
                </Tools>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nothing logged. Start the timer, or tell Jarvis “log 30 min chipping”.</Empty>
        )}
      </Section>
    </Page>
  )
}
