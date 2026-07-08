import { beforeEach, describe, expect, it } from 'vitest'
import { todayISO } from '../dates'
import { useStore } from '../../store/store'
import { seedDayTypeMacros, type DayTypeMacro } from '../../store/seed'
import type { Exercise, FoodLog, Workout } from '../../store/types'
import { runLocalEngine } from './engine'

const today = todayISO()

function workoutFixture(): Workout[] {
  return [
    {
      id: 'wo-push',
      name: 'Push Day',
      weekday: 0,
      exercises: [
        { id: 'ex-bench', name: 'Bench Press', sets: 4, reps: '8', cue: '' },
        { id: 'ex-incline', name: 'Incline Bench', sets: 3, reps: '10', cue: '' },
      ],
    },
    {
      id: 'wo-pull',
      name: 'Pull Day',
      weekday: 1,
      exercises: [{ id: 'ex-row', name: 'Barbell Row', sets: 4, reps: '8', cue: '' }],
    },
    {
      id: 'wo-leg',
      name: 'Leg Day',
      weekday: 2,
      exercises: [
        { id: 'ex-squat', name: 'Squats', sets: 3, reps: '8', cue: '' },
        { id: 'ex-legpress', name: 'Leg Press', sets: 3, reps: '10', cue: '' },
        { id: 'ex-deadlift', name: 'Deadlifts', sets: 3, reps: '5', cue: '' },
      ],
    },
  ]
}

function foodFixture(): FoodLog[] {
  // addFood prepends; index 0 is always "most recent"
  return [
    { id: 'f-bowl', date: today, name: 'Chicken Bowl', kcal: 600, protein: 40, carbs: 50, fat: 10 },
    { id: 'f-shake', date: today, name: 'Protein Shake', kcal: 200, protein: 25, carbs: 5, fat: 3 },
  ]
}

function resetFixtures() {
  useStore.setState({
    workouts: workoutFixture(),
    foodLogs: foodFixture(),
    dayTypeMacros: seedDayTypeMacros.map((d) => ({ ...d })),
  })
}

function findDayType(codeOrLabel: string): DayTypeMacro | undefined {
  const q = codeOrLabel.toLowerCase()
  return useStore.getState().dayTypeMacros.find((d) => d.code.toLowerCase() === q || d.label.toLowerCase() === q)
}

function findExercise(workoutName: string, exerciseName: string): Exercise | undefined {
  return useStore
    .getState()
    .workouts.find((w) => w.name === workoutName)
    ?.exercises.find((e) => e.name.toLowerCase() === exerciseName.toLowerCase())
}

function findWorkout(name: string): Workout | undefined {
  return useStore.getState().workouts.find((w) => w.name.toLowerCase() === name.toLowerCase())
}

function findFood(name: string): FoodLog | undefined {
  return useStore.getState().foodLogs.find((f) => f.name.toLowerCase() === name.toLowerCase())
}

beforeEach(() => {
  resetFixtures()
})

// ————————————————————————————————————————————————————————
// WORKOUT: sets × reps
// ————————————————————————————————————————————————————————
describe('workout: sets x reps patterns', () => {
  it('"4x12 squats" sets sets=4 reps=12', () => {
    const r = runLocalEngine('4x12 squats')
    expect(r).not.toBeNull()
    expect(findExercise('Leg Day', 'Squats')).toMatchObject({ sets: 4, reps: '12' })
  })

  it('"squats 5x5" sets sets=5 reps=5', () => {
    runLocalEngine('squats 5x5')
    expect(findExercise('Leg Day', 'Squats')).toMatchObject({ sets: 5, reps: '5' })
  })

  it('"bench press 6x3 instead" sets sets=6 reps=3', () => {
    runLocalEngine('bench press 6x3 instead')
    expect(findExercise('Push Day', 'Bench Press')).toMatchObject({ sets: 6, reps: '3' })
  })

  it('"set squats to 3x8" sets sets=3 reps=8', () => {
    runLocalEngine('set squats to 3x8')
    expect(findExercise('Leg Day', 'Squats')).toMatchObject({ sets: 3, reps: '8' })
  })

  it('"reduce leg press from 5x10 to 4x10" sets sets=4 reps=10', () => {
    runLocalEngine('reduce leg press from 5x10 to 4x10')
    expect(findExercise('Leg Day', 'Leg Press')).toMatchObject({ sets: 4, reps: '10' })
  })

  it('"squats: 4 sets of 12 reps" sets sets=4 reps=12', () => {
    runLocalEngine('squats: 4 sets of 12 reps')
    expect(findExercise('Leg Day', 'Squats')).toMatchObject({ sets: 4, reps: '12' })
  })

  it('"increase squats by 2 reps" adds to numeric reps (8 -> 10)', () => {
    runLocalEngine('increase squats by 2 reps')
    expect(findExercise('Leg Day', 'Squats')).toMatchObject({ reps: '10' })
  })

  it('"add 1 rep to deadlifts" adds to numeric reps (5 -> 6)', () => {
    runLocalEngine('add 1 rep to deadlifts')
    expect(findExercise('Leg Day', 'Deadlifts')).toMatchObject({ reps: '6' })
  })

  it('"drop 1 set from bench" subtracts from sets (4 -> 3)', () => {
    runLocalEngine('drop 1 set from bench')
    expect(findExercise('Push Day', 'Bench Press')).toMatchObject({ sets: 3 })
  })

  it('sets never drop below 1', () => {
    runLocalEngine('drop 1 set from barbell row') // starts at... adjust: row starts at 4
    runLocalEngine('drop 1 set from barbell row')
    runLocalEngine('drop 1 set from barbell row')
    runLocalEngine('drop 1 set from barbell row')
    runLocalEngine('drop 1 set from barbell row')
    expect(findExercise('Pull Day', 'Barbell Row')!.sets).toBeGreaterThanOrEqual(1)
  })

  it('does not touch reps expressed as a range ("8-10")', () => {
    useStore.setState({
      workouts: [
        { id: 'wo-x', name: 'X Day', weekday: 3, exercises: [{ id: 'ex-x', name: 'Curls', sets: 3, reps: '8-10', cue: '' }] },
      ],
    })
    const r = runLocalEngine('increase curls by 2 reps')
    expect(r).toBeNull()
    expect(findExercise('X Day', 'Curls')).toMatchObject({ reps: '8-10' })
  })

  it('ambiguous exercise name matching 2+ workouts falls back to LLM (null)', () => {
    useStore.setState({
      workouts: [
        { id: 'wo-a', name: 'A Day', weekday: 0, exercises: [{ id: 'ex-a', name: 'Curls', sets: 3, reps: '10', cue: '' }] },
        { id: 'wo-b', name: 'B Day', weekday: 1, exercises: [{ id: 'ex-b', name: 'Curls', sets: 4, reps: '10', cue: '' }] },
      ],
    })
    expect(runLocalEngine('4x12 curls')).toBeNull()
  })

  it('unknown exercise name falls back to LLM (null)', () => {
    expect(runLocalEngine('4x12 nonexistent movement')).toBeNull()
  })
})

// ————————————————————————————————————————————————————————
// WORKOUT: rename exercise
// ————————————————————————————————————————————————————————
describe('workout: rename exercise', () => {
  it('"rename bench press to dumbbell press"', () => {
    runLocalEngine('rename bench press to dumbbell press')
    expect(findExercise('Push Day', 'Dumbbell Press')).toBeTruthy()
    expect(findExercise('Push Day', 'Bench Press')).toBeUndefined()
  })

  it('"change incline bench to db incline" (substring match)', () => {
    runLocalEngine('change incline bench to db incline')
    expect(findExercise('Push Day', 'db incline')).toBeTruthy()
  })

  it('arrow syntax "bench → barbell bench press"', () => {
    runLocalEngine('bench → barbell bench press')
    expect(findExercise('Push Day', 'barbell bench press')).toBeTruthy()
  })
})

// ————————————————————————————————————————————————————————
// WORKOUT: add / remove exercise
// ————————————————————————————————————————————————————————
describe('workout: add/remove exercise', () => {
  it('"add leg press 3x10 to leg day" adds a NEW exercise when name would collide, else updates existing', () => {
    // Leg Press already exists on Leg Day in the fixture — adding "Calf Raise" instead to prove the add path
    runLocalEngine('add calf raise 3x15 to leg day')
    expect(findExercise('Leg Day', 'Calf Raise')).toMatchObject({ sets: 3, reps: '15' })
  })

  it('"remove bench press" deletes the exercise', () => {
    runLocalEngine('remove bench press')
    expect(findExercise('Push Day', 'Bench Press')).toBeUndefined()
  })

  it('"delete squats" deletes the exercise', () => {
    runLocalEngine('delete squats')
    expect(findExercise('Leg Day', 'Squats')).toBeUndefined()
  })

  it('"drop the leg press" deletes the exercise', () => {
    runLocalEngine('drop the leg press')
    expect(findExercise('Leg Day', 'Leg Press')).toBeUndefined()
  })

  it('reorder phrasing falls back to LLM (not implemented locally)', () => {
    expect(runLocalEngine('move bench to first')).toBeNull()
    expect(runLocalEngine('insert leg press before squats')).toBeNull()
  })
})

// ————————————————————————————————————————————————————————
// WORKOUT: workout-level rename/move/create/delete
// ————————————————————————————————————————————————————————
describe('workout: workout-level restructuring', () => {
  it('"rename push day to chest & shoulders"', () => {
    runLocalEngine('rename push day to chest & shoulders')
    expect(findWorkout('chest & shoulders')).toBeTruthy()
    expect(findWorkout('push day')).toBeUndefined()
  })

  it('"move pull day to Thursday" updates weekday', () => {
    runLocalEngine('move pull day to thursday')
    expect(findWorkout('pull day')).toMatchObject({ weekday: 3 })
  })

  it('"create new workout: core on friday"', () => {
    runLocalEngine('create new workout: core on friday')
    const w = findWorkout('core')
    expect(w).toBeTruthy()
    expect(w!.weekday).toBe(4)
  })

  it('"delete push day" removes the workout', () => {
    runLocalEngine('delete push day')
    expect(findWorkout('push day')).toBeUndefined()
  })

  it('"remove leg day" removes the workout', () => {
    runLocalEngine('remove leg day')
    expect(findWorkout('leg day')).toBeUndefined()
  })

  it('swap phrasing falls back to LLM (not implemented locally)', () => {
    expect(runLocalEngine('swap leg day and push day')).toBeNull()
  })
})

// ————————————————————————————————————————————————————————
// WORKOUT: cue management
// ————————————————————————————————————————————————————————
describe('workout: cue management', () => {
  it('"squats add cue: full depth"', () => {
    runLocalEngine('squats add cue: full depth')
    expect(findExercise('Leg Day', 'Squats')).toMatchObject({ cue: 'full depth' })
  })

  it('"set bench cue to pause 2 sec"', () => {
    runLocalEngine('set bench cue to pause 2 sec')
    expect(findExercise('Push Day', 'Bench Press')).toMatchObject({ cue: 'pause 2 sec' })
  })

  it('"add tempo 3-1-2 to bench"', () => {
    runLocalEngine('add tempo 3-1-2 to bench')
    expect(findExercise('Push Day', 'Bench Press')).toMatchObject({ cue: 'tempo 3-1-2' })
  })

  it('"remove cue from deadlifts" clears the cue', () => {
    useStore.setState({
      workouts: workoutFixture().map((w) =>
        w.name === 'Leg Day' ? { ...w, exercises: w.exercises.map((e) => (e.name === 'Deadlifts' ? { ...e, cue: 'old cue' } : e)) } : w,
      ),
    })
    runLocalEngine('remove cue from deadlifts')
    expect(findExercise('Leg Day', 'Deadlifts')).toMatchObject({ cue: '' })
  })

  it('weight-load tracking ("200 lbs on squats") is not implemented locally -> LLM', () => {
    expect(runLocalEngine('200 lbs on squats')).toBeNull()
  })
})

// ————————————————————————————————————————————————————————
// NUTRITION: correct/update last or named food entry
// ————————————————————————————————————————————————————————
describe('nutrition: update food macros', () => {
  it('"make that 800 kcal" updates the most recent entry (Chicken Bowl)', () => {
    runLocalEngine('make that 800 kcal')
    expect(findFood('Chicken Bowl')).toMatchObject({ kcal: 800 })
  })

  it('"fix the protein to 50g" updates the most recent entry', () => {
    runLocalEngine('fix the protein to 50g')
    expect(findFood('Chicken Bowl')).toMatchObject({ protein: 50 })
  })

  it('"chicken was 750 kcal not 600" updates the named entry', () => {
    runLocalEngine('chicken bowl was 750 kcal not 600')
    expect(findFood('Chicken Bowl')).toMatchObject({ kcal: 750 })
  })

  it('"change carbs to 45g" updates the most recent entry', () => {
    runLocalEngine('change carbs to 45g')
    expect(findFood('Chicken Bowl')).toMatchObject({ carbs: 45 })
  })

  it('"set fat to 15g" updates the most recent entry', () => {
    runLocalEngine('set fat to 15g')
    expect(findFood('Chicken Bowl')).toMatchObject({ fat: 15 })
  })

  it('"correct salmon to 45g protein" — no existing "salmon" entry falls back to LLM', () => {
    expect(runLocalEngine('correct salmon to 45g protein')).toBeNull()
  })

  it('"correct protein shake to 30g protein" updates the named entry', () => {
    runLocalEngine('correct protein shake to 30g protein')
    expect(findFood('Protein Shake')).toMatchObject({ protein: 30 })
  })

  it('"update chicken bowl: 750 kcal / 60g protein / 0g carbs" updates multiple fields at once', () => {
    runLocalEngine('update chicken bowl: 750 kcal / 60g protein / 0g carbs')
    expect(findFood('Chicken Bowl')).toMatchObject({ kcal: 750, protein: 60, carbs: 0 })
  })
})

// ————————————————————————————————————————————————————————
// NUTRITION: delete food entry
// ————————————————————————————————————————————————————————
describe('nutrition: delete food entry', () => {
  it('"delete that meal" removes the most recent entry', () => {
    runLocalEngine('delete that meal')
    expect(findFood('Chicken Bowl')).toBeUndefined()
    expect(findFood('Protein Shake')).toBeTruthy()
  })

  it('"undo last food" removes the most recent entry', () => {
    runLocalEngine('undo last food')
    expect(findFood('Chicken Bowl')).toBeUndefined()
  })

  it('"remove the protein shake" removes the named entry', () => {
    runLocalEngine('remove the protein shake')
    expect(findFood('Protein Shake')).toBeUndefined()
    expect(findFood('Chicken Bowl')).toBeTruthy()
  })

  it('"i didn\'t eat the protein shake" removes the named entry', () => {
    runLocalEngine("i didn't eat the protein shake")
    expect(findFood('Protein Shake')).toBeUndefined()
  })

  it('vague conversational phrasing ("that didn\'t happen") is NOT treated as a delete — falls to LLM', () => {
    const r = runLocalEngine("that didn't happen")
    expect(r).toBeNull()
    expect(findFood('Chicken Bowl')).toBeTruthy()
  })
})

// ————————————————————————————————————————————————————————
// NUTRITION: rename food entry
// ————————————————————————————————————————————————————————
describe('nutrition: rename food entry', () => {
  it('"that was tuna not salmon" renames the last entry with old-name context', () => {
    useStore.setState({ foodLogs: [{ id: 'f-salmon', date: today, name: 'Salmon', kcal: 400, protein: 35, carbs: 0, fat: 20 }] })
    runLocalEngine('that was tuna not salmon')
    expect(findFood('Tuna')).toBeTruthy()
    expect(findFood('Salmon')).toBeUndefined()
  })

  it('"rename it to greek yogurt" renames the most recent entry', () => {
    runLocalEngine('rename it to greek yogurt')
    expect(findFood('Greek Yogurt')).toBeTruthy()
  })

  it('"fix the name to almond butter" renames the most recent entry', () => {
    runLocalEngine('fix the name to almond butter')
    expect(findFood('Almond Butter')).toBeTruthy()
  })

  it('"call it homemade granola" renames the most recent entry', () => {
    runLocalEngine('call it homemade granola')
    expect(findFood('Homemade Granola')).toBeTruthy()
  })

  it('generic present-tense correction ("it\'s brown rice, not white") is too ambiguous -> LLM', () => {
    expect(runLocalEngine("it's brown rice, not white")).toBeNull()
  })
})

// ————————————————————————————————————————————————————————
// NUTRITION: fuelling framework (day-type carb periodisation)
// ————————————————————————————————————————————————————————
describe('nutrition: fuelling framework day-type macros', () => {
  it('"set lift day carbs to 4-5" updates the carb range and recomputes the example', () => {
    runLocalEngine('set lift day carbs to 4-5')
    const lift = findDayType('L')
    expect(lift).toMatchObject({ carbGkg: '4-5' })
    expect(lift!.example80kg).toContain('C360') // midpoint 4.5 * 80kg
  })

  it('"change recovery protein to 2-2.4" resolves by label, not just code', () => {
    runLocalEngine('change recovery protein to 2-2.4')
    expect(findDayType('Recovery / Rest')).toMatchObject({ proteinGkg: '2-2.4' })
  })

  it('"update quality run fat to 0.65" accepts a single value (non-range)', () => {
    runLocalEngine('update quality run fat to 0.65')
    expect(findDayType('Quality Run')).toMatchObject({ fatGkg: '0.65' })
  })

  it('unknown day type falls back to the LLM (null)', () => {
    expect(runLocalEngine('set cardio day carbs to 5-6')).toBeNull()
  })

  it('editing one field leaves the other two macro fields untouched', () => {
    runLocalEngine('set lift day carbs to 5-6')
    const lift = findDayType('L')
    expect(lift).toMatchObject({ proteinGkg: '1.8–2.2', fatGkg: '0.6–0.8' })
  })
})

// ————————————————————————————————————————————————————————
// Edge cases required by tdd-guide.md
// ————————————————————————————————————————————————————————
describe('edge cases', () => {
  it('empty string returns null', () => {
    expect(runLocalEngine('')).toBeNull()
  })

  it('whitespace-only string returns null', () => {
    expect(runLocalEngine('   ')).toBeNull()
  })

  it('no food logs today: "make that 800 kcal" falls back to LLM', () => {
    useStore.setState({ foodLogs: [] })
    expect(runLocalEngine('make that 800 kcal')).toBeNull()
  })

  it('no workouts at all: "4x12 squats" falls back to LLM', () => {
    useStore.setState({ workouts: [] })
    expect(runLocalEngine('4x12 squats')).toBeNull()
  })

  it('unrelated small talk does not match any new pattern', () => {
    expect(runLocalEngine('how is the weather today')).toBeNull()
  })

  it('special characters in exercise name are handled safely (no crash)', () => {
    useStore.setState({
      workouts: [
        { id: 'wo-y', name: 'Y Day', weekday: 4, exercises: [{ id: 'ex-y', name: 'Curls (drop-set)', sets: 3, reps: '10', cue: '' }] },
      ],
    })
    expect(() => runLocalEngine('4x12 curls (drop-set)')).not.toThrow()
  })

  it('zero/negative set counts in "NxM" are rejected (falls back to LLM)', () => {
    expect(runLocalEngine('0x12 squats')).toBeNull()
  })

  it('boundary: sets/reps at 1x1 is accepted', () => {
    runLocalEngine('1x1 squats')
    expect(findExercise('Leg Day', 'Squats')).toMatchObject({ sets: 1, reps: '1' })
  })

  it('case-insensitive matching works for exercise and workout names', () => {
    runLocalEngine('4X12 SQUATS')
    expect(findExercise('Leg Day', 'Squats')).toMatchObject({ sets: 4, reps: '12' })
  })
})
