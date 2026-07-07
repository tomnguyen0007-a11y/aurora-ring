import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { todayISO, uid } from '../lib/dates'
import { inferCategory, inferImportance } from '../lib/jarvis/memory'
import {
  seedBooks,
  seedGoals,
  seedGolfStats,
  seedHandicap,
  seedMacros,
  seedMantras,
  seedMeals,
  seedProfile,
  seedSchedule,
  seedSupplements,
  seedWatchlist,
  seedWorkouts,
} from './seed'
import type {
  BizTask,
  Book,
  ChatMsg,
  CheckIn,
  Exercise,
  FoodLog,
  Goal,
  GolfSession,
  GolfStats,
  GolfRound,
  GroceryItem,
  HandicapEntry,
  HevySession,
  MacroTargets,
  Mantra,
  MemoryCategory,
  MealOption,
  Note,
  Profile,
  RevenueEntry,
  RunLog,
  ScheduleBlock,
  SetEntry,
  Settings,
  SupplementItem,
  TableDoc,
  ViewId,
  WatchItem,
  Workout,
  WorkoutLog,
} from './types'

export interface CalibrateState {
  // navigation (not persisted logic-wise but harmless)
  view: ViewId
  setView: (v: ViewId) => void

  // schedule
  schedule: ScheduleBlock[]
  dayChecks: Record<string, Record<string, boolean>> // date -> blockId -> done
  toggleBlock: (date: string, blockId: string) => void
  addBlock: (b: Omit<ScheduleBlock, 'id'>) => void
  updateBlock: (id: string, patch: Partial<ScheduleBlock>) => void
  removeBlock: (id: string) => void

  // training
  workouts: Workout[]
  workoutLogs: WorkoutLog[]
  runLogs: RunLog[]
  logSet: (date: string, workoutId: string, exerciseId: string, setIdx: number, patch: Partial<SetEntry>) => void
  setWorkoutDone: (date: string, workoutId: string, done: boolean) => void
  addExercise: (workoutId: string, ex: Omit<Exercise, 'id'>) => void
  updateExercise: (workoutId: string, exId: string, patch: Partial<Exercise>) => void
  removeExercise: (workoutId: string, exId: string) => void
  addRun: (r: Omit<RunLog, 'id'>) => void
  removeRun: (id: string) => void

  // golf
  golfSessions: GolfSession[]
  handicap: HandicapEntry[]
  addGolfSession: (s: Omit<GolfSession, 'id'>) => void
  removeGolfSession: (id: string) => void
  addHandicap: (value: number, date?: string) => void

  // goals
  goals: Goal[]
  addGoal: (g: Partial<Goal> & { title: string }) => void
  updateGoal: (id: string, patch: Partial<Goal>) => void
  removeGoal: (id: string) => void
  toggleMilestone: (goalId: string, msId: string) => void
  addMilestone: (goalId: string, title: string) => void

  // nutrition
  macros: MacroTargets
  setMacros: (m: MacroTargets) => void
  meals: MealOption[]
  foodLogs: FoodLog[]
  water: Record<string, number> // date -> ml
  addFood: (f: Omit<FoodLog, 'id'>) => void
  removeFood: (id: string) => void
  addWater: (date: string, ml: number) => void

  // grocery
  grocery: GroceryItem[]
  addGrocery: (name: string, qty?: string) => void
  toggleGrocery: (id: string) => void
  removeGrocery: (id: string) => void
  clearDoneGrocery: () => void

  // notes & tables
  notes: Note[]
  tables: TableDoc[]
  addNote: (title: string, body?: string) => string
  updateNote: (id: string, patch: Partial<Note>) => void
  removeNote: (id: string) => void
  addTable: (name: string) => string
  updateTable: (id: string, patch: Partial<TableDoc>) => void
  removeTable: (id: string) => void

  // business
  bizTasks: BizTask[]
  revenue: RevenueEntry[]
  addBizTask: (title: string, area?: string) => void
  toggleBizTask: (id: string) => void
  removeBizTask: (id: string) => void
  addRevenue: (r: Omit<RevenueEntry, 'id'>) => void
  removeRevenue: (id: string) => void

  // books
  books: Book[]
  readingLog: Record<string, number> // date -> minutes
  addBook: (b: Partial<Book> & { title: string }) => void
  updateBook: (id: string, patch: Partial<Book>) => void
  removeBook: (id: string) => void
  logReading: (date: string, minutes: number) => void

  // check-ins
  checkIns: Record<string, CheckIn> // date -> checkin
  saveCheckIn: (c: CheckIn) => void

  // markets
  watchlist: WatchItem[]
  addWatch: (w: Omit<WatchItem, 'id'>) => void
  removeWatch: (id: string) => void

  // jarvis
  chat: ChatMsg[]
  pushChat: (m: Omit<ChatMsg, 'id' | 'ts'>) => void
  clearChat: () => void

  // profile / memory
  profile: Profile
  setProfile: (patch: Partial<Profile>) => void
  addFact: (text: string, category?: MemoryCategory, importance?: number) => void
  removeFact: (id: string) => void

  // mindset
  mantras: Mantra[]
  addMantra: (text: string, author?: string) => void
  removeMantra: (id: string) => void

  // recovery
  supplements: SupplementItem[]
  supLog: Record<string, Record<string, boolean>> // date -> supId -> taken
  toggleSupplement: (date: string, id: string) => void
  addSupplement: (name: string, dose: string, timing: string) => void
  removeSupplement: (id: string) => void

  // golf diagnostic
  golfStats: GolfStats
  setGolfStats: (patch: Partial<GolfStats>) => void

  // integrations
  hevySessions: HevySession[]
  setHevySessions: (sessions: HevySession[]) => void
  golfRounds: GolfRound[]
  setGolfRounds: (rounds: GolfRound[]) => void

  // settings
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
  finnhubKey: '',
  gnewsKey: '',
  newsCountry: 'us',
  speakReplies: true,
  voiceURI: '',
  elevenKey: '',
  elevenVoiceId: 'onwK4e9ZLuTAKqWW03F9', // "Daniel" — deep, composed British
  openaiKey: '',
  notifyEnabled: false,
  hevyKey: '',
}

const seedState = () => ({
  view: 'today' as ViewId,
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
  books: seedBooks,
  readingLog: {},
  checkIns: {},
  watchlist: seedWatchlist,
  chat: [],
  profile: seedProfile,
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

      setView: (view) => set({ view }),

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
          let log = logs.find((l) => l.date === date && l.workoutId === workoutId)
          if (!log) {
            log = { id: uid('wl'), date, workoutId, entries: {}, completed: done }
            logs.push(log)
            return { workoutLogs: logs }
          }
          return { workoutLogs: logs.map((l) => (l.id === log!.id ? { ...l, completed: done } : l)) }
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
            w.id === workoutId
              ? { ...w, exercises: w.exercises.map((e) => (e.id === exId ? { ...e, ...patch } : e)) }
              : w,
          ),
        })),
      removeExercise: (workoutId, exId) =>
        set((s) => ({
          workouts: s.workouts.map((w) =>
            w.id === workoutId ? { ...w, exercises: w.exercises.filter((e) => e.id !== exId) } : w,
          ),
        })),
      addRun: (r) => set((s) => ({ runLogs: [{ ...r, id: uid('run') }, ...s.runLogs] })),
      removeRun: (id) => set((s) => ({ runLogs: s.runLogs.filter((r) => r.id !== id) })),

      addGolfSession: (g) => set((s) => ({ golfSessions: [{ ...g, id: uid('gs') }, ...s.golfSessions] })),
      removeGolfSession: (id) => set((s) => ({ golfSessions: s.golfSessions.filter((g) => g.id !== id) })),
      addHandicap: (value, date = todayISO()) =>
        set((s) => ({ handicap: [...s.handicap, { id: uid('hcp'), date, value }] })),

      addGoal: (g) =>
        set((s) => ({
          goals: [
            ...s.goals,
            {
              id: uid('g'),
              pillar: g.pillar ?? 'custom',
              title: g.title,
              target: g.target ?? '',
              deadline: g.deadline ?? null,
              progress: g.progress ?? 0,
              milestones: g.milestones ?? [],
              notes: g.notes ?? '',
            },
          ],
        })),
      updateGoal: (id, patch) => set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
      removeGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),
      toggleMilestone: (goalId, msId) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId
              ? { ...g, milestones: g.milestones.map((m) => (m.id === msId ? { ...m, done: !m.done } : m)) }
              : g,
          ),
        })),
      addMilestone: (goalId, title) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId ? { ...g, milestones: [...g.milestones, { id: uid('m'), title, done: false }] } : g,
          ),
        })),

      setMacros: (macros) => set({ macros }),
      addFood: (f) => set((s) => ({ foodLogs: [{ ...f, id: uid('food') }, ...s.foodLogs] })),
      removeFood: (id) => set((s) => ({ foodLogs: s.foodLogs.filter((f) => f.id !== id) })),
      addWater: (date, ml) =>
        set((s) => ({ water: { ...s.water, [date]: Math.max(0, (s.water[date] ?? 0) + ml) } })),

      addGrocery: (name, qty = '') =>
        set((s) => ({ grocery: [...s.grocery, { id: uid('gr'), name, qty, done: false }] })),
      toggleGrocery: (id) =>
        set((s) => ({ grocery: s.grocery.map((g) => (g.id === id ? { ...g, done: !g.done } : g)) })),
      removeGrocery: (id) => set((s) => ({ grocery: s.grocery.filter((g) => g.id !== id) })),
      clearDoneGrocery: () => set((s) => ({ grocery: s.grocery.filter((g) => !g.done) })),

      addNote: (title, body = '') => {
        const id = uid('note')
        set((s) => ({ notes: [{ id, title, body, pinned: false, updated: Date.now() }, ...s.notes] }))
        return id
      },
      updateNote: (id, patch) =>
        set((s) => ({
          notes: s.notes.map((nt) => (nt.id === id ? { ...nt, ...patch, updated: Date.now() } : nt)),
        })),
      removeNote: (id) => set((s) => ({ notes: s.notes.filter((nt) => nt.id !== id) })),
      addTable: (name) => {
        const id = uid('tbl')
        set((s) => ({
          tables: [
            { id, name, columns: ['Column 1', 'Column 2', 'Column 3'], rows: [['', '', '']], updated: Date.now() },
            ...s.tables,
          ],
        }))
        return id
      },
      updateTable: (id, patch) =>
        set((s) => ({
          tables: s.tables.map((t) => (t.id === id ? { ...t, ...patch, updated: Date.now() } : t)),
        })),
      removeTable: (id) => set((s) => ({ tables: s.tables.filter((t) => t.id !== id) })),

      addBizTask: (title, area = 'Ops') =>
        set((s) => ({ bizTasks: [{ id: uid('bt'), title, area, done: false, created: Date.now() }, ...s.bizTasks] })),
      toggleBizTask: (id) =>
        set((s) => ({ bizTasks: s.bizTasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),
      removeBizTask: (id) => set((s) => ({ bizTasks: s.bizTasks.filter((t) => t.id !== id) })),
      addRevenue: (r) => set((s) => ({ revenue: [{ ...r, id: uid('rev') }, ...s.revenue] })),
      removeRevenue: (id) => set((s) => ({ revenue: s.revenue.filter((r) => r.id !== id) })),

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

      saveCheckIn: (c) => set((s) => ({ checkIns: { ...s.checkIns, [c.date]: c } })),

      addWatch: (w) => set((s) => ({ watchlist: [...s.watchlist, { ...w, id: uid('watch') }] })),
      removeWatch: (id) => set((s) => ({ watchlist: s.watchlist.filter((w) => w.id !== id) })),

      pushChat: (m) => set((s) => ({ chat: [...s.chat.slice(-199), { ...m, id: uid('msg'), ts: Date.now() }] })),
      clearChat: () => set({ chat: [] }),

      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      addFact: (text, category = 'life', importance = 5) =>
        set((s) => {
          const now = Date.now()
          return {
            profile: {
              ...s.profile,
              facts: [
                ...s.profile.facts,
                { id: uid('fact'), text, category, importance, createdAt: now, lastAccessed: now, accessCount: 0 },
              ],
            },
          }
        }),
      removeFact: (id) => set((s) => ({ profile: { ...s.profile, facts: s.profile.facts.filter((f) => f.id !== id) } })),

      addMantra: (text, author = '') =>
        set((s) => ({ mantras: [{ id: uid('mantra'), text, author, tag: 'custom' }, ...s.mantras] })),
      removeMantra: (id) => set((s) => ({ mantras: s.mantras.filter((m) => m.id !== id) })),

      toggleSupplement: (date, id) =>
        set((s) => {
          const day = { ...(s.supLog[date] ?? {}) }
          day[id] = !day[id]
          return { supLog: { ...s.supLog, [date]: day } }
        }),
      addSupplement: (name, dose, timing) =>
        set((s) => ({ supplements: [...s.supplements, { id: uid('sup'), name, dose, timing }] })),
      removeSupplement: (id) => set((s) => ({ supplements: s.supplements.filter((x) => x.id !== id) })),

      setGolfStats: (patch) => set((s) => ({ golfStats: { ...s.golfStats, ...patch } })),

      setHevySessions: (hevySessions) => set({ hevySessions }),
      setGolfRounds: (golfRounds) => set({ golfRounds }),

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      resetAll: () => set({ ...seedState(), view: get().view }),
    }),
    {
      name: 'calibrate-v1',
      version: 4,
      // always wake up on Today — don't persist navigation; strip heavy chat images from storage
      partialize: (s) =>
        Object.fromEntries(
          Object.entries(s)
            .filter(([k]) => k !== 'view')
            .map(([k, v]) => (k === 'chat' ? [k, (v as ChatMsg[]).map(({ image: _img, ...m }) => m)] : [k, v])),
        ) as CalibrateState,
      // backfill new/preloaded collections for existing users without touching their data
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
          // profile.facts upgraded from string[] to structured MemoryFact[] (semantic retrieval)
          const profile = p.profile as { facts?: unknown } | undefined
          if (profile && Array.isArray(profile.facts) && typeof profile.facts[0] === 'string') {
            const now = Date.now()
            profile.facts = (profile.facts as string[]).map((text, i) => ({
              id: uid('fact'),
              text,
              category: inferCategory(text),
              importance: inferImportance(text),
              createdAt: now - i, // preserve original ordering as a tie-breaker
              lastAccessed: now - i,
              accessCount: 0,
            }))
          }
        }
        return p as unknown as CalibrateState
      },
    },
  ),
)
