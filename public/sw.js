// Offline support: network first for pages, cache first for built assets.
const CACHE = 'wedding-fund-v1'

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg'])))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const { request } = e
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).then(res => {
      const copy = res.clone()
      caches.open(CACHE).then(c => c.put('./index.html', copy))
      return res
    }).catch(() => caches.match('./index.html')))
    return
  }
  e.respondWith(caches.match(request).then(hit => hit || fetch(request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(request, copy)) }
    return res
  })))
})
