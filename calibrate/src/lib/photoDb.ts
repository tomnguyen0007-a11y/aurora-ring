/**
 * Photo blobs live in IndexedDB, NOT in the Zustand persist store. localStorage
 * has a ~5MB quota and the persist middleware re-serialises the ENTIRE state on
 * every write — a handful of base64 photos would make every store update slow
 * and eventually break persistence for everything. IndexedDB holds hundreds of
 * MB and is only touched when a photo is actually read or written.
 *
 * A module-level memory cache fronts the DB so gallery thumbnails render
 * instantly after first load and freshly-added photos appear before the async
 * write lands. Where IndexedDB is unavailable (unit tests, some private modes)
 * the cache alone carries the session.
 */
const DB_NAME = 'calibrate-photos'
const STORE = 'blobs'

const cache = new Map<string, string>()

let dbPromise: Promise<IDBDatabase | null> | null = null
function db(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
  return dbPromise
}

/** Synchronous cache lookup — lets React render a just-added photo without a loading flash. */
export function peekPhoto(id: string): string | null {
  return cache.get(id) ?? null
}

export async function savePhoto(id: string, dataUrl: string): Promise<void> {
  cache.set(id, dataUrl)
  const d = await db()
  if (!d) return
  await new Promise<void>((resolve) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(dataUrl, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export async function loadPhoto(id: string): Promise<string | null> {
  const hit = cache.get(id)
  if (hit) return hit
  const d = await db()
  if (!d) return null
  return new Promise((resolve) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(id)
    req.onsuccess = () => {
      const v = typeof req.result === 'string' ? req.result : null
      if (v) cache.set(id, v)
      resolve(v)
    }
    req.onerror = () => resolve(null)
  })
}

export async function deletePhoto(id: string): Promise<void> {
  cache.delete(id)
  const d = await db()
  if (!d) return
  await new Promise<void>((resolve) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}
