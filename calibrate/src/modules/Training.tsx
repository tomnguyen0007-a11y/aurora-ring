import { CheckCircle2, Footprints, Plus, Sparkles, Trash2, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { PhotoGallery } from '../components/PhotoGallery'
import { Bars, Empty, HudLabel, InlineEdit, Panel, Sparkline, StatTile } from '../components/ui'
import { fmtDateShort, todayISO, WEEKDAY_NAMES, weekdayOf } from '../lib/dates'
import { exerciseInsight, runMonthlySeries, trainingMonthlySeries, workoutsThisWeek } from '../lib/stats'
import { ollieWorkouts } from '../store/seed'
import { useStore } from '../store/store'

/** parse "8-10", "10", "8-12/leg" → [low, high] */
function parseReps(reps: string): [number, number] {
  const nums = reps.match(/\d+/g)?.map(Number) ?? [8, 12]
  return nums.length >= 2 ? [nums[0], nums[1]] : [nums[0], nums[0]]
}

function ExerciseCoach({ exerciseId, reps }: { exerciseId: string; reps: string }) {
  const s = useStore()
  const [lo, hi] = parseReps(reps)
  const ins = exerciseInsight(s, exerciseId, lo, hi)
  if (!ins.last) return null
  return (
    <div className="mt-2.5 rounded-lg border border-arc/20 bg-arc/[0.04] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <TrendingUp size={11} className="text-arc" />
        <span className="hud-label !mb-0 !text-[8px] text-arc">Overload Coach</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="num text-base font-bold text-ice">{ins.best?.e1rm ?? '—'}<span className="text-[10px] text-fog">kg</span></div>
            <div className="hud-label !mb-0 !text-[7px]">Est 1RM</div>
          </div>
          <div>
            <div className="num text-base font-bold text-ice">{ins.best ? `${ins.best.weight}×${ins.best.reps}` : '—'}</div>
            <div className="hud-label !mb-0 !text-[7px]">Best Set</div>
          </div>
          <div>
            <div className="num text-base font-bold text-ice">{ins.sessions}</div>
            <div className="hud-label !mb-0 !text-[7px]">Sessions</div>
          </div>
        </div>
        {ins.trend.length > 1 && <Sparkline points={ins.trend} width={90} height={30} color="var(--color-arc)" />}
      </div>
      <p className="mt-2 text-xs leading-snug text-steel">{ins.suggestion}</p>
    </div>
  )
}

export function Training() {
  const s = useStore()
  const date = todayISO()
  const wd = weekdayOf()
  const [activeId, setActiveId] = useState(
    () => s.workouts.find((w) => w.weekday === wd)?.id ?? s.workouts[0]?.id ?? '',
  )
  const workout = s.workouts.find((w) => w.id === activeId)
  const log = s.workoutLogs.find((l) => l.date === date && l.workoutId === activeId)
  const wk = workoutsThisWeek(s)

  // run form
  const [runMin, setRunMin] = useState('45')
  const [runKm, setRunKm] = useState('')
  const [runHr, setRunHr] = useState('')

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="h-lumen text-3xl font-bold tracking-wide">TRAINING</h1>
          <p className="mt-1 text-sm text-haze">The strategic split: Tue Push · Wed Pull · Fri Legs · Sat Upper. Thu is engine work.</p>
        </div>
        <StatTile label="This week" value={`${wk.done}/${wk.planned}`} sub="sessions complete" accent="text-signal" />
      </header>

      <PhotoGallery category="training" />

      <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1">
        {s.workouts.map((w) => (
          <button
            key={w.id}
            onClick={() => setActiveId(w.id)}
            className={`shrink-0 rounded-xl border px-3.5 py-2 text-left transition-all ${
              activeId === w.id ? 'border-signal/50 bg-signal/10' : 'border-edge bg-black/20 hover:border-edge-strong'
            }`}
          >
            <div className={`font-display text-sm font-bold tracking-wide ${activeId === w.id ? 'text-signal' : 'text-ice'}`}>
              {w.name}
            </div>
            <div className="hud-label !mb-0 !text-[8px]">{WEEKDAY_NAMES[w.weekday]}</div>
          </button>
        ))}
        {!s.workouts.some((w) => w.id.startsWith('o-')) && (
          <button
            onClick={() => ollieWorkouts.forEach((w) => useStore.setState((st) => ({ workouts: [...st.workouts, w] })))}
            className="shrink-0 rounded-xl border border-dashed border-arc/40 px-3.5 py-2 text-left text-arc transition-all hover:bg-arc/5"
          >
            <div className="flex items-center gap-1.5 font-display text-sm font-bold tracking-wide">
              <Sparkles size={13} /> Add Ollie's Hybrid
            </div>
            <div className="hud-label !mb-0 !text-[8px] text-arc/70">5 workouts A–E</div>
          </button>
        )}
      </div>

      {workout && (
        <Panel glow={workout.weekday === wd}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <HudLabel className="!mb-0">
              <InlineEdit
                value={workout.name}
                label={`Rename workout ${workout.name}`}
                onSave={(v) => s.updateWorkout(workout.id, { name: v })}
              />
              — {workout.weekday === wd ? "today's session" : WEEKDAY_NAMES[workout.weekday]}
            </HudLabel>
            <button
              className={`btn !py-1.5 ${log?.completed ? '!border-affirm/60 !bg-affirm/15 !text-affirm' : 'btn-signal'}`}
              onClick={() => s.setWorkoutDone(date, workout.id, !log?.completed)}
            >
              <CheckCircle2 size={15} />
              {log?.completed ? 'Completed' : 'Mark done'}
            </button>
          </div>

          <div className="space-y-3">
            {workout.exercises.map((ex) => {
              const sets = log?.entries[ex.id] ?? Array.from({ length: ex.sets }, () => ({ weight: null, reps: null }))
              return (
                <div key={ex.id} className="rounded-xl border border-edge bg-black/20 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 font-display text-[0.95rem] font-semibold tracking-wide text-ice">
                      <InlineEdit value={ex.name} label={`Rename ${ex.name}`} onSave={(v) => s.updateExercise(workout.id, ex.id, { name: v })} />
                    </span>
                    <span className="num flex shrink-0 items-center text-xs text-signal">
                      <InlineEdit
                        num
                        value={String(ex.sets)}
                        label={`Edit sets for ${ex.name}`}
                        onSave={(v) => s.updateExercise(workout.id, ex.id, { sets: Math.max(1, parseInt(v) || ex.sets) })}
                      />
                      ×
                      <InlineEdit num value={ex.reps} label={`Edit reps for ${ex.name}`} onSave={(v) => s.updateExercise(workout.id, ex.id, { reps: v })} />
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-fog">
                    <InlineEdit
                      value={ex.cue ?? ''}
                      placeholder="add a cue…"
                      label={`Edit cue for ${ex.name}`}
                      onSave={(v) => s.updateExercise(workout.id, ex.id, { cue: v })}
                    />
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {sets.map((st, i) => (
                      <div key={i} className="flex items-center gap-1 rounded-lg border border-edge bg-black/30 px-1.5 py-1">
                        <span className="hud-label !mb-0 !text-[8px] px-0.5">S{i + 1}</span>
                        <input
                          className="num w-12 bg-transparent text-center text-xs text-ice outline-none placeholder:text-fog/60"
                          placeholder="kg"
                          inputMode="decimal"
                          aria-label={`${ex.name} set ${i + 1} weight`}
                          value={st.weight ?? ''}
                          onChange={(e) =>
                            s.logSet(date, workout.id, ex.id, i, { weight: e.target.value ? parseFloat(e.target.value) : null })
                          }
                        />
                        <span className="text-fog/50">×</span>
                        <input
                          className="num w-9 bg-transparent text-center text-xs text-ice outline-none placeholder:text-fog/60"
                          placeholder="reps"
                          inputMode="numeric"
                          aria-label={`${ex.name} set ${i + 1} reps`}
                          value={st.reps ?? ''}
                          onChange={(e) =>
                            s.logSet(date, workout.id, ex.id, i, { reps: e.target.value ? parseInt(e.target.value) : null })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <ExerciseCoach exerciseId={ex.id} reps={ex.reps} />
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      <Panel>
        <HudLabel>
          <Footprints size={11} className="text-affirm" /> Aerobic Engine — Thursday Protocol
        </HudLabel>
        <p className="mb-3 text-xs text-fog">45 min continuous · Zone 2 (60–70% max HR) · conversational pace · nasal breathing.</p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const minutes = parseInt(runMin)
            if (!minutes) return
            s.addRun({
              date,
              minutes,
              distanceKm: runKm ? parseFloat(runKm) : null,
              avgHr: runHr ? parseInt(runHr) : null,
              notes: '',
            })
            setRunKm('')
            setRunHr('')
          }}
        >
          <label className="block">
            <span className="hud-label !mb-1 !text-[8px]">Minutes</span>
            <input className="field num w-20" inputMode="numeric" value={runMin} onChange={(e) => setRunMin(e.target.value)} />
          </label>
          <label className="block">
            <span className="hud-label !mb-1 !text-[8px]">km</span>
            <input className="field num w-20" inputMode="decimal" placeholder="—" value={runKm} onChange={(e) => setRunKm(e.target.value)} />
          </label>
          <label className="block">
            <span className="hud-label !mb-1 !text-[8px]">Avg HR</span>
            <input className="field num w-20" inputMode="numeric" placeholder="—" value={runHr} onChange={(e) => setRunHr(e.target.value)} />
          </label>
          <button className="btn btn-signal" type="submit">
            <Plus size={15} /> Log run
          </button>
        </form>

        {s.hevySessions.length > 0 && (
          <div className="mt-4 border-t border-edge pt-4">
            <HudLabel>Hevy — imported sessions</HudLabel>
            <ul className="space-y-1.5">
              {s.hevySessions.slice(0, 6).map((h) => (
                <li key={h.id} className="flex items-center justify-between rounded-lg bg-black/25 px-3 py-2 text-sm">
                  <span className="num text-xs text-fog">{fmtDateShort(h.date)}</span>
                  <span className="min-w-0 flex-1 truncate px-3 text-ice">{h.title}</span>
                  <span className="num text-xs text-arc">
                    {h.sets} sets · {Math.round(h.volumeKg).toLocaleString()}kg
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {s.runLogs.length ? (
          <ul className="mt-4 space-y-1.5">
            {s.runLogs.slice(0, 8).map((r) => (
              <li key={r.id} className="group flex items-center justify-between rounded-lg bg-black/25 px-3 py-2 text-sm">
                <span className="num text-xs text-fog">{fmtDateShort(r.date)}</span>
                <span className="num text-ice">
                  {r.minutes}min{r.distanceKm ? ` · ${r.distanceKm}km` : ''}
                  {r.avgHr ? ` · ${r.avgHr}bpm` : ''}
                </span>
                <button
                  className="transition-opacity focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                  aria-label="Delete run"
                  onClick={() => s.removeRun(r.id)}
                >
                  <Trash2 size={14} className="text-alert/70" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <Empty>No runs logged yet. Thursday 16:15 is engine time.</Empty>
          </div>
        )}
      </Panel>

      <TrainingHistory />
    </div>
  )
}

/** Month-by-month training volume — the consistency record behind the physique goal. */
function TrainingHistory() {
  const s = useStore()
  const workouts = trainingMonthlySeries(s)
  const runs = runMonthlySeries(s)
  const anyWorkouts = workouts.some((m) => m.value > 0)
  const anyRuns = runs.some((m) => m.value > 0)
  if (!anyWorkouts && !anyRuns) return null
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {anyWorkouts && (
        <Panel>
          <HudLabel>History — workouts per month</HudLabel>
          <Bars data={workouts} color="var(--color-signal)" height={110} />
        </Panel>
      )}
      {anyRuns && (
        <Panel>
          <HudLabel>History — run km per month</HudLabel>
          <Bars data={runs} color="var(--color-affirm)" unit="km" height={110} />
        </Panel>
      )}
    </div>
  )
}
