import { useState } from 'react'
import { Icon } from '../components/icons'
import { Empty, Eyebrow, IconBtn, Page, Section, Stat } from '../components/ui'
import { fmtHours, toISO, todayISO, weekdayOf } from '../lib/dates'
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

const STEPS = ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0.58)', 'rgba(255,255,255,0.92)']

/**
 * A month of schedule execution, laid out like a wall calendar — one square
 * per day, Monday first, intensity by completion. Alpha, never hue. Step
 * back through earlier months; the current month can't be skipped past.
 */
function MonthCalendar() {
  const s = useStore()
  const today = todayISO()
  const now = new Date()
  const [offset, setOffset] = useState(0) // months back from the current one
  const first = new Date(now.getFullYear(), now.getMonth() - offset, 1, 12)
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const lead = weekdayOf(first)
  const dates = Array.from({ length: daysIn }, (_, i) => toISO(new Date(first.getFullYear(), first.getMonth(), i + 1, 12)))
  const cells: (string | null)[] = [...Array.from({ length: lead }, () => null), ...dates]
  while (cells.length % 7) cells.push(null)

  const progress = (date: string) => dayProgress(s, date, weekdayOf(new Date(date + 'T12:00:00')))
  const step = (date: string): number | null => {
    if (date > today) return null
    const p = progress(date)
    if (p.total === 0) return null
    if (p.pct === 0) return 0
    if (p.pct < 40) return 1
    if (p.pct < 80) return 2
    return 3
  }

  // Month summary over days that had a plan and have happened.
  const planned = dates.filter((d) => d <= today && progress(d).total > 0)
  const kept = planned.filter((d) => progress(d).pct >= 80).length
  const avg = planned.length ? Math.round(planned.reduce((sum, d) => sum + progress(d).pct, 0) / planned.length) : 0
  const monthName = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <Section
      label="Consistency"
      aside={
        <>
          <IconBtn glyph="chevronLeft" label="Previous month" onClick={() => setOffset((o) => o + 1)} />
          <span className="num w-28 text-center text-label font-medium text-paper">{monthName}</span>
          <IconBtn glyph="chevronRight" label="Next month" onClick={() => setOffset((o) => o - 1)} disabled={offset === 0} />
        </>
      }
    >
      <div className="max-w-xl">
        <div className="mb-2 grid grid-cols-7 gap-1.5 sm:gap-2">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className="text-center text-micro font-medium text-faint">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="grid" aria-label={`Schedule execution, ${monthName}`}>
          {cells.map((date, i) => {
            if (!date) return <span key={i} className="aspect-square" aria-hidden="true" />
            const st = step(date)
            const p = progress(date)
            const isToday = date === today
            const future = date > today
            const bright = st !== null && st >= 2
            return (
              <div
                key={i}
                role="gridcell"
                title={future ? date : p.total ? `${date} · ${p.done}/${p.total} blocks · ${p.pct}%` : `${date} · nothing scheduled`}
                aria-label={future ? date : p.total ? `${date}, ${p.pct}% of schedule kept` : `${date}, nothing scheduled`}
                className={`relative flex aspect-square flex-col justify-between rounded-[4px] p-1.5 transition-colors sm:p-2 ${
                  isToday ? 'ring-1 ring-paper ring-offset-2 ring-offset-ink' : ''
                } ${future ? 'border border-dashed border-line' : ''}`}
                style={{ background: future ? 'transparent' : st === null ? 'rgba(255,255,255,0.035)' : STEPS[st] }}
              >
                <span
                  className={`num text-micro leading-none ${bright ? 'font-semibold text-black' : isToday ? 'font-semibold text-paper' : future ? 'text-ghost' : 'text-dim'}`}
                >
                  {Number(date.slice(8))}
                </span>
                {!future && p.total > 0 && (
                  <span className={`num hidden self-end text-[0.625rem] leading-none sm:block ${bright ? 'text-black/70' : 'text-faint'}`}>
                    {p.pct}%
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-micro text-faint">
          <span className="flex items-center gap-1.5">
            less
            {STEPS.map((c) => (
              <span key={c} className="inline-block h-3 w-3 rounded-[2px]" style={{ background: c }} />
            ))}
            more
          </span>
          {planned.length > 0 && (
            <span className="num">
              <span className="text-paper">{kept}</span>/{planned.length} days kept · avg {avg}%
            </span>
          )}
        </div>
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

      <MonthCalendar />

      <p className="flex items-center gap-2 text-micro text-faint">
        <Icon name="jarvis" size={12} />
        Deeper cut: ask Jarvis <span className="text-mute">“review my week”</span> — he sees these numbers plus your goals
        and knowledge.
      </p>
    </Page>
  )
}
