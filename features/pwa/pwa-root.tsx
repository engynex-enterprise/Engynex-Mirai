"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { toast } from "@/components/mirai/toast"
import { PWA_COLORS, SHARE_ACTION } from "@/lib/pwa/config"
import { isStandalone } from "@/lib/pwa/platform"
import { registerServiceWorker, swEnabled } from "./sw-client"
import { usePwa, type BeforeInstallPromptEvent } from "./store"

const UPDATE_TOAST = "mirai-version-nueva"
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"

/** Ruta interna de una URL del mismo sitio, sin la marca ?source=pwa. */
function internal(href: string) {
  try {
    const u = new URL(href, location.origin)
    if (u.origin !== location.origin) return null
    u.searchParams.delete("source")
    return u.pathname + (u.search === "?" ? "" : u.search) + u.hash
  } catch { return null }
}

/**
 * Mirai como app instalada, en todas las páginas (app/layout.tsx): registra el service worker, avisa cuando hay una
 * versión nueva, navega al tocar una notificación o un acceso directo con la app ya abierta (launch_handler
 * focus-existing), recibe archivos abiertos con Mirai (Importar), guarda el aviso de instalación y pinta la barra del
 * sistema con el tema que la persona escogió. No dibuja nada.
 */
export function PwaRoot() {
  const router = useRouter()
  const path = usePathname()
  const { theme, resolvedTheme } = useTheme()
  const set = usePwa((s) => s.set)
  const reloading = useRef(false)

  // Instalación: Chrome/Edge avisan que se puede instalar; guardamos el evento para nuestro propio botón.
  useEffect(() => {
    const early = (window as Window & { __miraiInstall?: BeforeInstallPromptEvent }).__miraiInstall
    queueMicrotask(() => set({ installed: isStandalone(), ...(early ? { deferred: early } : {}) }))
    const onPrompt = (e: Event) => { e.preventDefault(); set({ deferred: e as BeforeInstallPromptEvent }) }
    const onInstalled = () => { set({ installed: true, deferred: null, dialog: false }); toast.success("Mirai quedó instalado", { description: "Ábrelo desde tu pantalla de inicio o el menú de aplicaciones, como cualquier app." }) }
    addEventListener("beforeinstallprompt", onPrompt)
    addEventListener("appinstalled", onInstalled)
    return () => { removeEventListener("beforeinstallprompt", onPrompt); removeEventListener("appinstalled", onInstalled) }
  }, [set])

  // La app instalada arranca en /inicio?source=pwa: se quita la marca para que no quede en los enlaces.
  useEffect(() => {
    const u = new URL(location.href)
    if (u.searchParams.get("source") !== "pwa") return
    u.searchParams.delete("source")
    try { sessionStorage.setItem("mirai-abierta-como", "app") } catch { /* sin almacenamiento */ }
    history.replaceState(null, "", u.pathname + u.search + u.hash)
  }, [])

  // Service worker, versión nueva y mensajes (tocar una notificación).
  useEffect(() => {
    if (!swEnabled()) return
    const sw = navigator.serviceWorker
    let reg: ServiceWorkerRegistration | null = null
    const offer = (w: ServiceWorker | "build") => {
      set({ update: w })
      toast.info("Hay una versión nueva de Mirai", {
        id: UPDATE_TOAST, duration: Infinity,
        description: "Actualiza para tener lo último. Lo que ya guardaste no se pierde.",
        action: { label: "Actualizar", onClick: () => applyUpdate() },
      })
    }
    const watch = (r: ServiceWorkerRegistration) => {
      if (r.waiting && sw.controller) offer(r.waiting)
      r.addEventListener("updatefound", () => {
        const w = r.installing
        w?.addEventListener("statechange", () => { if (w.state === "installed" && sw.controller) offer(w) })
      })
    }
    registerServiceWorker().then((r) => { if (r) { reg = r; watch(r) } }).catch(() => {})
    const onCtrl = () => { if (reloading.current) location.reload() }
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== "NAVIGATE") return
      const to = internal(String(e.data.url ?? ""))
      if (to) router.push(to)
    }
    // Una app instalada puede quedar abierta días: al volver a ella se revisa si hay versión nueva (máx. cada 10 min).
    let last = 0
    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 10 * 60_000) return
      last = Date.now()
      reg?.update().catch(() => {})
      if (BUILD === "dev" || usePwa.getState().update) return
      try {
        const r = await fetch("/api/public/version", { cache: "no-store" })
        const { build } = (await r.json()) as { build?: string }
        if (build && build !== "dev" && build !== BUILD) offer("build")
      } catch { /* sin conexión */ }
    }
    sw.addEventListener("controllerchange", onCtrl)
    sw.addEventListener("message", onMsg)
    document.addEventListener("visibilitychange", check)
    const iv = setInterval(check, 30 * 60_000)
    return () => { sw.removeEventListener("controllerchange", onCtrl); sw.removeEventListener("message", onMsg); document.removeEventListener("visibilitychange", check); clearInterval(iv) }
    function applyUpdate() {
      const w = usePwa.getState().update
      if (w && w !== "build") {
        reloading.current = true
        w.postMessage({ type: "SKIP_WAITING" })
        setTimeout(() => location.reload(), 3000)
      } else location.reload()
    }
  }, [router, set])

  // Accesos directos, enlaces y archivos con la app ya abierta (launch_handler: focus-existing): llegan aquí en vez de
  // abrir otra ventana. También archivos CSV/Excel abiertos con Mirai desde el escritorio (file_handlers).
  useEffect(() => {
    type LaunchParams = { targetURL?: string; files?: FileSystemFileHandle[] }
    const lq = (window as Window & { launchQueue?: { setConsumer: (cb: (p: LaunchParams) => void) => void } }).launchQueue
    if (!lq) return
    lq.setConsumer(async (p) => {
      if (p.files?.length) {
        const files = await Promise.all(p.files.map((h) => h.getFile())).catch(() => [] as File[])
        if (files.length) { usePwa.getState().set({ files }); if (location.pathname !== "/importar") router.push("/importar") }
        return
      }
      const to = p.targetURL ? internal(p.targetURL) : null
      if (!to || to === internal(location.href)) return
      // Compartir con la app abierta no trae el archivo por aquí: se abre el formulario para tomar la foto.
      router.push(to.startsWith(SHARE_ACTION) ? "/gastos?nuevo=1&compartido=sin-archivo" : to)
    })
  }, [router])

  // Color de la barra del sistema (Android, escritorio): sigue el tema escogido en Mirai aunque el sistema use otro.
  useEffect(() => {
    const forced = theme === "light" || theme === "dark" ? (resolvedTheme === "dark" ? PWA_COLORS.themeDark : PWA_COLORS.themeLight) : null
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      const own = (m.media || "").includes("dark") ? PWA_COLORS.themeDark : PWA_COLORS.themeLight
      m.content = forced ?? own
    })
  }, [theme, resolvedTheme, path])

  return null
}
