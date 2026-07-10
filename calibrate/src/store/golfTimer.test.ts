import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from './store'

function reset() {
  useStore.setState({ golfTimer: null, golfSessions: [] })
}

describe('golf practice timer — wall-clock derived, immune to missed setInterval ticks', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    reset()
  })

  it('reports true elapsed time even if the UI missed every intermediate tick (backgrounded tab)', () => {
    const now = Date.now()
    useStore.getState().startGolfTimer('putting')

    // Simulate the phone locking for 22 real minutes — no ticks fire during this, only
    // the wall-clock timestamp matters when we next read state.
    vi.setSystemTime(now + 22 * 60 * 1000)

    const timer = useStore.getState().golfTimer!
    const elapsedSec = timer.accumulatedSec + (Date.now() - timer.startedAt!) / 1000
    expect(Math.round(elapsedSec / 60)).toBe(22)
  })

  it('pause banks real elapsed time, and resume continues from a fresh startedAt', () => {
    const now = Date.now()
    useStore.getState().startGolfTimer('chipping')

    vi.setSystemTime(now + 5 * 60 * 1000) // 5 real minutes pass
    useStore.getState().pauseGolfTimer()
    let t = useStore.getState().golfTimer!
    expect(t.startedAt).toBeNull()
    expect(Math.round(t.accumulatedSec / 60)).toBe(5)

    // Paused for a while — must NOT accumulate more while paused
    vi.setSystemTime(now + 60 * 60 * 1000)
    t = useStore.getState().golfTimer!
    expect(Math.round(t.accumulatedSec / 60)).toBe(5)

    useStore.getState().resumeGolfTimer()
    vi.setSystemTime(now + 60 * 60 * 1000 + 3 * 60 * 1000) // 3 more real minutes
    t = useStore.getState().golfTimer!
    const elapsedSec = t.accumulatedSec + (Date.now() - t.startedAt!) / 1000
    expect(Math.round(elapsedSec / 60)).toBe(8)
  })

  it('stop logs the real elapsed minutes and clears the timer', () => {
    const now = Date.now()
    useStore.getState().startGolfTimer('drills')
    vi.setSystemTime(now + 12 * 60 * 1000)

    const minutes = useStore.getState().stopGolfTimer()
    expect(minutes).toBe(12)
    expect(useStore.getState().golfTimer).toBeNull()
    expect(useStore.getState().golfSessions[0]).toMatchObject({ category: 'drills', minutes: 12 })
  })

  it('discards sub-30-second sessions without logging (accidental start/stop)', () => {
    const now = Date.now()
    useStore.getState().startGolfTimer('simulator')
    vi.setSystemTime(now + 10 * 1000)

    const minutes = useStore.getState().stopGolfTimer()
    expect(minutes).toBeNull()
    expect(useStore.getState().golfSessions).toHaveLength(0)
  })

  it('survives a simulated app reload (persisted timestamp, not component state)', () => {
    const now = Date.now()
    useStore.getState().startGolfTimer('on-course')
    vi.setSystemTime(now + 8 * 60 * 1000)

    // Nothing in golfTimer depends on React component state — reading it fresh
    // (as a reload would, from the persisted store) still yields the true elapsed time.
    const t = useStore.getState().golfTimer!
    const elapsedSec = t.accumulatedSec + (Date.now() - t.startedAt!) / 1000
    expect(Math.round(elapsedSec / 60)).toBe(8)
  })
})
