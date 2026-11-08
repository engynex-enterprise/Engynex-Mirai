"use client"

/** Registra el service worker de Mirai (público en /sw.js, para todo el sitio). Una sola función para push y PWA. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null
  // updateViaCache "none": el navegador revisa sw.js en la red en cada visita (las actualizaciones llegan enseguida).
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
}

/** El service worker se registra solo en producción (en desarrollo cachearía archivos que cambian a cada rato). */
export const swEnabled = () => process.env.NODE_ENV === "production" && typeof navigator !== "undefined" && "serviceWorker" in navigator

/** Borra las cachés de la app (Ajustes › Mirai como app › Liberar espacio). No toca tus datos: viven en la nube. */
export async function clearAppCaches() {
  if (typeof caches === "undefined") return 0
  const keys = (await caches.keys()).filter((k) => k.startsWith("mirai-") && !k.startsWith("mirai-shell-"))
  await Promise.all(keys.map((k) => caches.delete(k)))
  return keys.length
}

/** Desarrollo: quita service workers y cachés de Mirai que hayan quedado de una versión compilada en el mismo origen. */
export async function unregisterStaleServiceWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    if (!regs.length) return
    await Promise.all(regs.map((r) => r.unregister()))
    if (typeof caches !== "undefined") for (const k of await caches.keys()) if (k.startsWith("mirai-")) await caches.delete(k)
    console.info("Mirai: se quitó un service worker viejo de este localhost (modo desarrollo).")
  } catch { /* sin permiso */ }
}
