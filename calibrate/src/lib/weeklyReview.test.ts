import { describe, expect, it } from 'vitest'
import { useStore } from '../store/store'
import { addDays, todayISO, weekDates } from './dates'
import { weeklyReview, weekSnapshot } from './stats'

describe('weekly review — this week vs last, from real store state', () => {
  it('aggregates each pillar for the given week only', () => {
    const thisWeek = weekDates()
    const s = {
      ...useStore.getState(),
      golfSessions: [
        { id: 'g1', date: thisWeek[0], category: 'putting' as const, minutes: 60, notes: '' },
        { id: 'g2', date: addDays(thisWeek[0], -7), category: 'putting' as const, minutes: 45, notes: '' }, // last week
      ],
      workoutLogs: [{ id: 'w1', date: thisWeek[0], workoutId: 'x', entries: {}, completed: true }],
      hevySessions: [],
      runLogs: [{ id: 'r1', date: thisWeek[0], minutes: 45, distanceKm: 8.4, avgHr: null, notes: '' }],
      revenue: [{ id: 'v1', date: thisWeek[0], amount: 120, source: 'store' }],
      readingLog: { [thisWeek[0]]: 30 },
      checkIns: {
        [thisWeek[0]]: { date: thisWeek[0], weightKg: 84, sleepH: 8, sleepQuality: 4, energy: 4, blackoutOnTime: true, notes: '' },
      },
    }
    const snap = weekSnapshot(s, thisWeek)
    expect(snap.golfMin).toBe(60) // last week's 45 excluded
    expect(snap.workouts).toBe(1)
    expect(snap.runKm).toBe(8.4)
    expect(snap.revenue).toBe(120)
    expect(snap.readingMin).toBe(30)
    expect(snap.checkIns).toBe(1)
  })

  it('weeklyReview returns disjoint current/previous windows', () => {
    const thisWeek = weekDates()
    const lastWeekDate = addDays(thisWeek[0], -3) // mid last week
    const s = {
      ...useStore.getState(),
      golfSessions: [{ id: 'g', date: lastWeekDate, category: 'drills' as const, minutes: 90, notes: '' }],
      workoutLogs: [],
      hevySessions: [],
      runLogs: [],
      revenue: [],
      readingLog: {},
      checkIns: {},
    }
    const { current, previous } = weeklyReview(s)
    expect(previous.golfMin).toBe(90)
    expect(current.golfMin).toBe(0)
  })

  it('schedule completion only counts days that have already happened', () => {
    // A week that is entirely in the future must not count against you
    const future = weekDates(new Date(Date.now() + 14 * 86400000))
    const snap = weekSnapshot(useStore.getState(), future)
    expect(snap.schedulePct).toBe(0)
    expect(future.every((d) => d > todayISO())).toBe(true)
  })
})
