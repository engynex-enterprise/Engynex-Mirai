// Service worker de Mirai (docs/PWA.md): página sin conexión, caché de archivos estáticos, compartir a Mirai,
// notificaciones push con acciones y número en el ícono.
//
// Privacidad: NUNCA se guardan páginas, datos de Supabase, /api, /auth ni respuestas RSC (son de cada persona). Solo
// archivos públicos e iguales para todos: /_next/static (con huella en el nombre), /pwa, /brand y la página offline.
//
// Al cambiar este archivo sube VERSION: la app muestra "Hay una versión nueva · Actualizar" y el nuevo service worker
// espera a que la persona toque Actualizar (mensaje SKIP_WAITING) para no cambiarle la app mientras escribe.
const VERSION = "5.5-pwa-1"
const STATIC = `mirai-static-${VERSION}`
const SHELL = `mirai-shell-${VERSION}`
// Mismos valores que lib/pwa/config.ts (SHARE_CACHE, SHARE_FILE_KEY, SHARE_ACTION, SHARE_FILE_FIELD, OFFLINE_URL).
const SHARE = "mirai-compartido"
const SHARE_FILE = "/compartido/archivo"
const SHARE_META = "/compartido/datos"
const SHARE_ACTION = "/compartir"
const SHARE_FIELD = "archivo"
const OFFLINE = "/offline.html"
const PRECACHE = [OFFLINE, "/pwa/icon-192.png", "/pwa/icon-512.png", "/pwa/badge-96.png", "/brand/mirai-logo.svg"]
const MAX_STATIC = 400

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))))
})

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC, SHELL, SHARE])
    for (const k of await caches.keys()) if (k.startsWith("mirai-") && !keep.has(k)) await caches.delete(k)
    // La página empieza a descargarse mientras arranca el service worker (más rápido al abrir la app).
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {})
    await self.clients.claim()
  })())
})

self.addEventListener("message", (event) => {
  const t = event.data && event.data.type
  if (t === "SKIP_WAITING") self.skipWaiting()
  else if (t === "VERSION") { if (event.source) event.source.postMessage({ type: "VERSION", version: VERSION }) }
  else if (t === "CLEAR_SHARE") event.waitUntil(caches.delete(SHARE))
})

const sameOrigin = (url) => url.origin === self.location.origin
const isPrivate = (req, url) =>
  url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/_next/data/") ||
  req.headers.get("RSC") === "1" || req.headers.has("Next-Router-State-Tree") || url.searchParams.has("_rsc")
const isStatic = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa/") || url.pathname.startsWith("/brand/")

self.addEventListener("fetch", (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (!sameOrigin(url)) return // Supabase, Google, anuncios… van directo a la red.
  if (req.method === "POST" && url.pathname === SHARE_ACTION) return event.respondWith(receiveShare(req))
  if (req.method !== "GET" || isPrivate(req, url)) return
  if (req.mode === "navigate") return event.respondWith(navigate(event))
  if (isStatic(url)) return event.respondWith(cacheFirst(req))
})

/** Navegación: siempre a la red (datos al día); sin conexión, la página offline de Mirai. */
async function navigate(event) {
  try {
    const pre = await event.preloadResponse
    if (pre) return pre
    return await fetch(event.request)
  } catch {
    const off = await caches.match(OFFLINE)
    return off || new Response("<h1>Sin conexión</h1><p>Vuelve a intentarlo cuando tengas internet.</p>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })
  }
}

/** Archivos con huella (no cambian nunca): de la caché si ya están, si no de la red y se guardan. */
async function cacheFirst(req) {
  const cache = await caches.open(STATIC)
  // Busca en todas las cachés de Mirai (la de arranque trae los íconos de la página offline).
  const hit = await caches.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok && res.type === "basic") {
    cache.put(req, res.clone()).then(() => trim(cache)).catch(() => {})
  }
  return res
}

async function trim(cache) {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - MAX_STATIC; i++) await cache.delete(keys[i])
}

/** Compartir a Mirai (share_target del manifest): guarda el archivo y abre Registrar gasto, que lo lee con IA. */
async function receiveShare(req) {
  let hasFile = false
  try {
    const fd = await req.formData()
    const file = fd.getAll(SHARE_FIELD).find((f) => f && typeof f === "object" && f.size > 0)
    const meta = { title: fd.get("title") || "", text: fd.get("text") || "", url: fd.get("url") || "", name: file ? file.name : "", type: file ? file.type : "", at: Date.now() }
    const c = await caches.open(SHARE)
    await c.delete(SHARE_FILE)
    if (file) {
      hasFile = true
      await c.put(SHARE_FILE, new Response(file, { headers: { "Content-Type": file.type || "application/octet-stream", "X-Mirai-Name": encodeURIComponent(file.name || "factura") } }))
    }
    await c.put(SHARE_META, new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }))
  } catch { /* si algo falla, igual abre el formulario vacío */ }
  return Response.redirect(new URL(`/gastos?nuevo=1&compartido=${hasFile ? "archivo" : "texto"}`, self.location.origin).href, 303)
}

// ── Notificaciones push ──
// Carga útil (lib/notify/channels.ts › sendPush): { title, body, url, tag, badge?, image?, actions?: [{ action, title, url }],
// requireInteraction?, renotify? }. Las acciones salen como botones en Android y escritorio (iOS las ignora).
self.addEventListener("push", (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: "Mirai", body: event.data ? event.data.text() : "" } }
  const actions = Array.isArray(d.actions) ? d.actions.slice(0, 2).filter((a) => a && a.action && a.title) : []
  event.waitUntil(Promise.all([
    self.registration.showNotification(d.title || "Mirai", {
      body: d.body || "",
      icon: "/pwa/icon-192.png",
      badge: "/pwa/badge-96.png",
      ...(d.image ? { image: d.image } : {}),
      tag: d.tag || "mirai",
      renotify: !!d.renotify && !!d.tag,
      requireInteraction: !!d.requireInteraction,
      timestamp: Date.now(),
      lang: "es-CO",
      dir: "ltr",
      actions: actions.map((a) => ({ action: a.action, title: a.title })),
      data: { url: d.url || "/inicio", actions },
    }),
    // Número en el ícono de la app (Android, escritorio, iPhone 16.4+ instalado). Sin número: un punto.
    setBadge(typeof d.badge === "number" ? d.badge : undefined),
  ]))
})

async function setBadge(n) {
  const nav = self.navigator
  if (!nav || !("setAppBadge" in nav)) return
  try { if (n === 0) await nav.clearAppBadge(); else await nav.setAppBadge(n) } catch { /* sin permiso */ }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const act = (data.actions || []).find((a) => a.action === event.action)
  const url = new URL((act && act.url) || data.url || "/inicio", self.location.origin).href
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    const same = all.find((c) => c.url.startsWith(self.location.origin))
    if (same) {
      await same.focus()
      // La app navega sin recargar (features/pwa/pwa-root.tsx está en todas las páginas).
      same.postMessage({ type: "NAVIGATE", url })
      return
    }
    return self.clients.openWindow(url)
  })())
})
