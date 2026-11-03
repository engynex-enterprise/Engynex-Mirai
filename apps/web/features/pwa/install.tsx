"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { ArrowDown, BookOpen, Check, ChevronLeft, ChevronRight, Copy, Download, EllipsisVertical, MonitorDown, Share, SquarePlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { toast } from "@/components/mirai/toast"
import { installPlatform, type InstallPlatform } from "@/lib/pwa/platform"
import { cn } from "@/lib/utils"
import { INSTALL_DISMISS_KEY, usePwa } from "./store"

const noop = () => () => {}

/** Plataforma de instalación de este navegador (null hasta hidratar). */
export function useInstallPlatform(): InstallPlatform | null {
  return useSyncExternalStore(noop, () => installPlatform(navigator.userAgent, navigator.maxTouchPoints, navigator.platform), () => null)
}

/** Estado y acción de "Instalar Mirai". */
export function useInstall() {
  const deferred = usePwa((s) => s.deferred)
  const installed = usePwa((s) => s.installed)
  const set = usePwa((s) => s.set)
  const platform = useInstallPlatform()
  /** Android/escritorio: el diálogo del sistema. iPhone y otros: nuestras instrucciones. */
  const install = async () => {
    if (deferred) {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice.catch(() => ({ outcome: "dismissed" as const }))
      set({ deferred: null })
      if (outcome === "dismissed") toast("Puedes instalar Mirai cuando quieras", { description: "Desde tu foto en el menú › Instalar Mirai, o en Ajustes › Mirai como app." })
      return
    }
    set({ dialog: true })
  }
  // Sin evento y fuera de iPhone/Safari: solo si el navegador lo permite desde su menú.
  const can = !installed && (!!deferred || platform === "ios-safari" || platform === "ios-other" || platform === "ios-inapp" || platform === "mac-safari" || platform === "android" || platform === "desktop-chromium")
  return { platform, installed, can, install, direct: !!deferred }
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-secondary/50 p-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-bold text-primary-foreground">{n}</span>
      <div className="grid min-w-0 flex-1 gap-1 text-[15px] leading-5">{children}</div>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-[#0A84FF] shadow-card" aria-hidden>{icon}</span>
    </li>
  )
}

/** Dibujo de la barra de Safari en iPhone con el botón Compartir resaltado. */
function SafariBar() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-xs overflow-hidden rounded-2xl bg-[#F2F2F7] p-3 shadow-card ring-1 ring-black/5 dark:bg-[#1C1C1E] dark:ring-white/10">
      <div className="mb-3 flex h-9 items-center justify-center rounded-lg bg-white text-[13px] text-[#3C3C43] dark:bg-[#2C2C2E] dark:text-[#EBEBF5]">mirai.engynex.com</div>
      <div className="flex items-center justify-around text-[#0A84FF]">
        <ChevronLeft className="size-6" /><ChevronRight className="size-6 opacity-40" />
        <span className="relative grid size-10 place-items-center rounded-full bg-[#0A84FF]/15 ring-2 ring-[#0A84FF]">
          <Share className="size-5" />
          <ArrowDown className="absolute -top-7 left-1/2 size-5 -translate-x-1/2 animate-bounce" />
        </span>
        <BookOpen className="size-5" /><Copy className="size-5" />
      </div>
    </div>
  )
}

/** Ventana "Instalar Mirai" con los pasos de cada navegador (iPhone ilustrado). */
export function InstallDialog() {
  const open = usePwa((s) => s.dialog)
  const set = usePwa((s) => s.set)
  const platform = useInstallPlatform()
  const close = () => set({ dialog: false })
  const ios = platform === "ios-safari" || platform === "ios-other"
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => set({ dialog: o })} title="Instalar Mirai"
      description="Queda en tu pantalla de inicio como una app: se abre a pantalla completa, más rápido y con avisos."
      footer={<Button onClick={close}>Entendido</Button>}>
      <div className="grid gap-4 pb-2">
        <div className="flex items-center gap-3 rounded-2xl bg-soft-gradient p-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-[14px] bg-[linear-gradient(145deg,#2B3F6E,#1F2B4B_55%,#1D3F2A)] shadow-[0_6px_16px_rgba(31,43,75,.3)]"><IsoIcon k="mirai" size={38} /></span>
          <div className="grid min-w-0 gap-0.5"><p className="font-semibold">Mirai</p><p className="text-sm text-muted-foreground">Tu futuro financiero · gratis, sin tienda de apps</p></div>
        </div>
        {platform === "ios-inapp" && (
          <ol className="grid gap-2">
            <Step n={1} icon={<EllipsisVertical className="size-5" />}>Estás dentro de otra app (Facebook, Instagram, Gmail…). Toca su menú <b>⋯</b> y elige <b>Abrir en Safari</b>.</Step>
            <Step n={2} icon={<Share className="size-5" />}>En Safari, toca <b>Compartir</b> y luego <b>Agregar a inicio</b>.</Step>
          </ol>
        )}
        {ios && (
          <>
            <SafariBar />
            <ol className="grid gap-2">
              <Step n={1} icon={<Share className="size-5" />}>Toca <b>Compartir</b> {platform === "ios-other" ? "(en la barra de direcciones o en el menú ⋯)" : "en la barra de abajo (en iPad, arriba a la derecha)"}.</Step>
              <Step n={2} icon={<SquarePlus className="size-5" />}>Desliza hacia abajo y toca <b>Agregar a inicio</b>.</Step>
              <Step n={3} icon={<Check className="size-5" />}>Revisa que diga <b>Mirai</b> y toca <b>Agregar</b>. Ábrelo desde el ícono nuevo.</Step>
            </ol>
            <p className="text-sm text-muted-foreground">Con Mirai instalado en tu iPhone (iOS 16.4 o más nuevo) también puedes recibir notificaciones: actívalas en Ajustes › Alertas desde la app.</p>
          </>
        )}
        {platform === "mac-safari" && (
          <ol className="grid gap-2">
            <Step n={1} icon={<Share className="size-5" />}>En Safari, abre el menú <b>Archivo</b> (o el botón Compartir).</Step>
            <Step n={2} icon={<MonitorDown className="size-5" />}>Elige <b>Agregar al Dock</b> y luego <b>Agregar</b>.</Step>
          </ol>
        )}
        {(platform === "android" || platform === "desktop-chromium") && (
          <ol className="grid gap-2">
            <Step n={1} icon={<EllipsisVertical className="size-5" />}>Abre el menú del navegador <b>⋮</b> (arriba a la derecha).</Step>
            <Step n={2} icon={<Download className="size-5" />}>Toca <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>{platform === "desktop-chromium" ? " (en Edge: Aplicaciones › Instalar este sitio como aplicación)" : ""}.</Step>
          </ol>
        )}
        {(platform === "firefox" || platform === "otro") && (
          <p className="rounded-xl bg-secondary/60 p-3 text-[15px]">Este navegador no instala apps web. Abre Mirai en <b>Chrome</b> o <b>Edge</b> (en iPhone, en <b>Safari</b>) y vuelve a tocar <b>Instalar Mirai</b>.</p>
        )}
      </div>
    </ResponsiveDialog>
  )
}

const dismissed = () => { try { return !!localStorage.getItem(INSTALL_DISMISS_KEY) } catch { return true } }

/**
 * Aviso "Instala Mirai" (una sola vez por navegador, descartable). Sale después de unos segundos de uso, nunca encima de
 * una ventana abierta, y no vuelve a salir si la persona lo cierra o ya instaló Mirai.
 */
export function InstallBanner() {
  const { platform, installed, can, install, direct } = useInstall()
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (installed || !can || dismissed()) return
    // En Android/escritorio solo si el navegador ya dijo que se puede instalar; en iPhone, solo en Safari.
    if (!direct && platform !== "ios-safari") return
    const t = setTimeout(() => { if (!document.querySelector("[role=dialog]")) setShow(true) }, 12_000)
    return () => clearTimeout(t)
  }, [installed, can, direct, platform])
  if (!show || installed) return null
  const hide = () => { setShow(false); try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())) } catch { /* sin almacenamiento */ } }
  return (
    <div role="region" aria-label="Instalar Mirai"
      className={cn("install-banner appear fixed z-40 flex items-center gap-3 rounded-2xl bg-popover p-3 pr-2 text-popover-foreground shadow-float ring-1 ring-black/5 dark:ring-white/10",
        "inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-6 md:left-[calc(var(--sidebar-width,16rem)+1.5rem)] md:w-[380px]")}>
      <span className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-[linear-gradient(145deg,#2B3F6E,#1F2B4B_55%,#1D3F2A)]"><IsoIcon k="mirai" size={32} /></span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="text-[15px] leading-5 font-semibold">Instala Mirai en tu {platform === "desktop-chromium" ? "computador" : "celular"}</p>
        <p className="text-[13px] leading-[18px] text-muted-foreground">Se abre como una app, más rápido y con accesos directos.</p>
      </div>
      <Button size="sm" onClick={() => { hide(); void install() }}>Instalar</Button>
      <button type="button" aria-label="Ahora no" onClick={hide} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-hover"><X className="size-4" /></button>
    </div>
  )
}
