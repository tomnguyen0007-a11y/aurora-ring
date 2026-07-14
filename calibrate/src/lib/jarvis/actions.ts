import { todayISO, weekdayOf } from '../dates'
import { useStore } from '../../store/store'
import type { BlockTag, BookStatus, GolfCategory, Pillar, ViewId, Weekday } from '../../store/types'
import { inferCategory, inferImportance } from './memoryCategorize'

// Structured actions Jarvis can execute against the app.
// Emitted by the local engine directly, or by the LLM as a ```json actions block.

export type JarvisAction =
  | { type: 'log_golf'; category: GolfCategory; minutes: number }
  | { type: 'log_water'; ml: number }
  | { type: 'log_weight'; kg: number }
  | { type: 'log_sleep'; hours: number; blackoutOnTime?: boolean }
  | { type: 'log_reading'; minutes: number }
  // portionGrams lets the nutrition resolver scale real label data to the stated
  // portion; resolvedFrom is set by the resolver (never the model) for the receipt
  | { type: 'log_food'; name: string; kcal?: number; protein?: number; carbs?: number; fat?: number; portionGrams?: number; resolvedFrom?: string }
  | { type: 'log_run'; minutes: number; distanceKm?: number }
  | { type: 'log_revenue'; amount: number; source?: string }
  | { type: 'log_handicap'; value: number }
  // imageData is never emitted by the model — the caller (llm.ts) attaches the
  // actually-sent photo before this reaches applyActions
  | { type: 'log_photo'; category: 'golf' | 'training' | 'other'; caption?: string; date?: string; imageData?: string }
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
  | { type: 'save_knowledge'; title: string; body: string } // store a longer reference doc into the Brain Feed
  | { type: 'add_mantra'; text: string; author?: string }
  | { type: 'navigate'; view: ViewId }
  // ——— editing & deleting (Jarvis can fix mistakes, not just add) ———
  | { type: 'update_food'; name: string; newName?: string; kcal?: number; protein?: number; carbs?: number; fat?: number }
  | { type: 'delete_food'; name?: string } // today's matching entry, or the most recent if no name
  | { type: 'delete_golf' } // most recent golf session today
  | { type: 'delete_run' } // most recent run today
  | { type: 'check_grocery'; name: string }
  | { type: 'remove_grocery'; name: string }
  | { type: 'remove_note'; title: string }
  | { type: 'update_note'; title: string; body: string } // replace a note's body
  | { type: 'append_note'; title: string; text: string } // add lines to the end of a note
  | { type: 'toggle_milestone'; goal: string; milestone: string }
  | { type: 'complete_biz_task'; title: string }
  | { type: 'remove_goal'; title: string }
  | { type: 'forget'; fact: string } // remove a stored memory fact by fragment
  | { type: 'add_block'; title: string; start: string; end?: string; weekday?: Weekday; detail?: string; tag?: BlockTag }
  | { type: 'move_block'; title: string; start: string; end?: string }
  | { type: 'remove_block'; title: string }
  // ——— corrections & fine-grained control ———
  | { type: 'set_water'; ml: number } // overwrite today's total (undo an accidental log)
  | { type: 'toggle_supplement'; name: string } // mark taken/untaken today
  | { type: 'add_supplement'; name: string; dose?: string; timing?: string }
  | { type: 'remove_supplement'; name: string }
  | { type: 'move_supplement'; name: string; position: number } // 1 = top of the stack
  | { type: 'update_exercise'; workout: string; exercise: string; name?: string; sets?: number; reps?: string; cue?: string }
  | { type: 'add_exercise'; workout: string; name: string; sets: number; reps: string; cue?: string }
  | { type: 'remove_exercise'; workout: string; exercise: string }
  // ——— workout-level restructuring (change the split itself) ———
  | { type: 'add_workout'; name: string; weekday: Weekday; exercises?: { name: string; sets: number; reps: string; cue?: string }[] }
  | { type: 'update_workout'; workout: string; name?: string; weekday?: Weekday }
  | { type: 'remove_workout'; workout: string }
  // ——— fuelling framework: carb periodisation by day type (Nutrition view's day-type table) ———
  | { type: 'update_day_type_macro'; dayType: string; proteinGkg?: string; carbGkg?: string; fatGkg?: string }
  // ——— total edit control: every logged thing is editable, not just deletable ———
  | { type: 'update_golf'; session?: string; minutes?: number; category?: GolfCategory; date?: string } // session = category/note fragment; default most recent
  | { type: 'update_run'; minutes?: number; distanceKm?: number; avgHr?: number } // most recent run
  | { type: 'update_revenue'; match?: string; amount?: number; source?: string } // match by source fragment; default most recent
  | { type: 'delete_revenue'; match?: string }
  | { type: 'update_book'; title: string; newTitle?: string; author?: string; status?: BookStatus; currentPage?: number; totalPages?: number; rating?: number }
  | { type: 'remove_book'; title: string }
  | { type: 'update_goal'; goal: string; title?: string; target?: string; deadline?: string; notes?: string }
  | { type: 'set_macros'; kcal?: number | [number, number]; protein?: number | [number, number]; carbs?: number | [number, number]; fat?: number | [number, number]; waterMl?: number }
  | { type: 'update_photo'; photo?: string; caption?: string; category?: 'golf' | 'training' | 'other'; date?: string } // photo = caption fragment; default most recent
  | { type: 'delete_photo'; photo?: string }
  | { type: 'update_supplement'; name: string; newName?: string; dose?: string; timing?: string }
  | { type: 'update_biz_task'; title: string; newTitle?: string; area?: string }
  | { type: 'delete_handicap' } // remove the most recent handicap entry (mislogged value)
  | { type: 'update_checkin'; date?: string; weightKg?: number; sleepH?: number; sleepQuality?: number; energy?: number; notes?: string }

const VIEWS: ViewId[] = ['today', 'jarvis', 'goals', 'training', 'golf', 'nutrition', 'recovery', 'grocery', 'notes', 'business', 'books', 'mindset', 'markets', 'news', 'schedule', 'review', 'settings']

// Models sometimes emit near-miss action names ("delete_note" for "remove_note").
// Map the obvious synonyms instead of silently dropping the user's intent.
const ACTION_ALIASES: Record<string, JarvisAction['type']> = {
  delete_note: 'remove_note',
  delete_grocery: 'remove_grocery',
  delete_goal: 'remove_goal',
  delete_block: 'remove_block',
  remove_food: 'delete_food',
  remove_golf: 'delete_golf',
  remove_run: 'delete_run',
  edit_note: 'update_note',
  edit_food: 'update_food',
  update_block: 'move_block',
  add_food: 'log_food',
  add_water: 'log_water',
  log_grocery: 'add_grocery',
  remove_revenue: 'delete_revenue',
  delete_book: 'remove_book',
  edit_book: 'update_book',
  edit_goal: 'update_goal',
  update_golf_session: 'update_golf',
  edit_golf: 'update_golf',
  remove_photo: 'delete_photo',
  edit_photo: 'update_photo',
  edit_supplement: 'update_supplement',
  edit_biz_task: 'update_biz_task',
  remove_handicap: 'delete_handicap',
  edit_checkin: 'update_checkin',
  log_checkin: 'update_checkin',
}

function normalizeAction(a: JarvisAction): JarvisAction {
  const mapped = ACTION_ALIASES[a.type as string]
  return mapped ? ({ ...a, type: mapped } as JarvisAction) : a
}

/**
 * Attach the ACTUAL sent photos to log_photo actions — the model only ever
 * emits category/caption, never image bytes. With several photos attached,
 * log_photo actions map to them in order (1st action → 1st photo …); if the
 * model emits fewer actions than photos that's its choice, and extras of
 * either side fall back to the last available photo rather than dropping.
 */
export function assignPhotoAttachments(actions: JarvisAction[], images?: string[]): JarvisAction[] {
  if (!images?.length) return actions
  let i = 0
  return actions.map((a) =>
    a.type === 'log_photo' && !a.imageData ? { ...a, imageData: images[Math.min(i++, images.length - 1)] } : a,
  )
}

/** Apply actions to the store; returns human-readable receipts. */
export function applyActions(actions: JarvisAction[]): string[] {
  const s = useStore.getState()
  const date = todayISO()
  const receipts: string[] = []

  for (const raw_ of actions) {
    const a = normalizeAction(raw_)
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
          // No macros from the user, the model, OR the nutrition resolver — a
          // 0-kcal entry is worse than no entry. Say what's needed instead.
          if (a.kcal == null) {
            receipts.push(`Couldn't verify macros for "${a.name}" — tell me the kcal (or brand/portion) and I'll log it properly.`)
            break
          }
          s.addFood({ date, name: a.name, kcal: a.kcal, protein: a.protein ?? 0, carbs: a.carbs ?? 0, fat: a.fat ?? 0 })
          receipts.push(`Food logged: ${a.name} (${a.kcal} kcal${a.protein ? `, ${a.protein}g protein` : ''})${a.resolvedFrom ? ` — from ${a.resolvedFrom}` : ''}`)
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
        case 'log_photo': {
          if (!a.imageData) {
            receipts.push(`No photo attached to log — attach one and ask again.`)
            break
          }
          s.addTrainingPhoto({ date: a.date || date, category: a.category, dataUrl: a.imageData, caption: a.caption })
          const dest = a.category === 'golf' ? 'Golf' : a.category === 'training' ? 'Training' : 'the'
          receipts.push(`Photo saved to ${dest} gallery${a.caption ? ` — "${a.caption}"` : ''}`)
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
        case 'save_knowledge': {
          const body = a.body?.trim()
          if (body) {
            s.addKnowledgeDoc(a.title?.trim() || 'Note from Jarvis', body, 'jarvis')
            receipts.push(`Saved to Brain Feed: “${a.title?.trim() || 'Note'}”`)
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

        // ——— editing & deleting ———
        case 'update_food': {
          const q = a.name.toLowerCase()
          const hit = s.foodLogs.find((f) => f.date === date && f.name.toLowerCase().includes(q))
          if (hit) {
            s.updateFood(hit.id, {
              name: a.newName ?? hit.name,
              kcal: a.kcal ?? hit.kcal,
              protein: a.protein ?? hit.protein,
              carbs: a.carbs ?? hit.carbs,
              fat: a.fat ?? hit.fat,
            })
            receipts.push(`Updated: ${a.newName ?? hit.name}${a.kcal != null ? ` → ${a.kcal} kcal` : ''}`)
          }
          break
        }
        case 'delete_food': {
          const todays = s.foodLogs.filter((f) => f.date === date)
          const hit = a.name
            ? todays.find((f) => f.name.toLowerCase().includes(a.name!.toLowerCase()))
            : todays[0] // addFood prepends, so index 0 is the most recent
          if (hit) {
            s.removeFood(hit.id)
            receipts.push(`Removed food log: ${hit.name}`)
          }
          break
        }
        case 'delete_golf': {
          const hit = s.golfSessions.find((g) => g.date === date)
          if (hit) {
            s.removeGolfSession(hit.id)
            receipts.push(`Removed golf session: ${hit.minutes} min ${hit.category}`)
          }
          break
        }
        case 'delete_run': {
          const hit = s.runLogs.find((r) => r.date === date)
          if (hit) {
            s.removeRun(hit.id)
            receipts.push(`Removed run: ${hit.minutes} min`)
          }
          break
        }
        case 'check_grocery': {
          const q = a.name.toLowerCase()
          const hit = s.grocery.find((g) => !g.done && g.name.toLowerCase().includes(q))
          if (hit) {
            s.toggleGrocery(hit.id)
            receipts.push(`Checked off: ${hit.name}`)
          }
          break
        }
        case 'remove_grocery': {
          const q = a.name.toLowerCase()
          const hit = s.grocery.find((g) => g.name.toLowerCase().includes(q))
          if (hit) {
            s.removeGrocery(hit.id)
            receipts.push(`Removed from list: ${hit.name}`)
          }
          break
        }
        case 'remove_note': {
          const q = a.title.toLowerCase()
          const hit = s.notes.find((n) => n.title.toLowerCase().includes(q))
          if (hit) {
            s.removeNote(hit.id)
            receipts.push(`Deleted note: “${hit.title}”`)
          }
          break
        }
        case 'update_note': {
          const q = a.title.toLowerCase()
          const hit = s.notes.find((n) => n.title.toLowerCase().includes(q))
          if (hit) {
            s.updateNote(hit.id, { body: a.body })
            receipts.push(`Rewrote note: “${hit.title}”`)
          }
          break
        }
        case 'append_note': {
          const q = a.title.toLowerCase()
          const hit = s.notes.find((n) => n.title.toLowerCase().includes(q))
          if (hit && a.text.trim()) {
            s.updateNote(hit.id, { body: hit.body ? `${hit.body}\n${a.text.trim()}` : a.text.trim() })
            receipts.push(`Appended to “${hit.title}”`)
          }
          break
        }
        case 'toggle_milestone': {
          const g = s.goals.find((x) => x.title.toLowerCase().includes(a.goal.toLowerCase()))
          const ms = g?.milestones.find((m) => m.title.toLowerCase().includes(a.milestone.toLowerCase()))
          if (g && ms) {
            s.toggleMilestone(g.id, ms.id)
            receipts.push(`Milestone ${ms.done ? 'reopened' : 'completed'}: ${ms.title}`)
          }
          break
        }
        case 'complete_biz_task': {
          const q = a.title.toLowerCase()
          const hit = s.bizTasks.find((t) => !t.done && t.title.toLowerCase().includes(q))
          if (hit) {
            s.toggleBizTask(hit.id)
            receipts.push(`AURORA task done: ${hit.title}`)
          }
          break
        }
        case 'remove_goal': {
          const hit = s.goals.find((g) => g.title.toLowerCase().includes(a.title.toLowerCase()))
          if (hit) {
            s.removeGoal(hit.id)
            receipts.push(`Goal removed: ${hit.title}`)
          }
          break
        }
        case 'forget': {
          const q = a.fact.toLowerCase()
          const hit = s.profile.facts.find((f) => f.text.toLowerCase().includes(q))
          if (hit) {
            s.removeFact(hit.id)
            receipts.push(`Forgotten: ${hit.text}`)
          }
          break
        }
        case 'add_block': {
          const wd = (a.weekday ?? weekdayOf()) as Weekday
          s.addBlock({ weekday: wd, start: a.start, end: a.end ?? '', title: a.title, detail: a.detail, tag: a.tag ?? 'study' })
          receipts.push(`Scheduled: ${a.title} at ${a.start}`)
          break
        }
        case 'move_block': {
          const q = a.title.toLowerCase()
          const hit = s.schedule.find((b) => b.weekday === weekdayOf() && b.title.toLowerCase().includes(q))
          if (hit) {
            s.updateBlock(hit.id, { start: a.start, ...(a.end !== undefined ? { end: a.end } : {}) })
            receipts.push(`Moved “${hit.title}” to ${a.start}`)
          }
          break
        }
        case 'remove_block': {
          const q = a.title.toLowerCase()
          const hit = s.schedule.find((b) => b.weekday === weekdayOf() && b.title.toLowerCase().includes(q))
          if (hit) {
            s.removeBlock(hit.id)
            receipts.push(`Removed from schedule: ${hit.title}`)
          }
          break
        }

        // ——— corrections & fine-grained control ———
        case 'set_water': {
          s.setWater(date, a.ml)
          receipts.push(`Water corrected to ${(Math.max(0, a.ml) / 1000).toFixed(1)}L today`)
          break
        }
        case 'toggle_supplement': {
          const q = a.name.toLowerCase()
          const hit = s.supplements.find((x) => x.name.toLowerCase().includes(q))
          if (hit) {
            s.toggleSupplement(date, hit.id)
            const takenNow = !!useStore.getState().supLog[date]?.[hit.id]
            receipts.push(`${hit.name}: ${takenNow ? 'taken' : 'unmarked'}`)
          }
          break
        }
        case 'add_supplement': {
          if (a.name.trim()) {
            s.addSupplement(a.name.trim(), a.dose ?? '', a.timing ?? '')
            receipts.push(`Added to stack: ${a.name.trim()}`)
          }
          break
        }
        case 'remove_supplement': {
          const q = a.name.toLowerCase()
          const hit = s.supplements.find((x) => x.name.toLowerCase().includes(q))
          if (hit) {
            s.removeSupplement(hit.id)
            receipts.push(`Removed from stack: ${hit.name}`)
          }
          break
        }
        case 'move_supplement': {
          const q = a.name.toLowerCase()
          const hit = s.supplements.find((x) => x.name.toLowerCase().includes(q))
          if (hit) {
            s.moveSupplement(hit.id, Math.round(a.position) - 1)
            receipts.push(`${hit.name} → position ${Math.max(1, Math.round(a.position))}`)
          }
          break
        }
        case 'update_exercise': {
          const w = s.workouts.find((x) => x.name.toLowerCase().includes(a.workout.toLowerCase()))
          const ex = w?.exercises.find((e) => e.name.toLowerCase().includes(a.exercise.toLowerCase()))
          if (w && ex) {
            s.updateExercise(w.id, ex.id, {
              ...(a.name ? { name: a.name } : {}),
              ...(a.sets != null ? { sets: a.sets } : {}),
              ...(a.reps ? { reps: a.reps } : {}),
              ...(a.cue != null ? { cue: a.cue } : {}),
            })
            receipts.push(`Updated ${w.name}: ${a.name ?? ex.name}${a.sets != null || a.reps ? ` ${a.sets ?? ex.sets}×${a.reps ?? ex.reps}` : ''}`)
          }
          break
        }
        case 'add_exercise': {
          const w = s.workouts.find((x) => x.name.toLowerCase().includes(a.workout.toLowerCase()))
          if (w && a.name.trim()) {
            s.addExercise(w.id, { name: a.name.trim(), sets: a.sets, reps: a.reps, cue: a.cue ?? '' })
            receipts.push(`Added to ${w.name}: ${a.name.trim()} ${a.sets}×${a.reps}`)
          }
          break
        }
        case 'remove_exercise': {
          const w = s.workouts.find((x) => x.name.toLowerCase().includes(a.workout.toLowerCase()))
          const ex = w?.exercises.find((e) => e.name.toLowerCase().includes(a.exercise.toLowerCase()))
          if (w && ex) {
            s.removeExercise(w.id, ex.id)
            receipts.push(`Removed from ${w.name}: ${ex.name}`)
          }
          break
        }

        // ——— workout-level restructuring ———
        case 'add_workout': {
          if (a.name.trim()) {
            s.addWorkout({
              name: a.name.trim(),
              weekday: a.weekday,
              exercises: (a.exercises ?? []).map((ex) => ({ name: ex.name, sets: ex.sets, reps: ex.reps, cue: ex.cue ?? '' })),
            })
            receipts.push(`New workout: ${a.name.trim()} (${a.exercises?.length ?? 0} exercises)`)
          }
          break
        }
        case 'update_workout': {
          const w = s.workouts.find((x) => x.name.toLowerCase().includes(a.workout.toLowerCase()))
          if (w) {
            s.updateWorkout(w.id, {
              ...(a.name ? { name: a.name } : {}),
              ...(a.weekday != null ? { weekday: a.weekday } : {}),
            })
            receipts.push(`Workout updated: ${a.name ?? w.name}`)
          }
          break
        }
        case 'remove_workout': {
          const w = s.workouts.find((x) => x.name.toLowerCase().includes(a.workout.toLowerCase()))
          if (w) {
            s.removeWorkout(w.id)
            receipts.push(`Workout removed: ${w.name}`)
          }
          break
        }

        // ——— total edit control ———
        case 'update_golf': {
          // Prefer today's sessions, newest first; optionally narrow by category/notes fragment
          const pool = [...s.golfSessions].sort((x, y) => (x.date < y.date ? 1 : -1))
          const q = a.session?.toLowerCase()
          const hit = q ? pool.find((g) => g.category.includes(q) || g.notes.toLowerCase().includes(q)) : (pool.find((g) => g.date === date) ?? pool[0])
          if (hit) {
            s.updateGolfSession(hit.id, {
              ...(a.minutes != null && a.minutes > 0 ? { minutes: Math.round(a.minutes) } : {}),
              ...(a.category ? { category: a.category } : {}),
              ...(a.date ? { date: a.date } : {}),
            })
            receipts.push(`Golf session updated${a.minutes != null ? `: ${Math.round(a.minutes)} min` : ''}${a.category ? ` ${a.category}` : ''}`)
          }
          break
        }
        case 'update_run': {
          const hit = s.runLogs.find((r) => r.date === date) ?? s.runLogs[0]
          if (hit) {
            s.updateRun(hit.id, {
              ...(a.minutes != null ? { minutes: Math.round(a.minutes) } : {}),
              ...(a.distanceKm != null ? { distanceKm: a.distanceKm } : {}),
              ...(a.avgHr != null ? { avgHr: Math.round(a.avgHr) } : {}),
            })
            receipts.push(`Run updated${a.minutes != null ? `: ${Math.round(a.minutes)} min` : ''}${a.distanceKm != null ? ` ${a.distanceKm} km` : ''}`)
          }
          break
        }
        case 'update_revenue': {
          const hit = a.match ? s.revenue.find((r) => r.source.toLowerCase().includes(a.match!.toLowerCase())) : s.revenue[0]
          if (hit) {
            s.updateRevenue(hit.id, {
              ...(a.amount != null ? { amount: a.amount } : {}),
              ...(a.source ? { source: a.source } : {}),
            })
            receipts.push(`Revenue entry updated${a.amount != null ? `: $${a.amount}` : ''}`)
          }
          break
        }
        case 'delete_revenue': {
          const hit = a.match ? s.revenue.find((r) => r.source.toLowerCase().includes(a.match!.toLowerCase())) : s.revenue[0]
          if (hit) {
            s.removeRevenue(hit.id)
            receipts.push(`Revenue entry removed: $${hit.amount} (${hit.source})`)
          }
          break
        }
        case 'update_book': {
          const hit = s.books.find((b) => b.title.toLowerCase().includes(a.title.toLowerCase()))
          if (hit) {
            s.updateBook(hit.id, {
              ...(a.newTitle ? { title: a.newTitle } : {}),
              ...(a.author ? { author: a.author } : {}),
              ...(a.status ? { status: a.status } : {}),
              ...(a.currentPage != null ? { currentPage: a.currentPage } : {}),
              ...(a.totalPages != null ? { totalPages: a.totalPages } : {}),
              ...(a.rating != null ? { rating: a.rating } : {}),
            })
            receipts.push(`Book updated: ${a.newTitle ?? hit.title}${a.status ? ` → ${a.status}` : ''}${a.currentPage != null ? ` (p.${a.currentPage})` : ''}`)
          }
          break
        }
        case 'remove_book': {
          const hit = s.books.find((b) => b.title.toLowerCase().includes(a.title.toLowerCase()))
          if (hit) {
            s.removeBook(hit.id)
            receipts.push(`Book removed: ${hit.title}`)
          }
          break
        }
        case 'update_goal': {
          const hit = s.goals.find((g) => g.title.toLowerCase().includes(a.goal.toLowerCase()))
          if (hit) {
            s.updateGoal(hit.id, {
              ...(a.title ? { title: a.title } : {}),
              ...(a.target != null ? { target: a.target } : {}),
              ...(a.deadline !== undefined ? { deadline: a.deadline || null } : {}),
              ...(a.notes != null ? { notes: a.notes } : {}),
            })
            receipts.push(`Goal updated: ${a.title ?? hit.title}`)
          }
          break
        }
        case 'set_macros': {
          const range = (v: number | [number, number] | undefined, prev: [number, number]): [number, number] =>
            v == null ? prev : Array.isArray(v) ? v : [v, v]
          const m0 = s.macros
          s.setMacros({
            kcal: range(a.kcal, m0.kcal),
            protein: range(a.protein, m0.protein),
            carbs: range(a.carbs, m0.carbs),
            fat: range(a.fat, m0.fat),
            waterMl: a.waterMl ?? m0.waterMl,
          })
          receipts.push('Daily macro targets updated')
          break
        }
        case 'update_photo': {
          const pool = [...s.trainingPhotos].sort((x, y) => y.createdAt - x.createdAt)
          const hit = a.photo ? pool.find((p) => (p.caption ?? '').toLowerCase().includes(a.photo!.toLowerCase())) : pool[0]
          if (hit) {
            s.updateTrainingPhoto(hit.id, {
              ...(a.caption != null ? { caption: a.caption } : {}),
              ...(a.category ? { category: a.category } : {}),
              ...(a.date ? { date: a.date } : {}),
            })
            receipts.push(`Photo updated${a.caption ? ` — "${a.caption}"` : ''}`)
          }
          break
        }
        case 'delete_photo': {
          const pool = [...s.trainingPhotos].sort((x, y) => y.createdAt - x.createdAt)
          const hit = a.photo ? pool.find((p) => (p.caption ?? '').toLowerCase().includes(a.photo!.toLowerCase())) : pool[0]
          if (hit) {
            s.removeTrainingPhoto(hit.id)
            receipts.push(`Photo deleted${hit.caption ? ` — "${hit.caption}"` : ''}`)
          }
          break
        }
        case 'update_supplement': {
          const hit = s.supplements.find((x) => x.name.toLowerCase().includes(a.name.toLowerCase()))
          if (hit) {
            s.updateSupplement(hit.id, {
              ...(a.newName ? { name: a.newName } : {}),
              ...(a.dose != null ? { dose: a.dose } : {}),
              ...(a.timing != null ? { timing: a.timing } : {}),
            })
            receipts.push(`Supplement updated: ${a.newName ?? hit.name}`)
          }
          break
        }
        case 'update_biz_task': {
          const hit = s.bizTasks.find((t) => t.title.toLowerCase().includes(a.title.toLowerCase()))
          if (hit) {
            s.updateBizTask(hit.id, {
              ...(a.newTitle ? { title: a.newTitle } : {}),
              ...(a.area ? { area: a.area } : {}),
            })
            receipts.push(`AURORA task updated: ${a.newTitle ?? hit.title}`)
          }
          break
        }
        case 'delete_handicap': {
          const latest = [...s.handicap].sort((x, y) => (x.date < y.date ? -1 : 1)).pop()
          if (latest) {
            s.removeHandicap(latest.id)
            receipts.push(`Handicap entry removed: ${latest.value}`)
          }
          break
        }
        case 'update_checkin': {
          const d = a.date || date
          const prev = s.checkIns[d]
          s.saveCheckIn({
            date: d,
            weightKg: a.weightKg ?? prev?.weightKg ?? null,
            sleepH: a.sleepH ?? prev?.sleepH ?? null,
            sleepQuality: a.sleepQuality ?? prev?.sleepQuality ?? null,
            energy: a.energy ?? prev?.energy ?? null,
            blackoutOnTime: prev?.blackoutOnTime ?? null,
            notes: a.notes ?? prev?.notes ?? '',
          })
          receipts.push(`Check-in updated for ${d}`)
          break
        }

        case 'update_day_type_macro': {
          const q = a.dayType.toLowerCase()
          const hit = s.dayTypeMacros.find((d) => d.code.toLowerCase() === q || d.label.toLowerCase().includes(q))
          if (hit) {
            s.updateDayTypeMacro(hit.code, {
              ...(a.proteinGkg ? { proteinGkg: a.proteinGkg } : {}),
              ...(a.carbGkg ? { carbGkg: a.carbGkg } : {}),
              ...(a.fatGkg ? { fatGkg: a.fatGkg } : {}),
            })
            const parts = [
              a.carbGkg ? `carbs ${a.carbGkg} g/kg` : '',
              a.proteinGkg ? `protein ${a.proteinGkg} g/kg` : '',
              a.fatGkg ? `fat ${a.fatGkg} g/kg` : '',
            ].filter(Boolean)
            receipts.push(`Fuelling framework updated — ${hit.label}: ${parts.join(', ')}`)
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
