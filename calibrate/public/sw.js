const CACHE = 'calibrate-shell-v8.4'

self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      // Take control of already-open tabs immediately so a new deploy applies on
      // the very next reload instead of requiring a second one.
      await self.clients.claim()
    })(),
  )
})

// Network-first for same-origin GET, falling back to cache (offline support)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copy))
        return res
      })
      .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match('./index.html'))),
  )
})
