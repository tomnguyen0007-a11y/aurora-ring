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

/**
 * A free-form knowledge document the user feeds Jarvis — pasted or uploaded
 * from Obsidian, a spec, a coach's PDF-turned-markdown, anything. Injected into
 * Jarvis's context so it reasons from the user's real material, not just the
 * built-in seed knowledge. "source" tags where it came from (e.g. a filename).
 */
export interface KnowledgeDoc {
  id: string
  title: string
  body: string
  source: string
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
  image?: string // data URL of an attached reference photo (user messages)
}

export type MemoryCategory = 'golf' | 'fitness' | 'nutrition' | 'life' | 'business' | 'recovery'

export interface MemoryFact {
  id: string
  text: string
  category: MemoryCategory
  importance: number // 1-10, higher surfaces more readily in retrieval
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
  identity: string // free-form "who I am / what I'm building"
  philosophy: string // core operating philosophy
  facts: MemoryFact[] // discrete memory facts Jarvis should always know, ranked by semantic relevance at query time
}

export interface Mantra {
  id: string
  text: string
  author: string // "" if unattributed
  tag: 'mindset' | 'wealth' | 'discipline' | 'stoic' | 'love' | 'custom'
}

export interface SupplementItem {
  id: string
  name: string
  dose: string
  timing: string
}

export interface GolfStats {
  fairwaysPct: number
  girPct: number
  scramblePct: number
  puttsPerRound: number
  lostBallsPerRound: number
  avgScore: number
  updated: string
  focus: string // current mental/technical focus
}

export type LlmProvider = 'none' | 'anthropic' | 'gemini' | 'groq' | 'openrouter'

export interface Settings {
  userName: string
  provider: LlmProvider
  anthropicKey: string
  geminiKey: string
  anthropicModel: string
  geminiModel: string
  groqKey: string // groq.com — genuinely free tier, no card, no web search
  groqModel: string
  openrouterKey: string // openrouter.ai — free model router, resilient backup, vision on the right model
  openrouterModel: string
  finnhubKey: string
  gnewsKey: string
  newsCountry: string
  speakReplies: boolean
  voiceURI: string // chosen speech-synthesis voice
  elevenKey: string // ElevenLabs — the real JARVIS voice (primary TTS)
  elevenVoiceId: string
  openaiKey?: string // OpenAI TTS — secondary voice fallback
  notifyEnabled: boolean // nutrition/recovery reminders
  hevyKey: string // Hevy official API — live workout sync
  // Cross-device sync (Supabase project owned by the user)
  supabaseUrl?: string // https://xxxx.supabase.co
  supabaseKey?: string // anon public key
  syncCode?: string // shared secret identifying this user's state row — same on every device
  // GitHub knowledge sync — pulls markdown/text straight from a repo (e.g. an
  // Obsidian vault or the ECC skills repo) into the Brain Feed, no copy-paste.
  githubToken?: string // personal access token; only needed for private repos / higher rate limits
  githubRepo?: string // "owner/repo"
  githubBranch?: string
  githubPath?: string // optional folder prefix to restrict the sync to
  githubSyncedAt?: number
}

export interface HevySession {
  id: string
  date: string
  title: string
  sets: number
  volumeKg: number
}

export interface GolfRound {
  id: string
  date: string
  course: string
  score: number
}

export type ViewId =
  | 'today'
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
  | 'settings'
