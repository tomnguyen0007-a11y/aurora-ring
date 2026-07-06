import { todayISO, weekdayOf } from '../dates'
import { useStore } from '../../store/store'
import type { GolfCategory, Pillar, ViewId } from '../../store/types'
import { inferCategory, inferImportance } from './memoryCategorize'

// Structured actions Jarvis can execute against the app.
// Emitted by the local engine directly, or by the LLM as a ```json actions block.

export type JarvisAction =
  | { type: 'log_golf'; category: GolfCategory; minutes: number }
  | { type: 'log_water'; ml: number }
  | { type: 'log_weight'; kg: number }
  | { type: 'log_sleep'; hours: number; blackoutOnTime?: boolean }
  | { type: 'log_reading'; minutes: number }
  | { type: 'log_food'; name: string; kcal?: number; protein?: number; carbs?: number; fat?: number }
  | { type: 'log_run'; minutes: number; distanceKm?: number }
  | { type: 'log_revenue'; amount: number; source?: string }
  | { type: 'log_handicap'; value: number }
  | { type: 'add_grocery'; name: string; qty?: string }
  | { type: 'add_note'; title: string; body?: string }
  | { type: 'add_goal'; title: string; target?: string; pillar?: Pillar }
  | { type: 'add_milestone'; goal: string; title: string }
  | { type: 'add_biz_task'; title: string; area?: string }
  | { type: 'add_book'; title: string; author?: string }
  | { type: 'add_watch'; kind: 'crypto' | 'stock'; symbol: string; cgId?: string; name?: string }
  | { type: 'complete_block'; title: string }
  | { type: 'complete_workout' }
  | { type: 'update_goal_progress'; goal: string; progress: number }
  | { type: 'remember'; fact: string }
  | { type: 'add_mantra'; text: string; author?: string }
  | { type: 'navigate'; view: ViewId }

const VIEWS: ViewId[] = ['today', 'jarvis', 'goals', 'training', 'golf', 'nutrition', 'recovery', 'grocery', 'notes', 'business', 'books', 'mindset', 'markets', 'schedule', 'settings']

/** Apply actions to the store; returns human-readable receipts. */
export function applyActions(actions: JarvisAction[]): string[] {
  const s = useStore.getState()
  const date = todayISO()
  const receipts: string[] = []

  for (const a of actions) {
    try {
      switch (a.type) {
        case 'log_golf': {
          if (!a.minutes || a.minutes <= 0) break
          s.addGolfSession({ date, category: a.category, minutes: Math.round(a.minutes), notes: 'via Jarvis' })
          receipts.push(`Logged ${Math.round(a.minutes)} min of ${a.category.replace('-', ' ')}`)
          break
        }
        case 'log_water': {
          s.addWater(date, Math.round(a.ml))
          receipts.push(`Water +${Math.round(a.ml)}ml`)
          break
        }
        case 'log_weight': {
          const prev = s.checkIns[date]
          s.saveCheckIn({
            date,
            weightKg: a.kg,
            sleepH: prev?.sleepH ?? null,
            sleepQuality: prev?.sleepQuality ?? null,
            energy: prev?.energy ?? null,
            blackoutOnTime: prev?.blackoutOnTime ?? null,
            notes: prev?.notes ?? '',
          })
          receipts.push(`Weight logged: ${a.kg} kg`)
          break
        }
        case 'log_sleep': {
          const prev = s.checkIns[date]
          s.saveCheckIn({
            date,
            weightKg: prev?.weightKg ?? null,
            sleepH: a.hours,
            sleepQuality: prev?.sleepQuality ?? null,
            energy: prev?.energy ?? null,
            blackoutOnTime: a.blackoutOnTime ?? prev?.blackoutOnTime ?? null,
            notes: prev?.notes ?? '',
          })
          receipts.push(`Sleep logged: ${a.hours}h`)
          break
        }
        case 'log_reading': {
          s.logReading(date, Math.round(a.minutes))
          receipts.push(`Reading +${Math.round(a.minutes)} min`)
          break
        }
        case 'log_food': {
          s.addFood({ date, name: a.name, kcal: a.kcal ?? 0, protein: a.protein ?? 0, carbs: a.carbs ?? 0, fat: a.fat ?? 0 })
          receipts.push(`Food logged: ${a.name}${a.kcal ? ` (${a.kcal} kcal)` : ''}`)
          break
        }
        case 'log_run': {
          s.addRun({ date, minutes: Math.round(a.minutes), distanceKm: a.distanceKm ?? null, avgHr: null, notes: 'via Jarvis' })
          receipts.push(`Run logged: ${Math.round(a.minutes)} min`)
          break
        }
        case 'log_revenue': {
          s.addRevenue({ date, amount: a.amount, source: a.source ?? 'store' })
          receipts.push(`Revenue logged: $${a.amount}`)
          break
        }
        case 'log_handicap': {
          s.addHandicap(a.value)
          receipts.push(`Handicap updated: ${a.value}`)
          break
        }
        case 'add_grocery': {
          s.addGrocery(a.name, a.qty ?? '')
          receipts.push(`Grocery: ${a.name}${a.qty ? ` (${a.qty})` : ''}`)
          break
        }
        case 'add_note': {
          s.addNote(a.title, a.body ?? '')
          receipts.push(`Note created: “${a.title}”`)
          break
        }
        case 'add_goal': {
          s.addGoal({ title: a.title, target: a.target, pillar: a.pillar ?? 'custom' })
          receipts.push(`Goal added: ${a.title}`)
          break
        }
        case 'add_milestone': {
          const g = s.goals.find((x) => x.title.toLowerCase().includes(a.goal.toLowerCase()))
          if (g) {
            s.addMilestone(g.id, a.title)
            receipts.push(`Milestone added to “${g.title}”`)
          }
          break
        }
        case 'add_biz_task': {
          s.addBizTask(a.title, a.area ?? 'Ops')
          receipts.push(`AURORA task: ${a.title}`)
          break
        }
        case 'add_book': {
          s.addBook({ title: a.title, author: a.author })
          receipts.push(`Book added: ${a.title}`)
          break
        }
        case 'add_watch': {
          s.addWatch({ kind: a.kind, symbol: a.symbol.toUpperCase(), cgId: a.cgId, name: a.name ?? a.symbol.toUpperCase() })
          receipts.push(`Watching ${a.symbol.toUpperCase()}`)
          break
        }
        case 'complete_block': {
          const wd = weekdayOf()
          const blocks = s.schedule.filter((b) => b.weekday === wd)
          const q = a.title.toLowerCase()
          const hit =
            blocks.find((b) => b.title.toLowerCase() === q) ??
            blocks.find((b) => b.title.toLowerCase().includes(q)) ??
            blocks.find((b) => q.includes(b.title.toLowerCase().split(' ')[0] ?? '§'))
          if (hit && !(s.dayChecks[date]?.[hit.id])) {
            s.toggleBlock(date, hit.id)
            receipts.push(`Checked off: ${hit.title}`)
          } else if (hit) {
            receipts.push(`“${hit.title}” was already done`)
          }
          break
        }
        case 'complete_workout': {
          const w = s.workouts.find((x) => x.weekday === weekdayOf())
          if (w) {
            s.setWorkoutDone(date, w.id, true)
            receipts.push(`${w.name} marked complete`)
          }
          break
        }
        case 'update_goal_progress': {
          const g = s.goals.find((x) => x.title.toLowerCase().includes(a.goal.toLowerCase()))
          if (g) {
            s.updateGoal(g.id, { progress: Math.max(0, Math.min(100, a.progress)) })
            receipts.push(`“${g.title}” progress → ${a.progress}%`)
          }
          break
        }
        case 'remember': {
          const text = a.fact.trim()
          if (text) {
            s.addFact(text, inferCategory(text), inferImportance(text))
            receipts.push(`Remembered: ${text}`)
          }
          break
        }
        case 'add_mantra': {
          if (a.text.trim()) {
            s.addMantra(a.text.trim(), a.author)
            receipts.push(`Added to your mindset library`)
          }
          break
        }
        case 'navigate': {
          if (VIEWS.includes(a.view)) {
            s.setView(a.view)
            receipts.push(`Opened ${a.view}`)
          }
          break
        }
      }
    } catch {
      // one bad action must not sink the batch
    }
  }
  return receipts
}
