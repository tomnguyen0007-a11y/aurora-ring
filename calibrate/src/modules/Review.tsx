import { CalendarCheck, Flame, MoveDownRight, MoveRight, MoveUpRight } from 'lucide-react'
import { Empty, HudLabel, Panel, StatTile } from '../components/ui'
import { fmtHours, lastNDates, todayISO, weekdayOf } from '../lib/dates'
import { dayProgress, streaks, weeklyReview, type WeekSnapshot } from '../lib/stats'
import { useStore } from '../store/store'

interface PillarRow {
  label: string
  fmt: (v: number) => string
  key: keyof WeekSnapshot
  /** which pillar this feeds, for the focus suggestion */
  focus: string
}

const PILLARS: PillarRow[] = [
  { label: 'Golf practice', key: 'golfMin', fmt: fmtHours, focus: 'golf' },
  { label: 'Workouts', key: 'workouts', fmt: (v) => `${v}`, focus: 'physique' },
  { label: 'Running', key: 'runKm', fmt: (v) => `${v} km`, focus: 'engine' },
  { label: 'Revenue', key: 'revenue', fmt: (v) => `$${Math.round(v)}`, focus: 'AURORA' },
  { label: 'Reading', key: 'readingMin', fmt: fmtHours, focus: 'mind' },
  { label: 'Schedule kept', key: 'schedulePct', fmt: (v) => `${v}%`, focus: 'discipline' },
  { label: 'Check-ins', key: 'checkIns', fmt: (v) => `${v}/7`, focus: 'discipline' },
]

function Delta({ now, prev }: { now: number; prev: number }) {
  if (now === prev) return <MoveRight size={13} className="text-fog" />
  return now > prev ? <MoveUpRight size={13} className="text-affirm" /> : <MoveDownRight size={13} className="text-alert/80" />
}

/**
 * The biggest week-over-week drop (or weakest showing) becomes next week's focus.
 * Deterministic and honest — computed from the same numbers shown above it, no LLM
 * required, so the review works offline and never hallucinates.
 */
function suggestFocus(current: WeekSnapshot, previous: WeekSnapshot): string {
  const drops = PILLARS.map((p) => {
    const now = current[p.key]
    const prev = previous[p.key]
    const rel = prev > 0 ? (now - prev) / prev : now > 0 ? 1 : 0
    return { ...p, rel, now, prev }
  }).sort((a, b) => a.rel - b.rel)

  const worst = drops[0]
  if (worst && worst.rel < -0.25 && worst.prev > 0) {
    return `${worst.label} dropped ${Math.round(Math.abs(worst.rel) * 100)}% vs last week (${worst.fmt(worst.prev)} → ${worst.fmt(worst.now)}). Make ${worst.focus} the first block you protect next week.`
  }
  if (current.schedulePct < 60) {
    return `Schedule completion is at ${current.schedulePct}%. Fewer blocks, fully kept, beats a full plan half-done — trim next week's schedule to what you'll actually execute.`
  }
  return 'No pillar collapsed this week. Pick the goal closest to a milestone and give it the extra block next week.'
}

/**
 * GitHub-style consistency heatmap: 13 weeks of schedule completion, one cell per
 * day. The point is the shape — streaks and gaps visible at a glance, the
 * discipline pillar made physical.
 */
function ConsistencyHeatmap() {
  const s = useStore()
  const today = todayISO()
  const dates = lastNDates(13 * 7)
  // pad so columns align Monday-first
  const firstWd = weekdayOf(new Date(dates[0] + 'T12:00:00'))
  const cells: (string | null)[] = [...Array.from({ length: firstWd }, () => null), ...dates]
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  const colorFor = (date: string | null): string => {
    if (!date || date > today) return 'transparent'
    const wd = weekdayOf(new Date(date + 'T12:00:00'))
    const p = dayProgress(s, date, wd)
    if (p.total === 0) return 'rgba(255,255,255,0.04)'
    if (p.pct === 0) return 'rgba(255,255,255,0.07)'
    if (p.pct < 40) return 'rgba(93,211,158,0.25)'
    if (p.pct < 80) return 'rgba(93,211,158,0.55)'
    return 'rgba(93,211,158,0.95)'
  }

  return (
    <Panel>
      <HudLabel>
        <Flame size={11} className="text-affirm" /> Consistency — 13 weeks of schedule execution
      </HudLabel>
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1" style={{ minWidth: 13 * 16 }}>
          {weeks.map((col, i) => (
            <div key={i} className="flex flex-col gap-1">
              {col.map((date, j) => (
                <div
                  key={j}
                  title={date ?? undefined}
                  className="h-3 w-3 rounded-[3px]"
                  style={{ background: colorFor(date) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-fog">
        less
        {['rgba(255,255,255,0.07)', 'rgba(93,211,158,0.25)', 'rgba(93,211,158,0.55)', 'rgba(93,211,158,0.95)'].map((c) => (
          <span key={c} className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />
        ))}
        more
      </div>
    </Panel>
  )
}

/** The Sunday ritual: what actually happened this week, against last week, and where the focus goes next. */
export function Review() {
  const s = useStore()
  const { current, previous } = weeklyReview(s)
  const st = streaks(s)
  const anything = PILLARS.some((p) => current[p.key] > 0 || previous[p.key] > 0)

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="h-lumen text-3xl font-bold tracking-wide">WEEKLY REVIEW</h1>
          <p className="mt-1 text-sm text-haze">What actually happened — this week against last, no memory bias.</p>
        </div>
        <div className="flex gap-2.5">
          <StatTile label="Check-in streak" value={st.checkin} sub="days" accent="text-signal" />
          <StatTile label="Reading streak" value={st.reading} sub="days ≥ 15m" accent="text-arc" />
        </div>
      </header>

      <Panel className="lit">
        <HudLabel>
          <CalendarCheck size={11} className="text-signal" /> This week vs last
        </HudLabel>
        {anything ? (
          <div className="space-y-1">
            {PILLARS.map((p) => {
              const now = current[p.key]
              const prev = previous[p.key]
              return (
                <div key={p.key} className="flex items-center justify-between rounded-lg px-2 py-1.5 odd:bg-black/20">
                  <span className="text-sm text-haze">{p.label}</span>
                  <span className="flex items-center gap-2.5">
                    <span className="num text-xs text-fog">{p.fmt(prev)}</span>
                    <Delta now={now} prev={prev} />
                    <span className="num w-16 text-right text-sm font-semibold text-ice">{p.fmt(now)}</span>
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <Empty>Nothing logged yet this week or last — the review builds itself from what you log.</Empty>
        )}
        {anything && (
          <p className="mt-3 border-t border-edge pt-3 text-sm leading-relaxed text-steel">
            <span className="hud-label !mb-1 block !text-[8px] text-affirm">Focus next week</span>
            {suggestFocus(current, previous)}
          </p>
        )}
      </Panel>

      <ConsistencyHeatmap />

      <p className="px-1 text-xs text-fog">
        Want the deeper cut? Ask Jarvis: <span className="text-haze">“review my week”</span> — he sees these same numbers plus your goals and
        knowledge.
      </p>
    </div>
  )
}
