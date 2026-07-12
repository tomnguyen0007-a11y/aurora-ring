import { beforeEach, describe, expect, it } from 'vitest'
import { todayISO } from '../dates'
import { useStore } from '../../store/store'
import { applyActions } from './actions'

const today = todayISO()

describe('total edit control — Jarvis can edit anything, not just add/delete', () => {
  beforeEach(() => {
    useStore.setState({
      golfSessions: [{ id: 'gs1', date: today, category: 'putting', minutes: 250, notes: 'via Jarvis' }],
      runLogs: [{ id: 'r1', date: today, minutes: 45, distanceKm: 7, avgHr: null, notes: '' }],
      revenue: [{ id: 'v1', date: today, amount: 90, source: 'store' }],
      books: [{ id: 'b1', title: 'Deep Work', author: 'Cal Newport', status: 'reading', currentPage: 40, totalPages: 300, rating: null, notes: '' }],
      goals: [{ id: 'g1', pillar: 'golf', title: 'Plus handicap', target: 'by summer', deadline: null, progress: 10, milestones: [], notes: '' }],
      trainingPhotos: [{ id: 'p1', date: today, category: 'golf', caption: 'putting drill', createdAt: 1 }],
      handicap: [
        { id: 'h1', date: '2026-07-01', value: 2.4 },
        { id: 'h2', date: today, value: 24 }, // fat-fingered
      ],
      checkIns: {},
    })
  })

  it('update_golf fixes a fat-fingered duration on the most recent session', () => {
    const receipts = applyActions([{ type: 'update_golf', minutes: 25 }])
    expect(useStore.getState().golfSessions[0].minutes).toBe(25)
    expect(receipts[0]).toContain('25 min')
  })

  it('update_run corrects distance on the most recent run', () => {
    applyActions([{ type: 'update_run', distanceKm: 8.4 }])
    expect(useStore.getState().runLogs[0].distanceKm).toBe(8.4)
  })

  it('update_revenue and delete_revenue reach the most recent entry', () => {
    applyActions([{ type: 'update_revenue', amount: 120 }])
    expect(useStore.getState().revenue[0].amount).toBe(120)
    applyActions([{ type: 'delete_revenue' }])
    expect(useStore.getState().revenue).toHaveLength(0)
  })

  it('update_book moves a book along and tracks pages', () => {
    applyActions([{ type: 'update_book', title: 'deep work', currentPage: 120, status: 'reading' }])
    expect(useStore.getState().books[0].currentPage).toBe(120)
    applyActions([{ type: 'update_book', title: 'deep work', status: 'finished', rating: 5 }])
    expect(useStore.getState().books[0]).toMatchObject({ status: 'finished', rating: 5 })
  })

  it('update_goal edits target/deadline, not just progress', () => {
    applyActions([{ type: 'update_goal', goal: 'plus handicap', target: 'by end of season', deadline: '2026-09-30' }])
    expect(useStore.getState().goals[0]).toMatchObject({ target: 'by end of season', deadline: '2026-09-30' })
  })

  it('set_macros accepts single numbers and ranges', () => {
    applyActions([{ type: 'set_macros', kcal: [2800, 3000], protein: 190 }])
    const m = useStore.getState().macros
    expect(m.kcal).toEqual([2800, 3000])
    expect(m.protein).toEqual([190, 190])
  })

  it('update_photo recaptions and delete_photo removes the most recent', () => {
    applyActions([{ type: 'update_photo', caption: 'gate drill, 20 balls' }])
    expect(useStore.getState().trainingPhotos[0].caption).toBe('gate drill, 20 balls')
    applyActions([{ type: 'delete_photo' }])
    expect(useStore.getState().trainingPhotos).toHaveLength(0)
  })

  it('delete_handicap removes the newest (mistyped) entry only', () => {
    applyActions([{ type: 'delete_handicap' }])
    const hcp = useStore.getState().handicap
    expect(hcp).toHaveLength(1)
    expect(hcp[0].value).toBe(2.4)
  })

  it('update_checkin fixes a past day retroactively', () => {
    applyActions([{ type: 'update_checkin', date: '2026-07-09', weightKg: 84.2, sleepH: 7.5 }])
    expect(useStore.getState().checkIns['2026-07-09']).toMatchObject({ weightKg: 84.2, sleepH: 7.5 })
  })

  it('alias names from the model still land (remove_revenue → delete_revenue)', () => {
    applyActions([{ type: 'remove_revenue' } as never])
    expect(useStore.getState().revenue).toHaveLength(0)
  })
})
