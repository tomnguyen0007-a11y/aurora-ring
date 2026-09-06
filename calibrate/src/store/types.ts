export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Monday … 6 = Sunday

// ─────────────────────────────────────────────────────────────
// SECTION REGISTRY — every page in the app is data, not code.
// Rename, reorder, hide, regroup, or invent new ones. Nothing in
// the navigation is hard-coded any more.
// ─────────────────────────────────────────────────────────────

export type ModuleKind =
  | 'dashboard'
  | 'jarvis'
  | 'goals'
  | 'training'
  | 'golf'
  | 'nutrition'
  | 'recovery'
  | 'grocery'
  | 'notes'
  | 'business'
  | 'books'
  | 'mindset'
  | 'markets'
  | 'news'
  | 'schedule'
  | 'review'
  | 'settings'
  | 'custom'

export interface SectionDef {
  id: string
  module: ModuleKind
  label: string
  group: string
  icon: string
  order: number
  hidden: boolean
  bar: boolean // pinned into the mobile bottom bar
}

export interface GroupDef {
  id: string
  label: string
  order: number
}

/** Renameable taxonomy entry (golf categories, business areas, schedule tags…). */
export interface Taxon {
  id: string
  label: string
}

// ── Custom sections: user-invented pages built from blocks ──

export type CustomBlockKind = 'checklist' | 'counter' | 'note' | 'table' | 'metric'

export interface CustomListItem {
  id: string
  text: string
  done: boolean
}

export interface CustomBlock {
  id: string
  kind: CustomBlockKind
  title: string
  items?: CustomListItem[]
  step?: number
  target?: number
  unit?: string
  body?: string
  columns?: string[]
  rows?: string[][]
  /** date (yyyy-mm-dd) → value, for counter + metric blocks */
  series?: Record<string, number>
}

// ─────────────────────────────────────────────────────────────
// SCHEDULE
// ─────────────────────────────────────────────────────────────

export type BlockTag = string

export interface ScheduleBlock {
  id: string
  weekday: Weekday
  start: string // "06:30"
  end: string // "07:00" ("" for open-ended)
  title: string
  detail?: string
  tag: BlockTag
}

// ─────────────────────────────────────────────────────────────
// TRAINING
// ─────────────────────────────────────────────────────────────

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
  date: string
  workoutId: string
  entries: Record<string, SetEntry[]>
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

// ─────────────────────────────────────────────────────────────
// GOLF
// ─────────────────────────────────────────────────────────────

/** Golf practice category id. Seeded ids stay stable; labels are editable. */
export type GolfCategory = string

export interface GolfSession {
  id: string
  date: string
  category: GolfCategory
  minutes: number
  notes: string
}

/**
 * Wall-clock state for the live Practice Timer — persisted so elapsed time
 * survives the phone locking, the tab backgrounding, or iOS killing and
 * reloading the PWA while it runs. Elapsed is always DERIVED from these
 * timestamps (now - startedAt + accumulatedSec), never ticked by an interval,
 * so a throttled background timer cannot fall behind reality.
 */
export interface GolfTimerState {
  category: GolfCategory
  /** epoch ms the current (unpaused) run began; null while paused */
  startedAt: number | null
  /** seconds banked from prior runs this session (before the current startedAt) */
  accumulatedSec: number
}

/**
 * A photo from training or golf, dated and captioned — a visual log of what
 * actually happened that day. Uploaded from Golf/Training, or attached to a
 * Jarvis message and kept via "log this".
 */
export interface TrainingPhoto {
  id: string
  date: string
  category: 'golf' | 'training' | 'other'
  /**
   * Blobs live in IndexedDB (lib/photoDb) keyed by this id — the store holds
   * metadata only, so localStorage never carries base64 payloads. Populated
   * transiently while adding, and for legacy entries that migrate on boot.
   */
  dataUrl?: string
  caption?: string
  createdAt: number
}

export interface HandicapEntry {
  id: string
  date: string
  value: number
}

export interface GolfStats {
  fairwaysPct: number
  girPct: number
  scramblePct: number
  puttsPerRound: number
  lostBallsPerRound: number
  avgScore: number
  updated: string
  focus: string
}

export interface GolfRound {
  id: string
  date: string
  course: string
  score: number
}

// ─────────────────────────────────────────────────────────────
// GOALS
// ─────────────────────────────────────────────────────────────

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
  progress: number
  milestones: Milestone[]
  notes: string
}

// ─────────────────────────────────────────────────────────────
// NUTRITION
// ─────────────────────────────────────────────────────────────

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
  window: string
  name: string
  detail: string
}

export interface GroceryItem {
  id: string
  name: string
  qty: string
  done: boolean
}

export interface SupplementItem {
  id: string
  name: string
  dose: string
  timing: string
}

// ─────────────────────────────────────────────────────────────
// NOTES / BUSINESS / BOOKS
// ─────────────────────────────────────────────────────────────

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
  area: string
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

// ─────────────────────────────────────────────────────────────
// CHECK-INS, HABITS, REMINDERS — the consistency engine
// ─────────────────────────────────────────────────────────────

export interface CheckIn {
  date: string
  weightKg: number | null
  sleepH: number | null
  sleepQuality: number | null
  energy: number | null
  blackoutOnTime: boolean | null
  notes: string
}

export interface Habit {
  id: string
  label: string
  /** boolean = done / not done · count = accumulate toward a target */
  kind: 'boolean' | 'count'
  target: number
  unit: string
  order: number
  archived: boolean
  /** which weekdays it counts on — empty means every day */
  days: Weekday[]
}

/** date → habitId → value (1/0 for boolean habits) */
export type HabitLog = Record<string, Record<string, number>>

export interface Reminder {
  id: string
  label: string
  body: string
  time: string // "HH:MM"
  days: Weekday[] // empty = every day
  enabled: boolean
  sectionId?: string
}

// ─────────────────────────────────────────────────────────────
// MARKETS
// ─────────────────────────────────────────────────────────────

export interface WatchItem {
  id: string
  kind: 'crypto' | 'stock'
  symbol: string
  cgId?: string
  name: string
}

export interface Quote {
  price: number
  change24h: number
  ts: number
}

// ─────────────────────────────────────────────────────────────
// JARVIS
// ─────────────────────────────────────────────────────────────

export interface ChatMsg {
  id: string
  role: 'user' | 'jarvis'
  text: string
  ts: number
  acted?: string[]
  /** legacy single-photo messages */
  image?: string
  /** data URLs — a message can carry several photos at once */
  images?: string[]
  /** tool names Jarvis called while answering, for the transparency trail */
  tools?: string[]
}

export type MemoryCategory = 'golf' | 'fitness' | 'nutrition' | 'life' | 'business' | 'recovery'

export interface MemoryFact {
  id: string
  text: string
  category: MemoryCategory
  importance: number
  createdAt: number
  lastAccessed: number
  accessCount: number
}

export interface Profile {
  name: string
  age: number | null
  heightCm: number | null
  location: string
  inspiration: string
  identity: string
  philosophy: string
  facts: MemoryFact[]
}

export interface Mantra {
  id: string
  text: string
  author: string
  tag: string
}

/** Second-brain document — pasted or imported reference Jarvis reads. */
export interface KnowledgeDoc {
  id: string
  title: string
  body: string
  source: string
  updated: number
  /** always injected into Jarvis's context, not just on keyword match */
  pinned: boolean
}

export interface HevySession {
  id: string
  date: string
  title: string
  sets: number
  volumeKg: number
}

// ─────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────

export type LlmProvider = 'none' | 'anthropic' | 'gemini' | 'groq' | 'openrouter' | 'local'

export interface Settings {
  userName: string
  provider: LlmProvider
  anthropicKey: string
  geminiKey: string
  anthropicModel: string
  geminiModel: string
  groqKey: string
  groqModel: string
  openrouterKey: string
  openrouterModel: string
  /** OpenAI-compatible local server — Ollama, LM Studio, llama.cpp. */
  localBaseUrl: string
  localModel: string
  finnhubKey: string
  /** USDA FoodData Central key. Free at fdc.nal.usda.gov; DEMO_KEY works but throttles hard. */
  usdaKey: string
  gnewsKey: string
  newsCountry: string
  speakReplies: boolean
  voiceURI: string
  elevenKey: string
  elevenVoiceId: string
  openaiKey?: string
  notifyEnabled: boolean
  hevyKey: string
  supabaseUrl?: string
  supabaseKey?: string
  syncCode?: string
  // GitHub knowledge sync — pulls markdown/text straight from a repo (an
  // Obsidian vault, the ECC skills repo) into the Brain Feed, no copy-paste.
  githubToken?: string // PAT; only needed for private repos or higher rate limits
  githubRepo?: string // "owner/repo"
  githubBranch?: string
  githubPath?: string // optional folder prefix to restrict the sync to
  githubSyncedAt?: number

  // ── v8 ──
  /** how many tool-call rounds Jarvis may take before it must answer */
  agentSteps: number
  /** let Jarvis search the web even on providers without a native tool */
  webSearch: boolean
  /** scheduled reminders (needs the tab open or the PWA installed) */
  remindersEnabled: boolean
  /** end-of-day review prompt */
  closeoutTime: string
  /** UI density */
  density: 'comfortable' | 'compact'
  /** show numbers only after they exist, hide empty modules from Today */
  hideEmpty: boolean

  // ── Brand ──
  /** your own mark as a data URL — replaces the default wing and the favicon */
  brandMark?: string
  /** flip the mark's luminance so a black-on-transparent file reads on black */
  brandInvert?: boolean
  /** wordmark and line beneath it */
  brandName?: string
  brandTagline?: string
}

/** Legacy alias: views are section ids now, so any string is valid. */
export type ViewId = string
