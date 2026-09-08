import { useEffect, useMemo, useState } from 'react'
import { Icon, type GlyphName } from '../components/icons'
import { Bar, DangerBtn, Dot, Empty, Eyebrow, InlineText, NumCell, Reorder, Ring, Section, Track } from '../components/ui'
import { nowMinutes, todayISO, toMinutes, weekdayOf } from '../lib/dates'
import { dayScore, habitHit, habitStreak, habitValue, isDerived, nextBestHabit } from '../lib/habits'
import { computeNudges, updateBadge } from '../lib/notify'
import { quoteOfDay } from '../lib/quote'
import { macrosForDate } from '../lib/stats'
import { DAY_CODENAMES } from '../store/seed'
import { useStore } from '../store/store'
import { CheckInCard } from './CheckInCard'

/* ════════════════════════════════════════════════════════════════════
   TODAY
   Asymmetric by design: the left rail holds the numbers and stays put,
   the right column is the feed you actually work through. One focal
   readout, then hairlines all the way down.
   ════════════════════════════════════════════════════════════════════ */

/** The six actions worth doing without navigating anywhere. */
function QuickLog() {
  const s = useStore()
  const date = todayISO()
  const workout = s.workouts.find((w) => w.weekday === weekdayOf())
  const workoutDone = s.workoutLogs.some((l) => l.date === date && l.workoutId === workout?.id && l.completed)
  const [flash, setFlash] = useState<string | null>(null)

  const fire = (key: string, fn: () => void) => () => {
    fn()
    setFlash(key)
    setTimeout(() => setFlash((f) => (f === key ? null : f)), 900)
  }

  const actions: { key: string; label: string; glyph: GlyphName; run: () => void; done?: boolean }[] = [
    { key: 'w', label: '+500ml', glyph: 'water', run: () => s.addWater(date, 500) },
    { key: 'r', label: '+15 read', glyph: 'books', run: () => s.logReading(date, 15) },
    {
      key: 's',
      label: workoutDone ? 'Session done' : 'Mark session',
      glyph: 'training',
      run: () => workout && s.setWorkoutDone(date, workout.id, !workoutDone),
      done: workoutDone,
    },
    {
      key: 'g',
      label: '30m golf',
      glyph: 'golf',
      run: () => s.addGolfSession({ date, category: s.golfCategories[0]?.id ?? 'putting', minutes: 30, notes: '' }),
    },
    {
      key: 'b',
      label: 'Blackout',
      glyph: 'recovery',
      run: () =>
        s.saveCheckIn({
          ...(s.checkIns[date] ?? { date, weightKg: null, sleepH: null, sleepQuality: null, energy: null, notes: '' }),
          date,
          blackoutOnTime: true,
        }),
    },
    { key: 'j', label: 'Ask Jarvis', glyph: 'jarvis', run: () => s.setView('jarvis') },
  ]

  return (
    <div className="grid grid-cols-3 border-t border-line sm:grid-cols-6">
      {actions.map((a) => (
        <button
          key={a.key}
          onClick={fire(a.key, a.run)}
          className={`flex flex-col items-center gap-2 border-b border-r border-line py-4 transition-colors last:border-r-0 sm:border-b-0 ${
            flash === a.key || a.done ? 'text-paper' : 'text-dim hover:text-paper'
          }`}
        >
          <Icon name={a.glyph} size={17} />
          <span className="text-micro">{flash === a.key ? 'Logged' : a.label}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * A standard, editable where you look at it. Renaming, retargeting, reordering
 * and deleting all happen on this row — the previous build hid them in Settings,
 * which is why the placeholder rows felt stuck.
 */
function HabitRow({ habitId, editing }: { habitId: string; editing: boolean }) {
  const s = useStore()
  const date = todayISO()
  const habit = s.habits.find((h) => h.id === habitId)
  if (!habit) return null

  const value = habitValue(s, date, habit)
  const hit = habitHit(s, date, habit)
  const streak = habitStreak(s, habit)
  const pct = habit.target ? Math.min(100, (value / habit.target) * 100) : 0
  const derived = isDerived(habit.id)
  const idx = s.habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order).findIndex((h) => h.id === habit.id)
  const count = s.habits.filter((h) => !h.archived).length

  return (
    <div className="border-b border-line py-3.5 last:border-b-0">
      <div className="flex items-center gap-3.5">
        {habit.kind === 'boolean' && !derived ? (
          <Dot checked={hit} onToggle={() => s.toggleHabit(date, habit.id)} label={habit.label} size={17} />
        ) : (
          <span className={`block h-1.5 w-1.5 shrink-0 ${hit ? 'bg-paper' : 'bg-ghost'}`} />
        )}

        <span className="min-w-0 flex-1">
          {editing ? (
            <InlineText
              value={habit.label}
              onChange={(v) => s.updateHabit(habit.id, { label: v })}
              ariaLabel={`Rename ${habit.label}`}
              className={`w-full text-body ${hit ? 'text-paper' : 'text-mute'}`}
            />
          ) : (
            <span className={`block truncate text-body ${hit ? 'text-paper' : 'text-mute'}`}>{habit.label}</span>
          )}
        </span>

        {habit.kind === 'count' ? (
          editing ? (
            <span className="num flex shrink-0 items-baseline gap-0.5 text-body text-paper">
              <NumCell
                value={habit.target}
                onChange={(v) => s.updateHabit(habit.id, { target: Math.max(1, v ?? 1) })}
                ariaLabel={`Target for ${habit.label}`}
                width="w-12"
              />
              <InlineText
                value={habit.unit}
                onChange={(v) => s.updateHabit(habit.id, { unit: v })}
                ariaLabel={`Unit for ${habit.label}`}
                placeholder="unit"
                className="w-10 text-micro text-faint"
              />
            </span>
          ) : (
            <span className="num shrink-0 text-body text-paper">
              {Math.round(value)}
              <span className="text-faint">
                /{habit.target}
                {habit.unit}
              </span>
            </span>
          )
        ) : (
          <span className="num shrink-0 text-micro text-faint">{hit ? 'done' : '—'}</span>
        )}

        <span className="num w-8 shrink-0 text-right text-micro text-faint" title={`${streak} day streak`}>
          {streak}d
        </span>

        {editing && (
          <span className="flex shrink-0 items-center gap-1">
            <Reorder
              onUp={() => s.moveHabit(habit.id, -1)}
              onDown={() => s.moveHabit(habit.id, 1)}
              first={idx === 0}
              last={idx === count - 1}
            />
            <DangerBtn onConfirm={() => s.removeHabit(habit.id)} label={`Delete ${habit.label}`} />
          </span>
        )}
      </div>
      {habit.kind === 'count' && <Bar pct={pct} className="mt-3" />}
    </div>
  )
}

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
  const current = blocks.find((b) => toMinutes(b.start) <= now && now < toMinutes(b.end || '24:00'))
  const next = blocks.find((b) => toMinutes(b.start) > now)

  const score = dayScore(s)
  const macros = macrosForDate(s, date)
  const quote = quoteOfDay(s.mantras)
  const focus = nextBestHabit(s, date)
  const [editing, setEditing] = useState(false)
  const nudges = useMemo(
    () => computeNudges(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.water, s.foodLogs, s.checkIns, s.workoutLogs],
  )

  useEffect(() => {
    updateBadge()
  }, [s.habitLog, s.water, s.foodLogs, s.checkIns])

  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' }).toUpperCase()

  return (
    <div className="animate-fade">
      <header className="mb-8">
        <Eyebrow className="mb-4">
          {dateLabel} <span className="mx-1.5 text-ghost">/</span> {DAY_CODENAMES[wd]}
        </Eyebrow>
        <div className="sm:flex sm:items-end sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex items-baseline gap-4">
                <span className="readout glow text-[3.25rem] leading-[0.9] sm:text-[4.25rem]">
                  {score.done}
                  <span className="text-ghost">/{score.total}</span>
                </span>
                <span className="eyebrow pb-2">banked</span>
              </div>
              {/* On a phone the ring rides the readout line, so the prose below runs full width. */}
              <div className="shrink-0 self-center sm:hidden">
                <Ring pct={score.pct} size={62} focal>
                  <span className="readout text-micro">{score.pct}%</span>
                </Ring>
              </div>
            </div>
            <p className="mt-3 text-body text-mute">
              {current ? (
                <>
                  Now <span className="text-paper">{current.title}</span>
                  {next && (
                    <span className="text-faint">
                      {' '}
                      · then {next.title} at {next.start}
                    </span>
                  )}
                </>
              ) : next ? (
                <>
                  Next <span className="text-paper">{next.title}</span> <span className="num text-faint">{next.start}</span>
                </>
              ) : (
                'Day clear. Blackout at 22:30.'
              )}
            </p>
            {focus && (
              <p className="mt-1.5 text-body text-faint">
                Closest win: <span className="text-mute">{focus.label}</span>
                {focus.kind === 'count' && (
                  <span className="num">
                    {' '}
                    — {Math.max(0, focus.target - habitValue(s, date, focus))}
                    {focus.unit} short
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="hidden shrink-0 sm:block">
            <Ring pct={score.pct} size={84} focal>
              <span className="readout text-body">{score.pct}%</span>
            </Ring>
          </div>
        </div>
      </header>

      <QuickLog />

      <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-14 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        {/* Left rail: the two numbers that decide the day. */}
        <div className="space-y-14 lg:sticky lg:top-2 lg:self-start">
          <Section
            label="Standards"
            aside={
              <button className="btn btn-sm" onClick={() => setEditing(!editing)}>
                {editing ? 'Done' : 'Edit'}
              </button>
            }
          >
            <div>
              {s.habits
                .filter((h) => !h.archived)
                .sort((a, b) => a.order - b.order)
                .map((h) => (
                  <HabitRow key={h.id} habitId={h.id} editing={editing} />
                ))}
            </div>
            {editing && (
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="btn btn-sm" onClick={() => s.addHabit('Untitled', 'boolean')}>
                  + Check-off
                </button>
                <button className="btn btn-sm" onClick={() => s.addHabit('Untitled', 'count', 1, 'x')}>
                  + Counter
                </button>
              </div>
            )}
          </Section>

          <Section label="Fuel">
            <Track label="Calories" value={macros.kcal} min={s.macros.kcal[0]} max={s.macros.kcal[1]} />
            <Track label="Protein" value={macros.protein} min={s.macros.protein[0]} max={s.macros.protein[1]} unit="g" />
            <div className="mt-6 flex items-center justify-between border-t border-line pt-5">
              <span className="text-body text-mute">Water</span>
              <div className="flex items-center gap-4">
                <span className="num text-body text-paper">
                  {(macros.water / 1000).toFixed(1)}
                  <span className="text-faint">/{(s.macros.waterMl / 1000).toFixed(1)}L</span>
                </span>
                <button className="btn btn-sm" onClick={() => s.addWater(date, 500)}>
                  +500
                </button>
              </div>
            </div>
          </Section>
        </div>

        {/* Right: the day itself. */}
        <div className="space-y-14">
          {nudges.length > 0 && (
            <ul className="space-y-2.5">
              {nudges.map((n) => (
                <li key={n.id} className="flex items-center gap-3">
                  <span className={`block h-1 w-1 shrink-0 ${n.urgent ? 'bg-paper' : 'bg-ghost'}`} />
                  <span className={`min-w-0 flex-1 text-body ${n.urgent ? 'text-paper' : 'text-mute'}`}>{n.text}</span>
                  {n.action && (
                    <button className="btn btn-sm shrink-0" onClick={() => s.setView(n.action!.sectionId)}>
                      {n.action.label}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <Section
            label="Today's plan"
            aside={
              <button className="btn btn-sm" onClick={() => s.setView('schedule')}>
                Edit
              </button>
            }
          >
            {blocks.length ? (
              <ol>
                {blocks.map((b) => {
                  const active = current?.id === b.id
                  const done = !!checks[b.id]
                  const past = toMinutes(b.end || '24:00') <= now
                  return (
                    <li
                      key={b.id}
                      className={`flex items-start gap-4 border-b border-line py-3.5 last:border-b-0 ${done ? 'opacity-45' : past ? 'opacity-65' : ''}`}
                    >
                      <span className={`mt-1.5 block h-8 w-px shrink-0 ${active ? 'bg-paper' : 'bg-line-2'}`} />
                      <span className="num w-11 shrink-0 pt-0.5 text-micro leading-relaxed text-faint">
                        {b.start}
                        {b.end && (
                          <>
                            <br />
                            {b.end}
                          </>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-body ${done ? 'text-faint line-through' : 'text-paper'}`}>
                          {b.title}
                          {active && <span className="ml-2 inline-block h-1 w-1 animate-breathe bg-paper align-middle" />}
                        </span>
                        {b.detail && <span className="mt-0.5 block truncate text-micro text-faint">{b.detail}</span>}
                      </span>
                      <Dot checked={done} onToggle={() => s.toggleBlock(date, b.id)} label={b.title} size={17} />
                    </li>
                  )
                })}
              </ol>
            ) : (
              <Empty>Nothing scheduled today. Build the day in Blueprint.</Empty>
            )}
          </Section>

          {quote && (
            <button onClick={() => s.setView('mindset')} className="block w-full py-2 text-left">
              <p className="max-w-xl text-head font-normal leading-snug text-paper">{quote.text}</p>
              {quote.author && <p className="mt-3.5 text-body text-faint">{quote.author}</p>}
            </button>
          )}

          <Section label="Close out">
            <CheckInCard />
          </Section>
        </div>
      </div>
    </div>
  )
}
