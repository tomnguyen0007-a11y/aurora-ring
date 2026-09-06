import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { todayISO, uid } from '../lib/dates'
import { computeExample80kg } from '../lib/dayTypeMacros'
import { inferCategory, inferImportance } from '../lib/jarvis/memory'
import { deletePhoto, savePhoto } from '../lib/photoDb'
import {
  ollieWorkouts,
  seedDayTypeMacros,
  type DayTypeMacro,
  seedBizAreas,
  seedBlockTags,
  seedBooks,
  seedGoals,
  seedGolfCategories,
  seedGolfStats,
  seedGroups,
  seedHabits,
  seedHandicap,
  seedMacros,
  seedMantras,
  seedMealWindows,
  seedMeals,
  seedProfile,
  seedReminders,
  seedSchedule,
  seedSections,
  seedSupplements,
  seedWatchlist,
  seedWorkouts,
} from './seed'
import type {
  BizTask,
  Book,
  ChatMsg,
  CheckIn,
  CustomBlock,
  Exercise,
  FoodLog,
  Goal,
  GolfCategory,
  GolfSession,
  GolfStats,
  GolfRound,
  GolfTimerState,
  GroceryItem,
  GroupDef,
  Habit,
  HabitLog,
  HandicapEntry,
  HevySession,
  KnowledgeDoc,
  LlmProvider,
  MacroTargets,
  Mantra,
  MemoryCategory,
  MealOption,
  Note,
  Profile,
  Reminder,
  RevenueEntry,
  RunLog,
  ScheduleBlock,
  SectionDef,
  SetEntry,
  Settings,
  SupplementItem,
  TableDoc,
  Taxon,
  TrainingPhoto,
  WatchItem,
  Workout,
  WorkoutLog,
} from './types'

/** Which editable taxonomy a rename/add/remove targets. */
export type TaxonomyKey = 'golfCategories' | 'blockTags' | 'bizAreas' | 'mealWindows'

/** Move an item within an array to a new index, immutably. */
function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list
  const target = Math.max(0, Math.min(list.length - 1, to))
  if (target === from) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(target, 0, item)
  return next
}

export interface CalibrateState {
  // ── navigation & section registry ──
  view: string
  setView: (v: string) => void
  sections: SectionDef[]
  groups: GroupDef[]
  addSection: (s: Partial<SectionDef> & { label: string }) => string
  updateSection: (id: string, patch: Partial<SectionDef>) => void
  removeSection: (id: string) => void
  moveSection: (id: string, direction: -1 | 1) => void
  addGroup: (label: string) => string
  updateGroup: (id: string, patch: Partial<GroupDef>) => void
  removeGroup: (id: string) => void
  resetSections: () => void

  // ── custom sections ──
  customBlocks: Record<string, CustomBlock[]>
  addBlockTo: (sectionId: string, kind: CustomBlock['kind'], title?: string) => string
  updateCustomBlock: (sectionId: string, blockId: string, patch: Partial<CustomBlock>) => void
  removeCustomBlock: (sectionId: string, blockId: string) => void
  moveCustomBlock: (sectionId: string, blockId: string, direction: -1 | 1) => void

  // ── editable taxonomies ──
  golfCategories: Taxon[]
  blockTags: Taxon[]
  bizAreas: Taxon[]
  mealWindows: Taxon[]
  addTaxon: (key: TaxonomyKey, label: string) => string
  renameTaxon: (key: TaxonomyKey, id: string, label: string) => void
  removeTaxon: (key: TaxonomyKey, id: string) => void
  moveTaxon: (key: TaxonomyKey, id: string, direction: -1 | 1) => void

  // ── schedule ──
  schedule: ScheduleBlock[]
  dayChecks: Record<string, Record<string, boolean>>
  toggleBlock: (date: string, blockId: string) => void
  addBlock: (b: Omit<ScheduleBlock, 'id'>) => void
  updateBlock: (id: string, patch: Partial<ScheduleBlock>) => void
  removeBlock: (id: string) => void
  duplicateBlockToDay: (id: string, weekday: ScheduleBlock['weekday']) => void

  // ── training ──
  workouts: Workout[]
  workoutLogs: WorkoutLog[]
  runLogs: RunLog[]
  logSet: (date: string, workoutId: string, exerciseId: string, setIdx: number, patch: Partial<SetEntry>) => void
  setWorkoutDone: (date: string, workoutId: string, done: boolean) => void
  addWorkout: (w: Omit<Workout, 'id' | 'exercises'> & { exercises?: Omit<Exercise, 'id'>[] }) => string
  updateWorkout: (id: string, patch: Partial<Pick<Workout, 'name' | 'weekday'>>) => void
  removeWorkout: (id: string) => void
  moveWorkout: (id: string, direction: -1 | 1) => void
  addExercise: (workoutId: string, ex: Omit<Exercise, 'id'>) => void
  updateExercise: (workoutId: string, exId: string, patch: Partial<Exercise>) => void
  removeExercise: (workoutId: string, exId: string) => void
  moveExercise: (workoutId: string, exId: string, direction: -1 | 1) => void
  addRun: (r: Omit<RunLog, 'id'>) => void
  updateRun: (id: string, patch: Partial<Omit<RunLog, 'id'>>) => void
  removeRun: (id: string) => void
  loadOllieLibrary: () => void

  // ── golf ──
  golfSessions: GolfSession[]
  handicap: HandicapEntry[]
  addGolfSession: (s: Omit<GolfSession, 'id'>) => void
  updateGolfSession: (id: string, patch: Partial<GolfSession>) => void
  removeGolfSession: (id: string) => void
  addHandicap: (value: number, date?: string) => void
  removeHandicap: (id: string) => void
  /** persisted wall-clock practice timer; survives phone lock and PWA reload */
  golfTimer: GolfTimerState | null
  startGolfTimer: (category: GolfCategory) => void
  pauseGolfTimer: () => void
  resumeGolfTimer: () => void
  /** Logs the session (if long enough) and clears the timer. Returns minutes logged, if any. */
  stopGolfTimer: () => number | null

  // ── goals ──
  goals: Goal[]
  addGoal: (g: Partial<Goal> & { title: string }) => string
  updateGoal: (id: string, patch: Partial<Goal>) => void
  removeGoal: (id: string) => void
  moveGoal: (id: string, direction: -1 | 1) => void
  toggleMilestone: (goalId: string, msId: string) => void
  addMilestone: (goalId: string, title: string) => void
  updateMilestone: (goalId: string, msId: string, title: string) => void
  removeMilestone: (goalId: string, msId: string) => void

  // ── nutrition ──
  macros: MacroTargets
  setMacros: (m: Partial<MacroTargets>) => void
  meals: MealOption[]
  addMeal: (m: Omit<MealOption, 'id'>) => void
  updateMeal: (id: string, patch: Partial<MealOption>) => void
  removeMeal: (id: string) => void
  foodLogs: FoodLog[]
  water: Record<string, number>
  addFood: (f: Omit<FoodLog, 'id'>) => void
  updateFood: (id: string, patch: Partial<FoodLog>) => void
  removeFood: (id: string) => void
  addWater: (date: string, ml: number) => void
  setWater: (date: string, ml: number) => void
  /** fuelling framework — carb periodisation by day type, editable from chat or Fuel */
  dayTypeMacros: DayTypeMacro[]
  updateDayTypeMacro: (code: string, patch: Partial<Pick<DayTypeMacro, 'label' | 'proteinGkg' | 'carbGkg' | 'fatGkg'>>) => void

  // ── grocery ──
  grocery: GroceryItem[]
  addGrocery: (name: string, qty?: string) => void
  updateGrocery: (id: string, patch: Partial<GroceryItem>) => void
  toggleGrocery: (id: string) => void
  removeGrocery: (id: string) => void
  clearDoneGrocery: () => void

  // ── notes & tables ──
  notes: Note[]
  tables: TableDoc[]
  addNote: (title: string, body?: string) => string
  updateNote: (id: string, patch: Partial<Note>) => void
  removeNote: (id: string) => void
  addTable: (name: string) => string
  updateTable: (id: string, patch: Partial<TableDoc>) => void
  removeTable: (id: string) => void

  // ── business ──
  bizTasks: BizTask[]
  revenue: RevenueEntry[]
  addBizTask: (title: string, area?: string) => void
  updateBizTask: (id: string, patch: Partial<BizTask>) => void
  toggleBizTask: (id: string) => void
  removeBizTask: (id: string) => void
  addRevenue: (r: Omit<RevenueEntry, 'id'>) => void
  updateRevenue: (id: string, patch: Partial<Omit<RevenueEntry, 'id'>>) => void
  removeRevenue: (id: string) => void
  revenueTarget: number
  setRevenueTarget: (n: number) => void

  // ── books ──
  books: Book[]
  readingLog: Record<string, number>
  addBook: (b: Partial<Book> & { title: string }) => void
  updateBook: (id: string, patch: Partial<Book>) => void
  removeBook: (id: string) => void
  logReading: (date: string, minutes: number) => void

  // ── check-ins, habits, reminders ──
  checkIns: Record<string, CheckIn>
  saveCheckIn: (c: CheckIn) => void
  habits: Habit[]
  habitLog: HabitLog
  addHabit: (label: string, kind?: Habit['kind'], target?: number, unit?: string) => string
  updateHabit: (id: string, patch: Partial<Habit>) => void
  removeHabit: (id: string) => void
  moveHabit: (id: string, direction: -1 | 1) => void
  setHabit: (date: string, habitId: string, value: number) => void
  toggleHabit: (date: string, habitId: string) => void
  reminders: Reminder[]
  addReminder: (r: Partial<Reminder> & { label: string; time: string }) => string
  updateReminder: (id: string, patch: Partial<Reminder>) => void
  removeReminder: (id: string) => void

  // ── markets ──
  watchlist: WatchItem[]
  addWatch: (w: Omit<WatchItem, 'id'>) => void
  removeWatch: (id: string) => void
  moveWatch: (id: string, direction: -1 | 1) => void

  // ── jarvis ──
  chat: ChatMsg[]
  pushChat: (m: Omit<ChatMsg, 'id' | 'ts'>) => void
  clearChat: () => void
  profile: Profile
  setProfile: (patch: Partial<Profile>) => void
  addFact: (text: string, category?: MemoryCategory, importance?: number) => void
  updateFact: (id: string, patch: Partial<{ text: string; importance: number; category: MemoryCategory }>) => void
  removeFact: (id: string) => void
  /** Brain Feed — user-fed docs (Obsidian notes, specs, coach material) injected into Jarvis's context */
  knowledgeDocs: KnowledgeDoc[]
  addKnowledgeDoc: (title: string, body?: string, source?: string, pinned?: boolean) => string
  updateKnowledgeDoc: (id: string, patch: Partial<KnowledgeDoc>) => void
  removeKnowledgeDoc: (id: string) => void
  toggleKnowledgePin: (id: string) => void

  /** dated photo log for Golf/Training; blobs live in IndexedDB, metadata here */
  trainingPhotos: TrainingPhoto[]
  addTrainingPhoto: (photo: Omit<TrainingPhoto, 'id' | 'createdAt'>) => string
  updateTrainingPhoto: (id: string, patch: Partial<Pick<TrainingPhoto, 'caption' | 'date' | 'category'>>) => void
  removeTrainingPhoto: (id: string) => void

  /** which engine answered last, for the transparency line under the composer */
  lastJarvisSource: 'local' | LlmProvider | 'rate-limited' | null
  setLastJarvisSource: (source: CalibrateState['lastJarvisSource']) => void

  // ── mindset ──
  mantras: Mantra[]
  addMantra: (text: string, author?: string, tag?: string) => void
  updateMantra: (id: string, patch: Partial<Mantra>) => void
  removeMantra: (id: string) => void

  // ── recovery ──
  supplements: SupplementItem[]
  supLog: Record<string, Record<string, boolean>>
  toggleSupplement: (date: string, id: string) => void
  addSupplement: (name: string, dose?: string, timing?: string) => void
  updateSupplement: (id: string, patch: Partial<SupplementItem>) => void
  removeSupplement: (id: string) => void
  moveSupplement: (id: string, position: number) => void

  // ── golf diagnostic + integrations ──
  golfStats: GolfStats
  setGolfStats: (patch: Partial<GolfStats>) => void
  hevySessions: HevySession[]
  setHevySessions: (sessions: HevySession[]) => void
  golfRounds: GolfRound[]
  setGolfRounds: (rounds: GolfRound[]) => void

  // ── settings ──
  settings: Settings
  setSettings: (patch: Partial<Settings>) => void

  resetAll: () => void
}

const defaultSettings: Settings = {
  userName: 'Tom',
  provider: 'none',
  anthropicKey: '',
  geminiKey: '',
  anthropicModel: 'claude-sonnet-5',
  geminiModel: 'gemini-2.5-flash',
  groqKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  openrouterKey: '',
  openrouterModel: 'qwen/qwen2.5-vl-72b-instruct:free',
  localBaseUrl: 'http://127.0.0.1:11434/v1',
  localModel: '',
  finnhubKey: '',
  usdaKey: '',
  gnewsKey: '',
  newsCountry: 'us',
  speakReplies: true,
  voiceURI: '',
  elevenKey: '',
  elevenVoiceId: 'onwK4e9ZLuTAKqWW03F9',
  openaiKey: '',
  notifyEnabled: false,
  hevyKey: '',
  supabaseUrl: '',
  supabaseKey: '',
  syncCode: '',
  agentSteps: 6,
  webSearch: true,
  remindersEnabled: false,
  closeoutTime: '21:00',
  density: 'comfortable',
  hideEmpty: false,
}

const seedState = () => ({
  view: 'today',
  sections: seedSections.map((s) => ({ ...s })),
  groups: seedGroups.map((g) => ({ ...g })),
  customBlocks: {} as Record<string, CustomBlock[]>,
  golfCategories: seedGolfCategories.map((t) => ({ ...t })),
  blockTags: seedBlockTags.map((t) => ({ ...t })),
  bizAreas: seedBizAreas.map((t) => ({ ...t })),
  mealWindows: seedMealWindows.map((t) => ({ ...t })),
  schedule: seedSchedule,
  dayChecks: {},
  workouts: seedWorkouts,
  workoutLogs: [],
  runLogs: [],
  golfSessions: [],
  handicap: [seedHandicap],
  goals: seedGoals,
  macros: seedMacros,
  meals: seedMeals,
  foodLogs: [],
  water: {},
  grocery: [],
  notes: [],
  tables: [],
  bizTasks: [],
  revenue: [],
  revenueTarget: 1000,
  books: seedBooks,
  readingLog: {},
  checkIns: {},
  habits: seedHabits.map((h) => ({ ...h })),
  habitLog: {} as HabitLog,
  reminders: seedReminders.map((r) => ({ ...r })),
  watchlist: seedWatchlist,
  chat: [],
  profile: seedProfile,
  knowledgeDocs: [] as KnowledgeDoc[],
  trainingPhotos: [] as TrainingPhoto[],
  golfTimer: null as GolfTimerState | null,
  dayTypeMacros: seedDayTypeMacros,
  lastJarvisSource: null as CalibrateState['lastJarvisSource'],
  mantras: seedMantras,
  supplements: seedSupplements,
  supLog: {},
  golfStats: seedGolfStats,
  hevySessions: [],
  golfRounds: [],
  settings: defaultSettings,
})

export const useStore = create<CalibrateState>()(
  persist(
    (set, get) => ({
      ...seedState(),

      // ══════════════ NAVIGATION & SECTION REGISTRY ══════════════
      setView: (view) => set({ view }),

      addSection: (s) => {
        const id = s.id ?? uid('sec')
        set((st) => {
          const group = s.group && st.groups.some((g) => g.id === s.group) ? s.group : (st.groups[0]?.id ?? 'system')
          const order = st.sections.filter((x) => x.group === group).length
          return {
            sections: [
              ...st.sections,
              {
                id,
                module: s.module ?? 'custom',
                label: s.label,
                group,
                icon: s.icon ?? 'custom',
                order: s.order ?? order,
                hidden: s.hidden ?? false,
                bar: s.bar ?? false,
              },
            ],
          }
        })
        return id
      },
      updateSection: (id, patch) =>
        set((st) => ({ sections: st.sections.map((x) => (x.id === id ? { ...x, ...patch, id: x.id } : x)) })),
      removeSection: (id) =>
        set((st) => {
          const next = st.sections.filter((x) => x.id !== id)
          const blocks = { ...st.customBlocks }
          delete blocks[id]
          return {
            sections: next,
            customBlocks: blocks,
            view: st.view === id ? (next.find((x) => !x.hidden)?.id ?? 'today') : st.view,
          }
        }),
      moveSection: (id, direction) =>
        set((st) => {
          const target = st.sections.find((x) => x.id === id)
          if (!target) return {}
          const siblings = st.sections
            .filter((x) => x.group === target.group)
            .sort((a, b) => a.order - b.order)
          const idx = siblings.findIndex((x) => x.id === id)
          const reordered = reorder(siblings, idx, idx + direction)
          const orderById = new Map(reordered.map((x, i) => [x.id, i]))
          return {
            sections: st.sections.map((x) => (orderById.has(x.id) ? { ...x, order: orderById.get(x.id)! } : x)),
          }
        }),
      addGroup: (label) => {
        const id = uid('grp')
        set((st) => ({ groups: [...st.groups, { id, label, order: st.groups.length }] }))
        return id
      },
      updateGroup: (id, patch) =>
        set((st) => ({ groups: st.groups.map((g) => (g.id === id ? { ...g, ...patch, id: g.id } : g)) })),
      removeGroup: (id) =>
        set((st) => {
          if (st.groups.length <= 1) return {}
          const fallback = st.groups.find((g) => g.id !== id)!.id
          return {
            groups: st.groups.filter((g) => g.id !== id),
            sections: st.sections.map((s) => (s.group === id ? { ...s, group: fallback } : s)),
          }
        }),
      resetSections: () => set({ sections: seedSections.map((s) => ({ ...s })), groups: seedGroups.map((g) => ({ ...g })) }),

      // ══════════════ CUSTOM SECTION BLOCKS ══════════════
      addBlockTo: (sectionId, kind, title) => {
        const id = uid('blk')
        const base: CustomBlock = {
          id,
          kind,
          title: title ?? { checklist: 'Checklist', counter: 'Counter', note: 'Note', table: 'Table', metric: 'Metric' }[kind],
          ...(kind === 'checklist' ? { items: [] } : {}),
          ...(kind === 'counter' ? { step: 1, target: 0, unit: '', series: {} } : {}),
          ...(kind === 'metric' ? { unit: '', series: {} } : {}),
          ...(kind === 'note' ? { body: '' } : {}),
          ...(kind === 'table' ? { columns: ['Column 1', 'Column 2'], rows: [['', '']] } : {}),
        }
        set((st) => ({ customBlocks: { ...st.customBlocks, [sectionId]: [...(st.customBlocks[sectionId] ?? []), base] } }))
        return id
      },
      updateCustomBlock: (sectionId, blockId, patch) =>
        set((st) => ({
          customBlocks: {
            ...st.customBlocks,
            [sectionId]: (st.customBlocks[sectionId] ?? []).map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
          },
        })),
      removeCustomBlock: (sectionId, blockId) =>
        set((st) => ({
          customBlocks: {
            ...st.customBlocks,
            [sectionId]: (st.customBlocks[sectionId] ?? []).filter((b) => b.id !== blockId),
          },
        })),
      moveCustomBlock: (sectionId, blockId, direction) =>
        set((st) => {
          const list = st.customBlocks[sectionId] ?? []
          const idx = list.findIndex((b) => b.id === blockId)
          return { customBlocks: { ...st.customBlocks, [sectionId]: reorder(list, idx, idx + direction) } }
        }),

      // ══════════════ TAXONOMIES ══════════════
      addTaxon: (key, label) => {
        const id = uid('tx')
        set((st) => ({ [key]: [...st[key], { id, label }] }) as Partial<CalibrateState>)
        return id
      },
      renameTaxon: (key, id, label) =>
        set((st) => ({ [key]: st[key].map((t) => (t.id === id ? { ...t, label } : t)) }) as Partial<CalibrateState>),
      removeTaxon: (key, id) =>
        set((st) => (st[key].length <= 1 ? {} : ({ [key]: st[key].filter((t) => t.id !== id) } as Partial<CalibrateState>))),
      moveTaxon: (key, id, direction) =>
        set((st) => {
          const idx = st[key].findIndex((t) => t.id === id)
          return { [key]: reorder(st[key], idx, idx + direction) } as Partial<CalibrateState>
        }),

      // ══════════════ SCHEDULE ══════════════
      toggleBlock: (date, blockId) =>
        set((s) => {
          const day = { ...(s.dayChecks[date] ?? {}) }
          day[blockId] = !day[blockId]
          return { dayChecks: { ...s.dayChecks, [date]: day } }
        }),
      addBlock: (b) => set((s) => ({ schedule: [...s.schedule, { ...b, id: uid('blk') }] })),
      updateBlock: (id, patch) =>
        set((s) => ({ schedule: s.schedule.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
      removeBlock: (id) => set((s) => ({ schedule: s.schedule.filter((b) => b.id !== id) })),
      duplicateBlockToDay: (id, weekday) =>
        set((s) => {
          const src = s.schedule.find((b) => b.id === id)
          return src ? { schedule: [...s.schedule, { ...src, id: uid('blk'), weekday }] } : {}
        }),

      // ══════════════ TRAINING ══════════════
      logSet: (date, workoutId, exerciseId, setIdx, patch) =>
        set((s) => {
          const logs = [...s.workoutLogs]
          let log = logs.find((l) => l.date === date && l.workoutId === workoutId)
          if (!log) {
            log = { id: uid('wl'), date, workoutId, entries: {}, completed: false }
            logs.push(log)
          }
          const workout = s.workouts.find((w) => w.id === workoutId)
          const ex = workout?.exercises.find((e) => e.id === exerciseId)
          const sets = [...(log.entries[exerciseId] ?? Array.from({ length: ex?.sets ?? 3 }, () => ({ weight: null, reps: null })))]
          while (sets.length <= setIdx) sets.push({ weight: null, reps: null })
          sets[setIdx] = { ...sets[setIdx], ...patch }
          const updated = { ...log, entries: { ...log.entries, [exerciseId]: sets } }
          return { workoutLogs: logs.map((l) => (l.id === updated.id ? updated : l)) }
        }),
      setWorkoutDone: (date, workoutId, done) =>
        set((s) => {
          const logs = [...s.workoutLogs]
          const log = logs.find((l) => l.date === date && l.workoutId === workoutId)
          if (!log) {
            logs.push({ id: uid('wl'), date, workoutId, entries: {}, completed: done })
            return { workoutLogs: logs }
          }
          return { workoutLogs: logs.map((l) => (l.id === log.id ? { ...l, completed: done } : l)) }
        }),
      addWorkout: ({ exercises = [], ...w }) => {
        const id = uid('wo')
        set((s) => ({
          workouts: [...s.workouts, { ...w, id, exercises: exercises.map((ex) => ({ ...ex, id: uid('ex') })) }],
        }))
        return id
      },
      updateWorkout: (id, patch) => set((s) => ({ workouts: s.workouts.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
      removeWorkout: (id) => set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) })),
      moveWorkout: (id, direction) =>
        set((s) => {
          const idx = s.workouts.findIndex((w) => w.id === id)
          return { workouts: reorder(s.workouts, idx, idx + direction) }
        }),
      addExercise: (workoutId, ex) =>
        set((s) => ({
          workouts: s.workouts.map((w) =>
            w.id === workoutId ? { ...w, exercises: [...w.exercises, { ...ex, id: uid('ex') }] } : w,
          ),
        })),
      updateExercise: (workoutId, exId, patch) =>
        set((s) => ({
          workouts: s.workouts.map((w) =>
            w.id === workoutId ? { ...w, exercises: w.exercises.map((e) => (e.id === exId ? { ...e, ...patch } : e)) } : w,
          ),
        })),
      removeExercise: (workoutId, exId) =>
        set((s) => ({
          workouts: s.workouts.map((w) =>
            w.id === workoutId ? { ...w, exercises: w.exercises.filter((e) => e.id !== exId) } : w,
          ),
        })),
      moveExercise: (workoutId, exId, direction) =>
        set((s) => ({
          workouts: s.workouts.map((w) => {
            if (w.id !== workoutId) return w
            const idx = w.exercises.findIndex((e) => e.id === exId)
            return { ...w, exercises: reorder(w.exercises, idx, idx + direction) }
          }),
        })),
      addRun: (r) => set((s) => ({ runLogs: [{ ...r, id: uid('run') }, ...s.runLogs] })),
      updateRun: (id, patch) => set((s) => ({ runLogs: s.runLogs.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      removeRun: (id) => set((s) => ({ runLogs: s.runLogs.filter((r) => r.id !== id) })),
      loadOllieLibrary: () =>
        set((s) =>
          s.workouts.some((w) => w.id.startsWith('o-')) ? {} : { workouts: [...s.workouts, ...ollieWorkouts] },
        ),

      // ══════════════ GOLF ══════════════
      addGolfSession: (g) => set((s) => ({ golfSessions: [{ ...g, id: uid('gs') }, ...s.golfSessions] })),
      updateGolfSession: (id, patch) =>
        set((s) => ({ golfSessions: s.golfSessions.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
      removeGolfSession: (id) => set((s) => ({ golfSessions: s.golfSessions.filter((g) => g.id !== id) })),
      addHandicap: (value, date = todayISO()) =>
        set((s) => ({ handicap: [...s.handicap, { id: uid('hcp'), date, value }] })),
      removeHandicap: (id) => set((s) => ({ handicap: s.handicap.filter((h) => h.id !== id) })),

      // Elapsed time is DERIVED from wall-clock stamps, never ticked by an
      // interval — a suspended tab cannot make the timer fall behind.
      startGolfTimer: (category) => set({ golfTimer: { category, startedAt: Date.now(), accumulatedSec: 0 } }),
      pauseGolfTimer: () =>
        set((s) => {
          const t = s.golfTimer
          if (!t || t.startedAt === null) return {}
          const ranSec = (Date.now() - t.startedAt) / 1000
          return { golfTimer: { ...t, startedAt: null, accumulatedSec: t.accumulatedSec + ranSec } }
        }),
      resumeGolfTimer: () =>
        set((s) => {
          const t = s.golfTimer
          if (!t || t.startedAt !== null) return {}
          return { golfTimer: { ...t, startedAt: Date.now() } }
        }),
      stopGolfTimer: () => {
        const t = get().golfTimer
        if (!t) return null
        const ranSec = t.startedAt !== null ? (Date.now() - t.startedAt) / 1000 : 0
        const totalSec = t.accumulatedSec + ranSec
        const minutes = Math.max(1, Math.round(totalSec / 60))
        set({ golfTimer: null })
        if (totalSec >= 30) {
          get().addGolfSession({ date: todayISO(), category: t.category, minutes, notes: 'timer' })
          return minutes
        }
        return null
      },

      // ══════════════ GOALS ══════════════
      addGoal: (g) => {
        const id = uid('g')
        set((s) => ({
          goals: [
            ...s.goals,
            {
              id,
              pillar: g.pillar ?? 'custom',
              title: g.title,
              target: g.target ?? '',
              deadline: g.deadline ?? null,
              progress: g.progress ?? 0,
              milestones: g.milestones ?? [],
              notes: g.notes ?? '',
            },
          ],
        }))
        return id
      },
      updateGoal: (id, patch) => set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
      removeGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),
      moveGoal: (id, direction) =>
        set((s) => {
          const idx = s.goals.findIndex((g) => g.id === id)
          return { goals: reorder(s.goals, idx, idx + direction) }
        }),
      toggleMilestone: (goalId, msId) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId ? { ...g, milestones: g.milestones.map((m) => (m.id === msId ? { ...m, done: !m.done } : m)) } : g,
          ),
        })),
      addMilestone: (goalId, title) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId ? { ...g, milestones: [...g.milestones, { id: uid('m'), title, done: false }] } : g,
          ),
        })),
      updateMilestone: (goalId, msId, title) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId ? { ...g, milestones: g.milestones.map((m) => (m.id === msId ? { ...m, title } : m)) } : g,
          ),
        })),
      removeMilestone: (goalId, msId) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === goalId ? { ...g, milestones: g.milestones.filter((m) => m.id !== msId) } : g)),
        })),

      // ══════════════ NUTRITION ══════════════
      setMacros: (m) => set((s) => ({ macros: { ...s.macros, ...m } })),
      addMeal: (m) => set((s) => ({ meals: [...s.meals, { ...m, id: uid('meal') }] })),
      updateMeal: (id, patch) => set((s) => ({ meals: s.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      removeMeal: (id) => set((s) => ({ meals: s.meals.filter((m) => m.id !== id) })),
      addFood: (f) => set((s) => ({ foodLogs: [{ ...f, id: uid('food') }, ...s.foodLogs] })),
      updateFood: (id, patch) => set((s) => ({ foodLogs: s.foodLogs.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      removeFood: (id) => set((s) => ({ foodLogs: s.foodLogs.filter((f) => f.id !== id) })),
      addWater: (date, ml) => set((s) => ({ water: { ...s.water, [date]: Math.max(0, (s.water[date] ?? 0) + ml) } })),
      setWater: (date, ml) => set((s) => ({ water: { ...s.water, [date]: Math.max(0, Math.round(ml)) } })),
      updateDayTypeMacro: (code, patch) =>
        set((s) => ({
          dayTypeMacros: s.dayTypeMacros.map((d) => {
            if (d.code !== code) return d
            const merged = { ...d, ...patch }
            return { ...merged, example80kg: computeExample80kg(merged.proteinGkg, merged.carbGkg, merged.fatGkg) }
          }),
        })),

      // ══════════════ GROCERY ══════════════
      addGrocery: (name, qty = '') => set((s) => ({ grocery: [...s.grocery, { id: uid('gr'), name, qty, done: false }] })),
      updateGrocery: (id, patch) => set((s) => ({ grocery: s.grocery.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
      toggleGrocery: (id) => set((s) => ({ grocery: s.grocery.map((g) => (g.id === id ? { ...g, done: !g.done } : g)) })),
      removeGrocery: (id) => set((s) => ({ grocery: s.grocery.filter((g) => g.id !== id) })),
      clearDoneGrocery: () => set((s) => ({ grocery: s.grocery.filter((g) => !g.done) })),

      // ══════════════ NOTES ══════════════
      addNote: (title, body = '') => {
        const id = uid('note')
        set((s) => ({ notes: [{ id, title, body, pinned: false, updated: Date.now() }, ...s.notes] }))
        return id
      },
      updateNote: (id, patch) =>
        set((s) => ({ notes: s.notes.map((nt) => (nt.id === id ? { ...nt, ...patch, updated: Date.now() } : nt)) })),
      removeNote: (id) => set((s) => ({ notes: s.notes.filter((nt) => nt.id !== id) })),
      addTable: (name) => {
        const id = uid('tbl')
        set((s) => ({
          tables: [{ id, name, columns: ['Column 1', 'Column 2', 'Column 3'], rows: [['', '', '']], updated: Date.now() }, ...s.tables],
        }))
        return id
      },
      updateTable: (id, patch) =>
        set((s) => ({ tables: s.tables.map((t) => (t.id === id ? { ...t, ...patch, updated: Date.now() } : t)) })),
      removeTable: (id) => set((s) => ({ tables: s.tables.filter((t) => t.id !== id) })),

      // ══════════════ BUSINESS ══════════════
      addBizTask: (title, area) =>
        set((s) => ({
          bizTasks: [{ id: uid('bt'), title, area: area ?? s.bizAreas[0]?.id ?? 'ops', done: false, created: Date.now() }, ...s.bizTasks],
        })),
      updateBizTask: (id, patch) => set((s) => ({ bizTasks: s.bizTasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      toggleBizTask: (id) => set((s) => ({ bizTasks: s.bizTasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),
      removeBizTask: (id) => set((s) => ({ bizTasks: s.bizTasks.filter((t) => t.id !== id) })),
      addRevenue: (r) => set((s) => ({ revenue: [{ ...r, id: uid('rev') }, ...s.revenue] })),
      updateRevenue: (id, patch) =>
        set((s) => ({ revenue: s.revenue.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      removeRevenue: (id) => set((s) => ({ revenue: s.revenue.filter((r) => r.id !== id) })),
      setRevenueTarget: (n) => set({ revenueTarget: Math.max(1, Math.round(n)) }),

      // ══════════════ BOOKS ══════════════
      addBook: (b) =>
        set((s) => ({
          books: [
            {
              id: uid('bk'),
              title: b.title,
              author: b.author ?? '',
              status: b.status ?? 'reading',
              currentPage: b.currentPage ?? 0,
              totalPages: b.totalPages ?? 0,
              rating: b.rating ?? null,
              notes: b.notes ?? '',
            },
            ...s.books,
          ],
        })),
      updateBook: (id, patch) => set((s) => ({ books: s.books.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
      removeBook: (id) => set((s) => ({ books: s.books.filter((b) => b.id !== id) })),
      logReading: (date, minutes) =>
        set((s) => ({ readingLog: { ...s.readingLog, [date]: Math.max(0, (s.readingLog[date] ?? 0) + minutes) } })),

      // ══════════════ CHECK-INS / HABITS / REMINDERS ══════════════
      saveCheckIn: (c) => set((s) => ({ checkIns: { ...s.checkIns, [c.date]: c } })),
      addHabit: (label, kind = 'boolean', target = 1, unit = '') => {
        const id = uid('h')
        set((s) => ({ habits: [...s.habits, { id, label, kind, target, unit, order: s.habits.length, archived: false, days: [] }] }))
        return id
      },
      updateHabit: (id, patch) => set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) })),
      removeHabit: (id) => set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),
      moveHabit: (id, direction) =>
        set((s) => {
          const idx = s.habits.findIndex((h) => h.id === id)
          return { habits: reorder(s.habits, idx, idx + direction).map((h, i) => ({ ...h, order: i })) }
        }),
      setHabit: (date, habitId, value) =>
        set((s) => ({ habitLog: { ...s.habitLog, [date]: { ...(s.habitLog[date] ?? {}), [habitId]: Math.max(0, value) } } })),
      toggleHabit: (date, habitId) =>
        set((s) => {
          const day = { ...(s.habitLog[date] ?? {}) }
          day[habitId] = day[habitId] ? 0 : 1
          return { habitLog: { ...s.habitLog, [date]: day } }
        }),
      addReminder: (r) => {
        const id = uid('rem')
        set((s) => ({
          reminders: [
            ...s.reminders,
            { id, label: r.label, body: r.body ?? '', time: r.time, days: r.days ?? [], enabled: r.enabled ?? true, sectionId: r.sectionId },
          ],
        }))
        return id
      },
      updateReminder: (id, patch) => set((s) => ({ reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      removeReminder: (id) => set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) })),

      // ══════════════ MARKETS ══════════════
      addWatch: (w) => set((s) => ({ watchlist: [...s.watchlist, { ...w, id: uid('watch') }] })),
      removeWatch: (id) => set((s) => ({ watchlist: s.watchlist.filter((w) => w.id !== id) })),
      moveWatch: (id, direction) =>
        set((s) => {
          const idx = s.watchlist.findIndex((w) => w.id === id)
          return { watchlist: reorder(s.watchlist, idx, idx + direction) }
        }),

      // ══════════════ JARVIS ══════════════
      pushChat: (m) => set((s) => ({ chat: [...s.chat.slice(-149), { ...m, id: uid('msg'), ts: Date.now() }] })),
      clearChat: () => set({ chat: [] }),
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      addFact: (text, category = 'life', importance = 5) =>
        set((s) => {
          const now = Date.now()
          if (s.profile.facts.some((f) => f.text.toLowerCase() === text.toLowerCase())) return {}
          return {
            profile: {
              ...s.profile,
              facts: [...s.profile.facts, { id: uid('fact'), text, category, importance, createdAt: now, lastAccessed: now, accessCount: 0 }],
            },
          }
        }),
      updateFact: (id, patch) =>
        set((s) => ({ profile: { ...s.profile, facts: s.profile.facts.map((f) => (f.id === id ? { ...f, ...patch } : f)) } })),
      removeFact: (id) => set((s) => ({ profile: { ...s.profile, facts: s.profile.facts.filter((f) => f.id !== id) } })),
      addKnowledgeDoc: (title, body = '', source = 'pasted', pinned = false) => {
        const id = uid('kd')
        set((s) => ({
          knowledgeDocs: [
            { id, title: title.trim() || 'Untitled note', body, source, updated: Date.now(), pinned },
            ...s.knowledgeDocs,
          ],
        }))
        return id
      },
      updateKnowledgeDoc: (id, patch) =>
        set((s) => ({ knowledgeDocs: s.knowledgeDocs.map((k) => (k.id === id ? { ...k, ...patch, updated: Date.now() } : k)) })),
      removeKnowledgeDoc: (id) => set((s) => ({ knowledgeDocs: s.knowledgeDocs.filter((k) => k.id !== id) })),
      toggleKnowledgePin: (id) =>
        set((s) => ({ knowledgeDocs: s.knowledgeDocs.map((k) => (k.id === id ? { ...k, pinned: !k.pinned } : k)) })),

      // Blobs go to IndexedDB; only metadata enters the persist store — see lib/photoDb.
      addTrainingPhoto: (photo) => {
        const id = uid('ph')
        const { dataUrl, ...meta } = photo
        if (dataUrl) void savePhoto(id, dataUrl)
        set((s) => ({ trainingPhotos: [{ ...meta, id, createdAt: Date.now() }, ...s.trainingPhotos] }))
        return id
      },
      updateTrainingPhoto: (id, patch) =>
        set((s) => ({ trainingPhotos: s.trainingPhotos.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removeTrainingPhoto: (id) => {
        void deletePhoto(id)
        set((s) => ({ trainingPhotos: s.trainingPhotos.filter((p) => p.id !== id) }))
      },

      setLastJarvisSource: (source) => set({ lastJarvisSource: source }),

      // ══════════════ MINDSET ══════════════
      addMantra: (text, author = '', tag = 'custom') =>
        set((s) => ({ mantras: [{ id: uid('mantra'), text, author, tag }, ...s.mantras] })),
      updateMantra: (id, patch) => set((s) => ({ mantras: s.mantras.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      removeMantra: (id) => set((s) => ({ mantras: s.mantras.filter((m) => m.id !== id) })),

      // ══════════════ RECOVERY ══════════════
      toggleSupplement: (date, id) =>
        set((s) => {
          const day = { ...(s.supLog[date] ?? {}) }
          day[id] = !day[id]
          return { supLog: { ...s.supLog, [date]: day } }
        }),
      addSupplement: (name, dose = '', timing = 'daily') =>
        set((s) => ({ supplements: [...s.supplements, { id: uid('sup'), name, dose, timing }] })),
      updateSupplement: (id, patch) =>
        set((s) => ({ supplements: s.supplements.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      removeSupplement: (id) => set((s) => ({ supplements: s.supplements.filter((x) => x.id !== id) })),
      moveSupplement: (id, position) =>
        set((s) => {
          const idx = s.supplements.findIndex((x) => x.id === id)
          return { supplements: reorder(s.supplements, idx, position) }
        }),

      // ══════════════ GOLF DIAGNOSTIC / INTEGRATIONS ══════════════
      setGolfStats: (patch) => set((s) => ({ golfStats: { ...s.golfStats, ...patch } })),
      setHevySessions: (hevySessions) => set({ hevySessions }),
      setGolfRounds: (golfRounds) => set({ golfRounds }),

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      resetAll: () => set({ ...seedState(), view: get().view }),
    }),
    {
      name: 'calibrate-v1',
      version: 8,
      partialize: (s) =>
        Object.fromEntries(
          Object.entries(s)
            .filter(([k]) => k !== 'view' && k !== 'lastJarvisSource')
            .map(([k, v]) =>
              k === 'chat' ? [k, (v as ChatMsg[]).map(({ image: _img, images: _imgs, ...m }) => m)] : [k, v],
            ),
        ) as CalibrateState,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>
        if (version < 2) {
          if (!p.profile) p.profile = seedProfile
          if (!Array.isArray(p.mantras) || !(p.mantras as unknown[]).length) p.mantras = seedMantras
          if (!Array.isArray(p.supplements) || !(p.supplements as unknown[]).length) p.supplements = seedSupplements
          if (!p.supLog) p.supLog = {}
          if (!p.golfStats) p.golfStats = seedGolfStats
          if (!Array.isArray(p.books) || !(p.books as unknown[]).length) p.books = seedBooks
        }
        if (version < 3) {
          if (!p.hevySessions) p.hevySessions = []
          if (!p.golfRounds) p.golfRounds = []
        }
        if (version < 4) {
          const profile = p.profile as { facts?: unknown } | undefined
          if (profile && Array.isArray(profile.facts) && typeof profile.facts[0] === 'string') {
            const now = Date.now()
            profile.facts = (profile.facts as string[]).map((text, i) => ({
              id: uid('fact'),
              text,
              category: inferCategory(text),
              importance: inferImportance(text),
              createdAt: now - i,
              lastAccessed: now - i,
              accessCount: 0,
            }))
          }
        }
        if (version < 5) {
          if (!Array.isArray(p.knowledgeDocs)) p.knowledgeDocs = []
        }
        if (version < 6) {
          if (!Array.isArray(p.trainingPhotos)) p.trainingPhotos = []
        }
        if (version < 7) {
          if (!('golfTimer' in p)) p.golfTimer = null
        }
        if (version < 8) {
          // v8: navigation becomes data; taxonomies, habits and reminders arrive.
          if (!Array.isArray(p.sections) || !(p.sections as unknown[]).length) p.sections = seedSections.map((s) => ({ ...s }))
          // Weekly Review predates the section registry; make sure it has a home.
          const secs = p.sections as SectionDef[]
          if (Array.isArray(secs) && !secs.some((x) => x.module === 'review')) {
            const seeded = seedSections.find((x) => x.module === 'review')
            if (seeded) secs.push({ ...seeded })
          }
          if (!Array.isArray(p.groups) || !(p.groups as unknown[]).length) p.groups = seedGroups.map((g) => ({ ...g }))
          if (!p.customBlocks) p.customBlocks = {}
          if (!Array.isArray(p.golfCategories)) p.golfCategories = seedGolfCategories.map((t) => ({ ...t }))
          if (!Array.isArray(p.blockTags)) p.blockTags = seedBlockTags.map((t) => ({ ...t }))
          if (!Array.isArray(p.bizAreas)) p.bizAreas = seedBizAreas.map((t) => ({ ...t }))
          if (!Array.isArray(p.mealWindows)) p.mealWindows = seedMealWindows.map((t) => ({ ...t }))
          if (!Array.isArray(p.habits) || !(p.habits as unknown[]).length) p.habits = seedHabits.map((h) => ({ ...h }))
          if (!p.habitLog) p.habitLog = {}
          if (!Array.isArray(p.reminders) || !(p.reminders as unknown[]).length) p.reminders = seedReminders.map((r) => ({ ...r }))
          if (!Array.isArray(p.knowledgeDocs)) p.knowledgeDocs = []
          if (!Array.isArray(p.dayTypeMacros) || !(p.dayTypeMacros as unknown[]).length) p.dayTypeMacros = seedDayTypeMacros
          if (typeof p.revenueTarget !== 'number') p.revenueTarget = 1000
          // legacy meals used display-name windows; map them onto window ids
          const windowMap: Record<string, string> = {
            Breakfast: 'breakfast',
            Lunch: 'lunch',
            Dinner: 'dinner',
            'Performance Snack': 'snack',
          }
          if (Array.isArray(p.meals)) {
            p.meals = (p.meals as MealOption[]).map((m) => ({ ...m, window: windowMap[m.window] ?? m.window }))
          }
          // legacy business areas were display names too
          const areaMap: Record<string, string> = {
            Content: 'content',
            Store: 'store',
            Marketing: 'marketing',
            Suppliers: 'suppliers',
            Ops: 'ops',
          }
          if (Array.isArray(p.bizTasks)) {
            p.bizTasks = (p.bizTasks as BizTask[]).map((t) => ({ ...t, area: areaMap[t.area] ?? t.area }))
          }
          p.settings = { ...defaultSettings, ...(p.settings as object) }
        }
        return p as unknown as CalibrateState
      },
    },
  ),
)

/**
 * One-time move of legacy inline photo blobs into IndexedDB. Early photo-log
 * builds stored base64 directly on TrainingPhoto.dataUrl inside the persist
 * store; that pushes localStorage towards its ~5MB quota and slows every state
 * write. Copy each blob into IndexedDB FIRST, and only strip the inline copies
 * once all of them are safely stored — interrupting mid-migration loses nothing.
 * Called once on boot (main.tsx); a no-op when there is nothing to migrate.
 */
export async function migrateLegacyPhotoBlobs(): Promise<void> {
  const legacy = useStore.getState().trainingPhotos.filter((p) => p.dataUrl)
  if (!legacy.length) return
  await Promise.all(legacy.map((p) => savePhoto(p.id, p.dataUrl!)))
  useStore.setState((s) => ({ trainingPhotos: s.trainingPhotos.map(({ dataUrl: _blob, ...p }) => p) }))
}
