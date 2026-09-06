import { Icon } from '../components/icons'
import { Empty, Eyebrow, Page, Section, Stat } from '../components/ui'
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

/** Direction only — monochrome, so the arrow carries the meaning, not a colour. */
function Delta({ now, prev }: { now: number; prev: number }) {
  if (now === prev) return <span className="num w-4 text-center text-micro text-ghost">—</span>
  return (
    <span className={`num w-4 text-center text-micro ${now > prev ? 'text-paper' : 'text-faint'}`}>
      {now > prev ? '▲' : '▼'}
    </span>
  )
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
 * 13 weeks of schedule completion, one cell per day. The point is the shape —
 * streaks and gaps visible at a glance. Intensity is alpha, never hue.
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

  const STEPS = ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0.58)', 'rgba(255,255,255,0.92)']

  const shadeFor = (date: string | null): string => {
    if (!date || date > today) return 'transparent'
    const wd = weekdayOf(new Date(date + 'T12:00:00'))
    const p = dayProgress(s, date, wd)
    if (p.total === 0) return 'rgba(255,255,255,0.04)'
    if (p.pct === 0) return STEPS[0]
    if (p.pct < 40) return STEPS[1]
    if (p.pct < 80) return STEPS[2]
    return STEPS[3]
  }

  return (
    <Section label="Consistency — 13 weeks of schedule execution">
      <div className="no-bar overflow-x-auto pb-1">
        <div className="flex gap-1" style={{ minWidth: 13 * 16 }}>
          {weeks.map((col, i) => (
            <div key={i} className="flex flex-col gap-1">
              {col.map((date, j) => (
                <div key={j} title={date ?? undefined} className="h-3 w-3" style={{ background: shadeFor(date) }} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-micro text-faint">
        less
        {STEPS.map((c) => (
          <span key={c} className="inline-block h-2.5 w-2.5" style={{ background: c }} />
        ))}
        more
      </div>
    </Section>
  )
}

/** The Sunday ritual: what happened this week, against last, and where focus goes next. */
export function Review({ label }: { label: string }) {
  const s = useStore()
  const { current, previous } = weeklyReview(s)
  const st = streaks(s)
  const anything = PILLARS.some((p) => current[p.key] > 0 || previous[p.key] > 0)

  return (
    <Page title={label} lede="What actually happened — this week against last, no memory bias.">
      <div className="mb-10 grid grid-cols-2 gap-x-10 border-b border-line pb-6 sm:max-w-md">
        <Stat label="Check-in streak" value={st.checkin} sub="days" strong />
        <Stat label="Reading streak" value={st.reading} sub="days ≥ 15m" strong />
      </div>

      <Section label="This week vs last">
        {anything ? (
          <div>
            {PILLARS.map((p) => {
              const now = current[p.key]
              const prev = previous[p.key]
              return (
                <div key={p.key} className="flex items-center justify-between border-b border-line py-3 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate text-body text-mute">{p.label}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="num text-micro text-faint">{p.fmt(prev)}</span>
                    <Delta now={now} prev={prev} />
                    <span className="num w-20 text-right text-body text-paper">{p.fmt(now)}</span>
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <Empty>Nothing logged yet this week or last — the review builds itself from what you log.</Empty>
        )}
        {anything && (
          <div className="mt-6 border-t border-line pt-5">
            <Eyebrow className="mb-2">Focus next week</Eyebrow>
            <p className="max-w-2xl text-lede leading-relaxed text-mute">{suggestFocus(current, previous)}</p>
          </div>
        )}
      </Section>

      <ConsistencyHeatmap />

      <p className="flex items-center gap-2 text-micro text-faint">
        <Icon name="jarvis" size={12} />
        Deeper cut: ask Jarvis <span className="text-mute">“review my week”</span> — he sees these numbers plus your goals
        and knowledge.
      </p>
    </Page>
  )
}
