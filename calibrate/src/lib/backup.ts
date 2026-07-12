import { useStore } from '../store/store'
import { loadPhoto, savePhoto } from './photoDb'

/**
 * Full-app backup: the persisted store snapshot plus every photo blob from
 * IndexedDB, as one self-contained JSON file. The entire life-OS lives on one
 * phone — this is the safety net.
 *
 * Restore writes the snapshot back to localStorage in zustand-persist's own
 * format and reloads, so version migrations run exactly as they would for a
 * returning user — an old backup upgrades itself on import.
 */
export interface CalibrateBackup {
  app: 'calibrate'
  exportedAt: string
  version: number
  state: Record<string, unknown>
  /** photo id → dataUrl, exported from IndexedDB */
  photos: Record<string, string>
}

const PERSIST_KEY = 'calibrate-v1'

export async function buildBackup(): Promise<CalibrateBackup> {
  // The persisted payload is the source of truth — already partialized (no
  // transient view state, no chat images), already versioned for migration.
  const raw = JSON.parse(localStorage.getItem(PERSIST_KEY) ?? '{}') as { state?: Record<string, unknown>; version?: number }
  const photos: Record<string, string> = {}
  for (const p of useStore.getState().trainingPhotos) {
    const url = await loadPhoto(p.id)
    if (url) photos[p.id] = url
  }
  return {
    app: 'calibrate',
    exportedAt: new Date().toISOString(),
    version: raw.version ?? 0,
    state: raw.state ?? {},
    photos,
  }
}

export async function downloadBackup(): Promise<void> {
  const backup = await buildBackup()
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `calibrate-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Basic shape check so a random JSON file can't wipe the app. */
export function isCalibrateBackup(parsed: unknown): parsed is CalibrateBackup {
  if (!parsed || typeof parsed !== 'object') return false
  const b = parsed as Record<string, unknown>
  return b.app === 'calibrate' && typeof b.version === 'number' && !!b.state && typeof b.state === 'object'
}

/**
 * Overwrites current data with the backup and reloads. Caller confirms with
 * the user FIRST — this is destructive by design.
 */
export async function restoreBackup(backup: CalibrateBackup): Promise<void> {
  // Photos first: if anything fails mid-restore, the store still points at
  // whatever blobs made it in, and a reload re-runs cleanly.
  for (const [id, dataUrl] of Object.entries(backup.photos ?? {})) {
    await savePhoto(id, dataUrl)
  }
  localStorage.setItem(PERSIST_KEY, JSON.stringify({ state: backup.state, version: backup.version }))
  location.reload()
}
