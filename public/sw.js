// Minimal, safe service worker for Contibingo's PWA.
// - Never touches non-GET requests, so Server Actions / mutations are untouched.
// - Cache-first for hashed, immutable static assets (fast repeat loads / offline shell).
// - Network-first for everything else, falling back to cache when offline.
const CACHE = "contibingo-v1"

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event

  // Only ever handle same-origin GETs. This deliberately excludes Server Actions
  // and any POST/PUT/DELETE so mutations always hit the network.
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const isImmutable =
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/apple-icon.png"

  if (isImmutable) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const res = await fetch(request)
        if (res.ok) cache.put(request, res.clone())
        return res
      })
    )
    return
  }

  // Network-first for pages/data; fall back to any cached copy when offline.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && request.mode === "navigate") {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return res
      })
      .catch(() => caches.match(request))
  )
})
