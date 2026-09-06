import { useState } from 'react'
import { Icon } from '../components/icons'
import { PhotoGallery } from '../components/PhotoGallery'
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
  Stat,
  Tools,
} from '../components/ui'
import { fmtDateShort, todayISO, WEEKDAY_NAMES, weekdayOf } from '../lib/dates'
import { exerciseInsight, runMonthlySeries, trainingMonthlySeries, workoutsThisWeek } from '../lib/stats'
import { useStore } from '../store/store'
import type { Weekday } from '../store/types'

/* Training is where flexibility matters most: every name, rep range, set
   count and cue is an input, and the split itself can be rebuilt from here. */

/** parse "8-10", "10", "8-12/leg" → [low, high] */
function parseReps(reps: string): [number, number] {
  const nums = reps.match(/\d+/g)?.map(Number) ?? [8, 12]
  return nums.length >= 2 ? [nums[0], nums[1]] : [nums[0], nums[0]]
}

/** Progressive-overload readout for one lift. Hairline rule, no tinted card. */
function OverloadCoach({ exerciseId, reps }: { exerciseId: string; reps: string }) {
  const s = useStore()
  const [lo, hi] = parseReps(reps)
  const ins = exerciseInsight(s, exerciseId, lo, hi)
  if (!ins.last) return null
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-5">
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
          <div>
            <div className="num text-body text-paper">{ins.sessions}</div>
            <div className="eyebrow mt-1">Sessions</div>
          </div>
        </div>
        {ins.trend.length > 1 && <Spark points={ins.trend} width={80} height={26} />}
      </div>
      {/* main surfaced the suggestion at every width — keep it unconditional. */}
      <p className="mt-2 max-w-prose text-micro leading-relaxed text-faint">{ins.suggestion}</p>
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
          <InlineText
            value={ex.name}
            onChange={(v) => s.updateExercise(workout.id, ex.id, { name: v })}
            ariaLabel="Exercise name"
            className="t-head"
          />
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
            <InlineText
              value={ex.reps}
              onChange={(v) => s.updateExercise(workout.id, ex.id, { reps: v })}
              ariaLabel="Rep range"
              mono
              className="text-paper"
            />
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
