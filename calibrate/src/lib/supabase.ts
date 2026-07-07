import { useStore } from '../store/store'
import type { CalibrateState } from '../store/store'

// ————————————————————————————————————————————————————————
// CROSS-DEVICE SYNC — Supabase as source of truth, offline-first
//
// The whole app state lives in ONE row of the user's own (free) Supabase
// project, keyed by a private sync code shared across their devices.
// localStorage (zustand persist) keeps working offline; this layer pushes
// local changes up (debounced) and pulls remote changes down on launch,
// tab-focus, reconnect, and a slow poll. Last write wins — fine for one
// human using one device at a time.
//
// Setup (once, ~2 minutes): see calibrate/SUPABASE.md — create a free
// project, run the SQL snippet, paste URL + anon key + a sync code into
// Settings on every device.
// ————————————————————————————————————————————————————————

const TABLE = 'calibrate_state'
const STAMP_KEY = 'calibrate-sync-stamp'
const PUSH_DEBOUNCE_MS = 2500
const POLL_MS = 45_000

export interface SyncStatus {
  enabled: boolean
  lastSyncAt: number | null
  pendingPush: boolean
  error: string | null
}

const status: SyncStatus = { enabled: false, lastSyncAt: null, pendingPush: false, error: null }
const listeners = new Set<() => void>()

// Cached snapshot — useSyncExternalStore requires a stable reference between notifications
let snapshot: SyncStatus = { ...status }

function notify() {
  snapshot = { ...status }
  for (const l of listeners) l()
}

export function getSyncStatus(): SyncStatus {
  return snapshot
}

export function subscribeSyncStatus(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

interface SyncConfig {
  url: string
  key: string
  code: string
}

function currentConfig(): SyncConfig | null {
  const { supabaseUrl, supabaseKey, syncCode } = useStore.getState().settings
  if (!supabaseUrl || !supabaseKey || !syncCode) return null
  return { url: supabaseUrl.replace(/\/+$/, ''), key: supabaseKey, code: syncCode }
}

function headers(cfg: SyncConfig): Record<string, string> {
  return {
    apikey: cfg.key,
    authorization: `Bearer ${cfg.key}`,
    'content-type': 'application/json',
  }
}

/**
 * The synced snapshot: every data key, no functions, no `view` (navigation is
 * per-device), no chat images (megabytes of base64 don't belong in a sync row).
 */
function serializeState(): Record<string, unknown> {
  const s = useStore.getState()
  const plain = JSON.parse(
    JSON.stringify(s, (key, value) => (typeof value === 'function' ? undefined : key === 'image' ? undefined : value)),
  ) as Record<string, unknown>
  delete plain.view
  return plain
}

let applyingRemote = false
let pushTimer: ReturnType<typeof setTimeout> | null = null

function getStamp(): string {
  return localStorage.getItem(STAMP_KEY) ?? ''
}

function setStamp(v: string) {
  localStorage.setItem(STAMP_KEY, v)
}

async function pushState(): Promise<void> {
  const cfg = currentConfig()
  if (!cfg || !navigator.onLine) return

  try {
    const res = await fetch(`${cfg.url}/rest/v1/${TABLE}?on_conflict=id`, {
      method: 'POST',
      headers: { ...headers(cfg), prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([{ id: cfg.code, data: serializeState() }]),
    })
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 120)}`)

    const rows: { updated_at?: string }[] = await res.json()
    if (rows[0]?.updated_at) setStamp(rows[0].updated_at)

    status.pendingPush = false
    status.lastSyncAt = Date.now()
    status.error = null
  } catch (e) {
    status.error = e instanceof Error ? e.message : 'push failed'
  }
  notify()
}

function schedulePush(): void {
  if (!currentConfig()) return
  status.pendingPush = true
  notify()
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushState()
  }, PUSH_DEBOUNCE_MS)
}

async function pullState(): Promise<void> {
  const cfg = currentConfig()
  if (!cfg || !navigator.onLine) return

  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(cfg.code)}&select=data,updated_at`,
      { headers: headers(cfg) },
    )
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 120)}`)

    const rows: { data: Record<string, unknown>; updated_at: string }[] = await res.json()

    if (!rows.length) {
      // First device online — seed the remote row with local state
      await pushState()
      return
    }

    const row = rows[0]
    const known = getStamp()

    if (row.updated_at !== known) {
      if (status.pendingPush) {
        // We have unpushed local edits — let our push win (last write wins)
        await pushState()
      } else {
        applyRemote(row.data)
        setStamp(row.updated_at)
        status.lastSyncAt = Date.now()
        status.error = null
      }
    } else {
      status.lastSyncAt = Date.now()
      status.error = null
    }
  } catch (e) {
    status.error = e instanceof Error ? e.message : 'pull failed'
  }
  notify()
}

function applyRemote(data: Record<string, unknown>): void {
  applyingRemote = true
  try {
    const cur = useStore.getState()
    const remoteSettings = (data.settings ?? {}) as Record<string, unknown>
    useStore.setState({
      ...(data as Partial<CalibrateState>),
      view: cur.view, // navigation is per-device
      settings: {
        ...cur.settings,
        ...remoteSettings,
        // never let a stale remote wipe the credentials that make sync work
        supabaseUrl: cur.settings.supabaseUrl,
        supabaseKey: cur.settings.supabaseKey,
        syncCode: cur.settings.syncCode,
      },
    } as Partial<CalibrateState>)
  } finally {
    applyingRemote = false
  }
}

/** Force an immediate two-way sync (Settings "Sync now" button). */
export async function syncNow(): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
  if (status.pendingPush) await pushState()
  await pullState()
}

let initialized = false

/**
 * Start the sync engine. Safe to call once at app boot; it's a no-op until
 * the user configures Supabase credentials in Settings.
 */
export function initSync(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  // Push on any data mutation (navigation-only changes don't count)
  useStore.subscribe((state, prev) => {
    if (applyingRemote) return
    const changed = (Object.keys(state) as (keyof CalibrateState)[]).some(
      (k) => k !== 'view' && typeof state[k] !== 'function' && state[k] !== prev[k],
    )
    if (changed) {
      status.enabled = !!currentConfig()
      schedulePush()
    }
  })

  // Pull on launch, tab focus, reconnect, and a slow poll
  const tryPull = () => {
    status.enabled = !!currentConfig()
    notify()
    if (status.enabled) void pullState()
  }

  tryPull()
  window.addEventListener('online', tryPull)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryPull()
  })
  setInterval(tryPull, POLL_MS)
}
