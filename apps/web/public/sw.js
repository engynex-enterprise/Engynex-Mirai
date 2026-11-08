// Service worker de Mirai (docs/PWA.md): Mirai sin conexión, caché de archivos estáticos, compartir a Mirai,
// notificaciones push con acciones, número en el ícono y envío de cambios hechos sin conexión.
//
// Sin conexión: las páginas de la app que la persona abre (y las principales, que la app pide preparar con WARM) se
// guardan en "mirai-pages" para abrirlas sin internet; con internet siempre se piden a la red (datos al día). Son de
// esa persona y quedan solo en su dispositivo: se borran al cerrar sesión (CLEAR_PRIVATE) y en Ajustes › Mirai como
// app. NUNCA se guardan /api, /v1, /auth, el login ni respuestas RSC. Los datos (consultas) los guarda la app en
// IndexedDB (lib/offline/*).
//
// Al cambiar este archivo sube VERSION: la app muestra "Hay una versión nueva · Actualizar" y el nuevo service worker
// espera a que la persona toque Actualizar (mensaje SKIP_WAITING) para no cambiarle la app mientras escribe.
const VERSION = "5.6-offline-3"
const STATIC = `mirai-static-${VERSION}`
const SHELL = `mirai-shell-${VERSION}`
// Sin versión: las páginas guardadas sobreviven a una actualización del service worker.
const PAGES = "mirai-pages"
// Mismos valores que lib/pwa/config.ts (SHARE_CACHE, SHARE_FILE_KEY, SHARE_ACTION, SHARE_FILE_FIELD, OFFLINE_URL).
const SHARE = "mirai-compartido"
const SHARE_FILE = "/compartido/archivo"
const SHARE_META = "/compartido/datos"
const SHARE_ACTION = "/compartir"
const SHARE_FIELD = "archivo"
const OFFLINE = "/offline.html"
const PRECACHE = [OFFLINE, "/pwa/icon-192.png", "/pwa/icon-512.png", "/pwa/badge-96.png", "/brand/mirai-logo.svg"]
const MAX_STATIC = 900
const MAX_PAGES = 80
// Rutas que nunca se guardan (públicas, de sesión o de un solo uso).
const NO_PAGE = /^\/(login|registro|recuperar|actualizar-clave|verificacion|bienvenida|auth|api|v1|invitacion|contador|compartir|abrir|admin)(\/|$)/
// Base local compartida con la app (lib/offline/idb.ts): mismos nombre, versión y almacenes.
const DB_NAME = "mirai-offline"
const DB_VERSION = 1

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))))
})

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC, SHELL, SHARE, PAGES])
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
  else if (t === "CLEAR_PRIVATE") event.waitUntil(caches.delete(PAGES))
  else if (t === "WARM") event.waitUntil(warm(Array.isArray(event.data.urls) ? event.data.urls : []).then(() => kv("warm-urls", event.data.urls)))
  else if (t === "PAGES") event.waitUntil(listPages().then((p) => event.source && event.source.postMessage({ type: "PAGES", pages: p })))
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

/** Clave de una página guardada: solo la ruta (?id=… y demás los lee la página en el navegador). */
const pageKey = (url) => new URL(url, self.location.origin).origin + new URL(url, self.location.origin).pathname
const cacheablePage = (url, res) =>
  res && res.ok && res.type === "basic" && !res.redirected && !NO_PAGE.test(url.pathname) &&
  (res.headers.get("content-type") || "").includes("text/html")

async function putPage(url, res) {
  // Una página que falló al armarse en el servidor llega con 200 (Next ya había empezado a enviarla) y trae la pantalla
  // de error (<html id="__next_error__">): no se guarda, para no mostrarla luego sin conexión.
  const html = await res.text()
  if (html.includes('id="__next_error__"')) return
  const c = await caches.open(PAGES)
  await c.put(pageKey(url.href), new Response(html, { status: res.status, statusText: res.statusText, headers: res.headers }))
  const keys = await c.keys()
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await c.delete(keys[i])
}

/** Navegación: a la red (datos al día) y se guarda la página; sin conexión, la guardada o la página offline. */
async function navigate(event) {
  const url = new URL(event.request.url)
  const fallback = async () => {
    const saved = await caches.match(pageKey(url.href), { cacheName: PAGES })
    if (saved) return saved
    const off = await caches.match(OFFLINE)
    return off || new Response("<h1>Sin conexión</h1><p>Vuelve a intentarlo cuando tengas internet.</p>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })
  }
  try {
    const pre = await event.preloadResponse
    const res = pre || await fetch(event.request)
    // El servidor caído o reiniciando (502/503/504 del balanceador, 520–527 de Cloudflare): en vez de la página de error
    // del proveedor, la copia guardada o la pantalla de Mirai ("Mirai no responde").
    if (res.status >= 502 && res.status <= 599) return fallback()
    if (cacheablePage(url, res)) event.waitUntil(putPage(url, res.clone()).catch(() => {}))
    return res
  } catch {
    return fallback()
  }
}

/** Páginas guardadas (para la página offline y Ajustes › Mirai como app). */
async function listPages() {
  const c = await caches.open(PAGES)
  return (await c.keys()).map((r) => new URL(r.url).pathname)
}

/** Prepara páginas para usarlas sin conexión: las pide con la sesión, las guarda y guarda sus archivos (JS y CSS). */
async function warm(urls) {
  const assets = new Set()
  for (const u of urls.slice(0, 30)) {
    try {
      const url = new URL(u, self.location.origin)
      if (url.origin !== self.location.origin || NO_PAGE.test(url.pathname)) continue
      const res = await fetch(url.href, { credentials: "same-origin", headers: { Accept: "text/html" } })
      if (!cacheablePage(url, res)) continue
      const html = await res.clone().text()
      if (html.includes('id="__next_error__"')) continue
      await putPage(url, res)
      for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) assets.add(m[0])
    } catch { /* sin red: se intenta en la próxima */ }
  }
  const cache = await caches.open(STATIC)
  for (const a of [...assets].slice(0, 400)) {
    try { if (!(await caches.match(a))) { const r = await fetch(a); if (r.ok) await cache.put(a, r) } } catch { /* siguiente */ }
  }
  await trim(cache)
}

// ── Base local (cola de cambios hechos sin conexión y marcas) ──
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION)
    r.onupgradeneeded = () => {
      const d = r.result
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv")
      if (!d.objectStoreNames.contains("outbox")) d.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true })
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
function store(name, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const tx = d.transaction(name, mode)
    const r = fn(tx.objectStore(name))
    tx.oncomplete = () => { d.close(); resolve(r.result) }
    tx.onerror = () => { d.close(); reject(tx.error) }
  }))
}
const kv = (k, v) => store("kv", "readwrite", (s) => s.put(v, k)).catch(() => {})
const kvRead = (k) => store("kv", "readonly", (s) => s.get(k)).catch(() => undefined)

/** Envía la cola (Background Sync). Mismo candado que la app (lib/offline/outbox.ts) para no enviar dos veces. */
async function flushOutbox() {
  const run = async () => {
    const all = await store("outbox", "readonly", (s) => s.getAll()).catch(() => [])
    const tables = new Set()
    for (const e of all) {
      let res
      try {
        res = await fetch(e.url, { method: e.method, credentials: "same-origin", body: e.body, headers: Object.assign(e.body ? { "content-type": "application/json" } : {}, { "idempotency-key": e.key, "x-mirai-client": "web-offline-sw" }) })
      } catch { throw new Error("sin red") } // Background Sync lo vuelve a intentar
      if (res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500) throw new Error("más tarde")
      // Los rechazos (4xx) los muestra la app al abrir: aquí solo se envía lo que la API acepta.
      if (!res.ok && !(res.status === 404 && e.method !== "PUT")) return finish(tables)
      await store("outbox", "readwrite", (s) => s.delete(e.seq))
      tables.add(e.table)
    }
    return finish(tables)
  }
  const finish = async (tables) => {
    if (!tables.size) return
    for (const c of await self.clients.matchAll({ type: "window" })) c.postMessage({ type: "OUTBOX_SENT", tables: [...tables] })
  }
  if (self.navigator && self.navigator.locks) return self.navigator.locks.request("mirai-outbox", run)
  return run()
}

self.addEventListener("sync", (event) => {
  if (event.tag === "mirai-outbox") event.waitUntil(flushOutbox())
})

// Android/Chrome instalado: refresca de vez en cuando las páginas guardadas (Periodic Background Sync).
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "mirai-paginas") event.waitUntil(kvRead("warm-urls").then((u) => warm(Array.isArray(u) ? u : [])))
})

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
      silent: false, // con el sonido del sistema (en la app suena lib/sound.ts)
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
