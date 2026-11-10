"use client"

import { useEffect, useRef } from "react"
import { onlineManager, useQueryClient } from "@tanstack/react-query"
import { CloudOff, RefreshCw } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { useApp } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { flushOutbox, isOffline, refreshPending, useOffline, OUTBOX_SYNC_TAG } from "@/lib/offline/outbox"
import { restoreQueries, saveQueries } from "@/lib/offline/persist"
import { cn } from "@/lib/utils"

/** Secciones que se dejan listas para abrir sin conexión (además de las que la persona ya abrió). */
export const OFFLINE_PAGES = [
  "/inicio", "/gastos", "/fijos", "/ingresos", "/recordatorios", "/balance", "/dashboard", "/presupuesto", "/flujo", "/metas",
  "/tarjetas", "/le-debo", "/me-deben", "/personas", "/calendario", "/suscripciones", "/calculadoras", "/academia", "/ajustes", "/perfil",
]
const PREPARE_KEY = "mirai-preparado-at"
const PREPARE_EVERY = 12 * 3600_000

/** Pide al service worker guardar las secciones principales (y sus archivos) para abrirlas sin conexión. */
export function prepareOffline(force = false) {
  try {
    if (!force && Date.now() - Number(localStorage.getItem(PREPARE_KEY) || 0) < PREPARE_EVERY) return false
    const sw = navigator.serviceWorker?.controller
    if (!sw || isOffline()) return false
    sw.postMessage({ type: "WARM", urls: OFFLINE_PAGES })
    localStorage.setItem(PREPARE_KEY, String(Date.now()))
    return true
  } catch { return false }
}

/**
 * Mirai sin conexión, dentro del shell: restaura lo último que se vio, lo guarda mientras se usa, envía los cambios
 * pendientes cuando vuelve el internet, deja listas las secciones principales y, sin conexión, abre los enlaces como
 * página completa (el service worker las sirve guardadas). No dibuja nada: la barra la pone <OfflineBar />.
 */
export function OfflineSync() {
  const qc = useQueryClient()
  const { user, book } = useApp()
  const set = useOffline((s) => s.set)
  const restored = useRef(false)

  // 1) Restaurar lo guardado y luego guardar lo que cambie (cada 3 s como máximo y al salir de la app).
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | null = null
    const save = () => { timer = null; if (restored.current) void saveQueries(qc, user.id) }
    void restoreQueries(qc, user.id).finally(() => { if (alive) restored.current = true })
    const unsub = qc.getQueryCache().subscribe((ev) => { if (ev.type === "updated" && ev.action.type === "success" && !timer) timer = setTimeout(save, 3000) })
    const onHide = () => { if (document.visibilityState === "hidden") save() }
    document.addEventListener("visibilitychange", onHide)
    return () => { alive = false; unsub(); document.removeEventListener("visibilitychange", onHide); if (timer) clearTimeout(timer) }
  }, [qc, user.id])

  // 2) Conexión: estado visible, envío de pendientes y aviso del resultado.
  useEffect(() => {
    const flush = async () => {
      const r = await flushOutbox(user.id)
      if (!r) return
      for (const t of new Set(r.sent.map((e) => `${e.bookId}|${e.table}`))) { const [b, tb] = t.split("|"); invalidateBook(qc, b, tb) }
      if (r.sent.length) toast.success(r.sent.length === 1 ? "Enviamos 1 cambio que hiciste sin conexión" : `Enviamos ${r.sent.length} cambios que hiciste sin conexión`, { id: "mirai-cola-enviada" })
      r.failed.slice(0, 3).forEach((f) => toast.error("Un cambio sin conexión no se pudo guardar", { description: `${f.e.label ? `${f.e.label}: ` : ""}${f.msg}` }))
      if (r.failed.length) for (const f of r.failed) invalidateBook(qc, f.e.bookId, f.e.table)
    }
    const update = () => {
      const on = !isOffline()
      set({ online: on })
      onlineManager.setOnline(on)
      if (on) void flush()
    }
    update()
    void refreshPending()
    const onVisible = () => { if (document.visibilityState === "visible") void flush() }
    // El service worker envió la cola en segundo plano (Background Sync): se refrescan los datos.
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== "OUTBOX_SENT") return
      void refreshPending()
      for (const t of (e.data.tables ?? []) as string[]) invalidateBook(qc, book.id, t)
    }
    addEventListener("online", update)
    addEventListener("offline", update)
    document.addEventListener("visibilitychange", onVisible)
    navigator.serviceWorker?.addEventListener("message", onMsg)
    return () => {
      removeEventListener("online", update); removeEventListener("offline", update)
      document.removeEventListener("visibilitychange", onVisible)
      navigator.serviceWorker?.removeEventListener("message", onMsg)
    }
  }, [qc, user.id, book.id, set])

  // 3) Preparar las secciones principales (una vez cada 12 h), pedir que el navegador no borre lo guardado y, en
  //    Android/Chrome instalado, refrescarlas solas de vez en cuando (Periodic Background Sync).
  useEffect(() => {
    const t = setTimeout(() => {
      prepareOffline()
      void navigator.storage?.persist?.().catch(() => false)
      void navigator.serviceWorker?.ready.then(async (reg) => {
        const ps = (reg as ServiceWorkerRegistration & { periodicSync?: { register: (t: string, o: { minInterval: number }) => Promise<void> } }).periodicSync
        if (!ps) return
        const st = await navigator.permissions?.query({ name: "periodic-background-sync" as PermissionName }).catch(() => null)
        if (st?.state === "granted") await ps.register("mirai-paginas", { minInterval: PREPARE_EVERY }).catch(() => {})
        // Si quedaron cambios y el navegador sabe enviarlos en segundo plano, se le recuerda.
        await (reg as ServiceWorkerRegistration & { sync?: { register: (t: string) => Promise<void> } }).sync?.register(OUTBOX_SYNC_TAG).catch(() => {})
      }).catch(() => {})
    }, 8000)
    return () => clearTimeout(t)
  }, [])

  // 4) Sin conexión, un enlace interno se abre como página completa: el service worker la sirve guardada (la navegación
  //    interna de Next pediría datos al servidor y se quedaría esperando).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!isOffline() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return
      const u = new URL(a.href, location.href)
      if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search)) return
      e.preventDefault()
      location.assign(u.pathname + u.search + u.hash)
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  return null
}

/** Franja "Sin conexión" (y cambios por enviar) debajo de la barra superior. */
export function OfflineBar() {
  const { online, pending, syncing } = useOffline()
  if (online && !pending) return null
  return (
    <div role="status" aria-live="polite"
      className={cn("offline-bar fixed left-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold shadow-[0_4px_14px_rgba(0,0,0,.18)]",
        online ? "bg-info-soft text-info" : "bg-[#1F2B4B] text-white dark:bg-[#E4E6EB] dark:text-[#1F2B4B]")}>
      {online ? <RefreshCw className={cn("size-4 shrink-0", syncing && "animate-spin")} aria-hidden /> : <CloudOff className="size-4 shrink-0" aria-hidden />}
      <span className="truncate">
        {online ? `Enviando ${pending} ${pending === 1 ? "cambio" : "cambios"}…`
          : `Sin conexión · ves lo último guardado${pending ? ` · ${pending} por enviar` : ""}`}
      </span>
    </div>
  )
}
