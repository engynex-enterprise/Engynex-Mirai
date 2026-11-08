"use client"

import { registerServiceWorker } from "@/features/pwa/sw-client"

const b64ToU8 = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/** Registra el service worker (PWA) una sola vez (features/pwa/sw-client.ts). */
export const registerSW = registerServiceWorker

export async function currentPush() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Pide permiso y guarda la suscripción de este dispositivo (PUT /v1/push/subscriptions). */
export async function enablePush() {
  if (!pushSupported()) throw new Error("Este navegador no permite notificaciones push. En iPhone, primero instala Mirai en la pantalla de inicio.")
  const perm = await Notification.requestPermission()
  if (perm !== "granted") throw new Error("No diste permiso para las notificaciones. Puedes cambiarlo en la configuración del navegador.")
  const reg = (await registerSW())!
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) })
  const j = sub.toJSON()
  const { browserApi, unwrapData } = await import("@/lib/api/client")
  unwrapData(await browserApi().notify.pushSubscribe({ body: { endpoint: sub.endpoint, keys: { p256dh: j.keys!.p256dh, auth: j.keys!.auth }, userAgent: navigator.userAgent.slice(0, 200) } }))
}

export async function disablePush() {
  const sub = await currentPush()
  if (!sub) return
  const { browserApi } = await import("@/lib/api/client")
  // Un error al borrar no impide quitar la suscripción del navegador.
  await browserApi().notify.pushUnsubscribe({ body: { endpoint: sub.endpoint } }).catch(() => null)
  await sub.unsubscribe()
}
