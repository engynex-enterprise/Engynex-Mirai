// Service worker de Mirai: notificaciones push y apertura al tocar el aviso.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: "Mirai", body: event.data ? event.data.text() : "" } }
  event.waitUntil(self.registration.showNotification(d.title || "Mirai", {
    body: d.body || "",
    icon: "/brand/mirai-logo.png",
    badge: "/brand/mirai-logo.png",
    tag: d.tag || "mirai",
    data: { url: d.url || "/inicio" },
    lang: "es-CO",
  }))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || "/inicio", self.location.origin).href
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    const same = all.find((c) => c.url.startsWith(self.location.origin))
    if (same) { await same.focus(); return same.navigate(url) }
    return self.clients.openWindow(url)
  })())
})
