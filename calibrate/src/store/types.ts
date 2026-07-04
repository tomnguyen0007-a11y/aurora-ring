export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Monday … 6 = Sunday

export type BlockTag =
  | 'morning'
  | 'school'
  | 'gym'
  | 'golf'
  | 'run'
  | 'business'
  | 'meal'
  | 'study'
  | 'recovery'
  | 'social'
  | 'language'

export interface ScheduleBlock {
  id: string
  weekday: Weekday
  start: string // "06:30"
  end: string // "07:00" ("" for open-ended)
  title: string
  detail?: string
  tag: BlockTag
}

export interface Exercise {
  id: string
  name: string
  sets: number
  reps: string // "8-10"
  cue: string
}

export interface Workout {
  id: string
  name: string
  weekday: Weekday
  exercises: Exercise[]
}

export interface SetEntry {
  weight: number | null
  reps: number | null
}

export interface WorkoutLog {
  id: string
  date: string // ISO yyyy-mm-dd
  workoutId: string
  entries: Record<string, SetEntry[]> // exerciseId -> sets
  completed: boolean
}

export interface RunLog {
  id: string
  date: string
  minutes: number
  distanceKm: number | null
  avgHr: number | null
  notes: string
}

export type GolfCategory = 'putting' | 'chipping' | 'long-game' | 'drills' | 'simulator' | 'on-course'

export interface GolfSession {
  id: string
  date: string
  category: GolfCategory
  minutes: number
  notes: string
}

export interface HandicapEntry {
  id: string
  date: string
  value: number
}

export type Pillar = 'physique' | 'golf' | 'business' | 'recovery' | 'custom'

export interface Milestone {
  id: string
  title: string
  done: boolean
}

export interface Goal {
  id: string
  pillar: Pillar
  title: string
  target: string
  deadline: string | null
  progress: number // 0-100
  milestones: Milestone[]
  notes: string
}

export interface MacroTargets {
  kcal: [number, number]
  protein: [number, number]
  carbs: [number, number]
  fat: [number, number]
  waterMl: number
}

export interface FoodLog {
  id: string
  date: string
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface MealOption {
  id: string
  window: string // Breakfast / Lunch / Dinner / Performance Snack
  name: string
  detail: string
}

export interface GroceryItem {
  id: string
  name: string
  qty: string
  done: boolean
}

export interface Note {
  id: string
  title: string
  body: string
  pinned: boolean
  updated: number
}

export interface TableDoc {
  id: string
  name: string
  columns: string[]
  rows: string[][]
  updated: number
}

export interface BizTask {
  id: string
  title: string
  area: string // Content / Store / Marketing / Suppliers / Ops
  done: boolean
  created: number
}

export interface RevenueEntry {
  id: string
  date: string
  amount: number
  source: string
}

export type BookStatus = 'reading' | 'queued' | 'finished'

export interface Book {
  id: string
  title: string
  author: string
  status: BookStatus
  currentPage: number
  totalPages: number
  rating: number | null
  notes: string
}

export interface CheckIn {
  date: string
  weightKg: number | null
  sleepH: number | null
  sleepQuality: number | null // 1-5
  energy: number | null // 1-5
  blackoutOnTime: boolean | null
  notes: string
}

export interface WatchItem {
  id: string
  kind: 'crypto' | 'stock'
  symbol: string // BTC / AAPL
  cgId?: string // coingecko id for crypto
  name: string
}

export interface Quote {
  price: number
  change24h: number // percent
  ts: number
}

export interface ChatMsg {
  id: string
  role: 'user' | 'jarvis'
  text: string
  ts: number
  acted?: string[] // human-readable list of actions Jarvis executed
}

export type LlmProvider = 'none' | 'anthropic' | 'gemini'

export interface Settings {
  userName: string
  provider: LlmProvider
  anthropicKey: string
  geminiKey: string
  anthropicModel: string
  geminiModel: string
  finnhubKey: string
  speakReplies: boolean
}

export type ViewId =
  | 'today'
  | 'jarvis'
  | 'goals'
  | 'training'
  | 'golf'
  | 'nutrition'
  | 'grocery'
  | 'notes'
  | 'business'
  | 'books'
  | 'markets'
  | 'schedule'
  | 'settings'
