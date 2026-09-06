import { useState } from 'react'
import { Icon } from '../components/icons'
import {
  Chip,
  Cols,
  DangerBtn,
  Empty,
  Eyebrow,
  IconBtn,
  InlineText,
  NumCell,
  Page,
  Reorder,
  Scroller,
  Section,
  Spark,
  Tools,
} from '../components/ui'
import { fmtDateShort, todayISO, WEEKDAY_NAMES, weekdayOf } from '../lib/dates'
import { PhotoGallery } from '../components/PhotoGallery'
import { exerciseInsight, runMonthlySeries, trainingMonthlySeries, workoutsThisWeek } from '../lib/stats'
import { useStore } from '../store/store'
import type { Weekday } from '../store/types'

/* Training is where flexibility matters most: every name, rep range, set
   count and cue is an input, and the split itself can be rebuilt from here. */

function OverloadCoach({ exerciseId, reps }: { exerciseId: string; reps: string }) {
  const s = useStore()
  const nums = reps.match(/\d+/g)?.map(Number) ?? [8, 12]
  const ins = exerciseInsight(s, exerciseId, nums[0], nums[1] ?? nums[0])
  if (!ins.last) return null
  return (
    <div className="mt-3 flex items-center justify-between gap-5 border-t border-line pt-3">
      <div className="flex gap-7">
        <div>
          <div className="num text-body text-paper">
            {ins.best?.e1rm ?? '—'}
            <span className="text-micro text-faint">kg</span>
          </div>
          <div className="eyebrow mt-1">Est 1RM</div>
        </div>
        <div>
          <div className="num text-body text-paper">{ins.best ? `${ins.best.weight}×${ins.best.reps}` : '—'}</div>
          <div className="eyebrow mt-1">Best set</div>
        </div>
        <div className="hidden sm:block">
          <div className="num text-body text-paper">{ins.sessions}</div>
          <div className="eyebrow mt-1">Sessions</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {ins.trend.length > 1 && <Spark points={ins.trend} width={80} height={26} />}
        <p className="hidden max-w-[16rem] text-micro leading-relaxed text-faint lg:block">{ins.suggestion}</p>
      </div>
    </div>
  )
}

function ExerciseRow({ workoutId, exId, index, count }: { workoutId: string; exId: string; index: number; count: number }) {
  const s = useStore()
  const date = todayISO()
  const workout = s.workouts.find((w) => w.id === workoutId)
  const ex = workout?.exercises.find((e) => e.id === exId)
  const log = s.workoutLogs.find((l) => l.date === date && l.workoutId === workoutId)
  if (!workout || !ex) return null

  const sets = log?.entries[ex.id] ?? Array.from({ length: ex.sets }, () => ({ weight: null, reps: null }))

  return (
    <li className="group border-b border-line py-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="num w-5 shrink-0 pt-0.5 text-micro text-ghost">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0 flex-1">
          <InlineText value={ex.name} onChange={(v) => s.updateExercise(workout.id, ex.id, { name: v })} ariaLabel="Exercise name" className="t-head" />
          <InlineText
            value={ex.cue}
            onChange={(v) => s.updateExercise(workout.id, ex.id, { cue: v })}
            ariaLabel="Coaching cue"
            placeholder="Add a cue…"
            className="mt-1 text-micro text-faint"
          />
        </div>
        <span className="flex shrink-0 items-baseline gap-1 pt-0.5">
          <NumCell
            value={ex.sets}
            onChange={(v) => s.updateExercise(workout.id, ex.id, { sets: Math.max(1, Math.round(v ?? 1)) })}
            ariaLabel="Sets"
            width="w-6"
          />
          <span className="text-faint">×</span>
          <span className="w-12">
            <InlineText value={ex.reps} onChange={(v) => s.updateExercise(workout.id, ex.id, { reps: v })} ariaLabel="Rep range" mono className="text-paper" />
          </span>
        </span>
        <Tools>
          <Reorder
            onUp={() => s.moveExercise(workout.id, ex.id, -1)}
            onDown={() => s.moveExercise(workout.id, ex.id, 1)}
            first={index === 0}
            last={index === count - 1}
          />
          <DangerBtn onConfirm={() => s.removeExercise(workout.id, ex.id)} label={`Delete ${ex.name}`} />
        </Tools>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 pl-8">
        {sets.map((st, i) => (
          <span key={i} className="flex items-baseline gap-1">
            <span className="num text-micro text-ghost">S{i + 1}</span>
            <NumCell
              value={st.weight}
              onChange={(v) => s.logSet(date, workout.id, ex.id, i, { weight: v })}
              ariaLabel={`${ex.name} set ${i + 1} weight`}
              width="w-11"
              placeholder="kg"
            />
            <span className="text-ghost">×</span>
            <NumCell
              value={st.reps}
              onChange={(v) => s.logSet(date, workout.id, ex.id, i, { reps: v })}
              ariaLabel={`${ex.name} set ${i + 1} reps`}
              width="w-8"
              placeholder="r"
            />
          </span>
        ))}
      </div>

      <OverloadCoach exerciseId={ex.id} reps={ex.reps} />
    </li>
  )
}

export function Training({ label }: { label: string }) {
  const s = useStore()
  const date = todayISO()
  const wd = weekdayOf()
  const [activeId, setActiveId] = useState(() => s.workouts.find((w) => w.weekday === wd)?.id ?? s.workouts[0]?.id ?? '')
  const workout = s.workouts.find((w) => w.id === activeId) ?? s.workouts[0]
  const log = workout && s.workoutLogs.find((l) => l.date === date && l.workoutId === workout.id)
  const wk = workoutsThisWeek(s)

  const [runMin, setRunMin] = useState('45')
  const [runKm, setRunKm] = useState('')
  const [runHr, setRunHr] = useState('')

  return (
    <Page
      title={label}
      lede="The split is yours to rewrite — rename anything, reorder it, add or drop lifts. Nothing here is fixed."
      actions={
        <>
          <span className="num mr-2 text-body text-faint">
            {wk.done}/{wk.planned} this week
          </span>
          <button
            className="btn"
            onClick={() => {
              const id = s.addWorkout({ name: 'New session', weekday: wd })
              setActiveId(id)
            }}
          >
            <Icon name="plus" size={13} /> Session
          </button>
        </>
      }
    >
      <Section label="Split">
        <Scroller>
          {s.workouts.map((w) => (
            <Chip key={w.id} active={w.id === workout?.id} onClick={() => setActiveId(w.id)}>
              {w.name}
              <span className={`ml-2 ${w.id === workout?.id ? 'text-black/50' : 'text-ghost'}`}>{WEEKDAY_NAMES[w.weekday].slice(0, 3)}</span>
            </Chip>
          ))}
          {!s.workouts.some((w) => w.id.startsWith('o-')) && <Chip onClick={s.loadOllieLibrary}>+ Hybrid library</Chip>}
        </Scroller>
      </Section>

      {workout && (
        <Section
          label={workout.weekday === wd ? "Today's session" : WEEKDAY_NAMES[workout.weekday]}
          aside={
            <>
              <button
                className={`btn btn-sm ${log?.completed ? '' : 'btn-solid'}`}
                onClick={() => s.setWorkoutDone(date, workout.id, !log?.completed)}
              >
                {log?.completed ? 'Completed' : 'Mark done'}
              </button>
              <DangerBtn onConfirm={() => s.removeWorkout(workout.id)} label="Delete session" />
            </>
          }
        >
          <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
              <InlineText value={workout.name} onChange={(v) => s.updateWorkout(workout.id, { name: v })} ariaLabel="Session name" className="t-page" />
            </div>
            <label className="flex items-center gap-2">
              <Eyebrow>Day</Eyebrow>
              <select
                className="field !py-1 text-body"
                value={workout.weekday}
                onChange={(e) => s.updateWorkout(workout.id, { weekday: Number(e.target.value) as Weekday })}
                aria-label="Weekday"
              >
                {WEEKDAY_NAMES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {workout.exercises.length ? (
            <ul>
              {workout.exercises.map((ex, i) => (
                <ExerciseRow key={ex.id} workoutId={workout.id} exId={ex.id} index={i} count={workout.exercises.length} />
              ))}
            </ul>
          ) : (
            <Empty>No lifts yet. Add the first one below, or ask Jarvis to build the session.</Empty>
          )}

          <form
            className="mt-5 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const form = e.currentTarget
              const name = (form.elements.namedItem('exname') as HTMLInputElement).value.trim()
              const sets = parseInt((form.elements.namedItem('exsets') as HTMLInputElement).value) || 3
              const reps = (form.elements.namedItem('exreps') as HTMLInputElement).value.trim() || '8-12'
              if (!name) return
              s.addExercise(workout.id, { name, sets, reps, cue: '' })
              form.reset()
            }}
          >
            <input name="exname" className="field min-w-0 flex-1" placeholder="Add a lift…" aria-label="Exercise name" />
            <input name="exsets" className="field num w-14" placeholder="3" inputMode="numeric" aria-label="Sets" />
            <input name="exreps" className="field num w-20" placeholder="8-12" aria-label="Reps" />
            <button className="btn" type="submit">
              Add
            </button>
          </form>
        </Section>
      )}

      <Section label="Engine">
        <p className="mb-4 max-w-lg text-body text-faint">
          45 minutes continuous, Zone 2, conversational pace, nasal breathing. The aerobic base everything else rests on.
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const minutes = parseInt(runMin)
            if (!minutes) return
            s.addRun({
              date,
              minutes,
              distanceKm: runKm ? parseFloat(runKm.replace(',', '.')) : null,
              avgHr: runHr ? parseInt(runHr) : null,
              notes: '',
            })
            setRunKm('')
            setRunHr('')
          }}
        >
          <label className="block">
            <Eyebrow className="mb-1.5">Minutes</Eyebrow>
            <input className="field num w-20" inputMode="numeric" value={runMin} onChange={(e) => setRunMin(e.target.value)} aria-label="Minutes" />
          </label>
          <label className="block">
            <Eyebrow className="mb-1.5">km</Eyebrow>
            <input className="field num w-20" inputMode="decimal" placeholder="—" value={runKm} onChange={(e) => setRunKm(e.target.value)} aria-label="Distance" />
          </label>
          <label className="block">
            <Eyebrow className="mb-1.5">Avg HR</Eyebrow>
            <input className="field num w-20" inputMode="numeric" placeholder="—" value={runHr} onChange={(e) => setRunHr(e.target.value)} aria-label="Average heart rate" />
          </label>
          <button className="btn btn-solid" type="submit">
            Log run
          </button>
        </form>

        {s.runLogs.length > 0 && (
          <ul className="mt-6">
            {s.runLogs.slice(0, 8).map((r) => (
              <li key={r.id} className="group flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
                <input
                  type="date"
                  value={r.date}
                  onChange={(e) => s.updateRun(r.id, { date: e.target.value })}
                  aria-label="Run date"
                  className="field-line num w-[6.5rem] shrink-0 text-micro text-faint"
                />
                <span className="num flex flex-1 flex-wrap items-baseline gap-x-1 text-body text-paper">
                  <NumCell value={r.minutes} onChange={(v) => s.updateRun(r.id, { minutes: v ?? 0 })} ariaLabel="Run minutes" width="w-10" suffix="min" />
                  <span className="text-ghost">·</span>
                  <NumCell value={r.distanceKm ?? null} onChange={(v) => s.updateRun(r.id, { distanceKm: v })} ariaLabel="Run distance" width="w-12" suffix="km" />
                  <span className="text-ghost">·</span>
                  <NumCell value={r.avgHr ?? null} onChange={(v) => s.updateRun(r.id, { avgHr: v })} ariaLabel="Average heart rate" width="w-11" suffix="bpm" />
                </span>
                <Tools>
                  <DangerBtn onConfirm={() => s.removeRun(r.id)} label="Delete run" />
                </Tools>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label="History — per month">
        <Eyebrow className="mb-3">Sessions completed</Eyebrow>
        <Cols data={trainingMonthlySeries(s)} height={84} />
        {s.runLogs.length > 0 && (
          <div className="mt-8 border-t border-line pt-6">
            <Eyebrow className="mb-3">Running distance</Eyebrow>
            <Cols data={runMonthlySeries(s)} unit="km" height={84} />
          </div>
        )}
      </Section>

      <PhotoGallery category="training" />

      {s.hevySessions.length > 0 && (
        <Section label="Imported from Hevy" aside={<IconBtn glyph="link" label="Hevy settings" onClick={() => s.setView('settings')} />}>
          <ul>
            {s.hevySessions.slice(0, 8).map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
                <span className="num w-16 shrink-0 text-micro text-faint">{fmtDateShort(h.date)}</span>
                <span className="min-w-0 flex-1 truncate text-body text-paper">{h.title}</span>
                <span className="num shrink-0 text-micro text-faint">
                  {h.sets} sets · {Math.round(h.volumeKg).toLocaleString()} kg
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  )
}
