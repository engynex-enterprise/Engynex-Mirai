"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { ArrowDown, Bell, BookOpen, Check, ChevronLeft, ChevronRight, Copy, Download, EllipsisVertical, MonitorDown, Rocket, Share, SquarePlus, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { toast } from "@/components/mirai/toast"
import { useApp } from "@/components/app/app-context"
import { INSTALL_DISMISS_KEY, INSTALL_SESSION_KEY } from "@/lib/pwa/config"
import { installPlatform, type InstallPlatform } from "@/lib/pwa/platform"
import { whenFree } from "@/lib/when-free"
import { usePwa } from "./store"

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
          <div className="grid min-w-0 gap-0.5"><p className="font-semibold">Mirai</p><p className="text-sm text-muted-foreground">Tu plata organizada · gratis, sin descargar nada de la tienda</p></div>
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

/** ¿Tocó "No ver más este mensaje" en este navegador? (sin almacenamiento, no insistimos). */
const dismissed = () => { try { return !!localStorage.getItem(INSTALL_DISMISS_KEY) } catch { return true } }
/** Persona a la que ya le salió el modal en esta sesión del navegador. */
const sessionSeen = () => { try { return sessionStorage.getItem(INSTALL_SESSION_KEY) } catch { return null } }

const VENTAJAS = [
  { Icon: Rocket, t: "Lo abres de un toque", d: "Queda con su ícono, al lado de tus otras apps, y abre en pantalla completa." },
  { Icon: Bell, t: "Te avisamos antes de que se venza", d: "La fecha límite para pagar tu tarjeta o el arriendo, aunque tengas Mirai cerrado." },
  { Icon: WifiOff, t: "Anota aunque te quedes sin señal", d: "Lo que anotes se guarda y se sube solo cuando vuelve el internet." },
]

/**
 * Modal "Instala Mirai": sale cada vez que la persona entra (una vez por sesión), nunca encima de otra ventana abierta,
 * y solo si este dispositivo puede instalar y Mirai no está instalado. Tres salidas: instalar ahora, instalar después
 * (vuelve a salir la próxima vez que entre) y no ver más este mensaje (queda guardado en este navegador).
 */
export function InstallPrompt() {
  const { user } = useApp()
  const { platform, installed, can, install, direct } = useInstall()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (installed || !can || dismissed() || sessionSeen() === user.id) return
    // En Android/escritorio solo si el navegador ya dijo que se puede instalar; en iPhone, solo en Safari.
    if (!direct && platform !== "ios-safari") return
    // La marca se pone al abrir: si algo lo vuelve a montar antes, no perdemos el aviso.
    return whenFree(() => { try { sessionStorage.setItem(INSTALL_SESSION_KEY, user.id) } catch { /* sin almacenamiento */ } ; setOpen(true) }, 2500)
  }, [installed, can, direct, platform, user.id])
  if (installed) return null
  const nunca = () => { try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())) } catch { /* sin almacenamiento */ } ; setOpen(false) }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
      <DialogContent data-testid="instalar-modal" className="max-h-[92dvh] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-[520px]">
        <div className="grid gap-4 px-6 pt-7 pb-6">
          <div className="grid justify-items-center gap-3 text-center">
            <span className="grid size-16 shrink-0 place-items-center rounded-[18px] bg-[linear-gradient(145deg,#2B3F6E,#1F2B4B_55%,#1D3F2A)] shadow-[0_8px_20px_rgba(31,43,75,.3)]"><IsoIcon k="mirai" size={44} /></span>
            <DialogTitle className="text-[22px] leading-tight font-bold tracking-tight">Instala Mirai en tu {platform === "desktop-chromium" || platform === "mac-safari" ? "computador" : platform?.startsWith("ios") ? "iPhone o iPad" : "celular"}</DialogTitle>
            <DialogDescription className="text-[15px] leading-relaxed">
              Es la misma Mirai, con su ícono en tu pantalla de inicio. Se instala desde aquí, sin descargar nada de una tienda de apps.
            </DialogDescription>
          </div>
          <ul className="grid gap-2">
            {VENTAJAS.map(({ Icon, t, d }) => (
              <li key={t} className="flex items-start gap-3 rounded-xl bg-secondary/50 p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-brand shadow-card"><Icon className="size-5" strokeWidth={1.8} /></span>
                <div className="grid min-w-0 gap-0.5">
                  <p className="text-[15px] leading-5 font-semibold">{t}</p>
                  <p className="text-[13px] leading-[18px] text-muted-foreground">{d}</p>
                </div>
              </li>
            ))}
          </ul>
          {!direct && <p className="rounded-xl bg-secondary/60 p-3 text-center text-[15px] leading-5">Tu {platform?.startsWith("ios") ? "iPhone" : "navegador"} no lo instala solo: al tocar <b>Instalar ahora</b> te mostramos los pasos con dibujos. Toma menos de un minuto.</p>}
          <div className="grid gap-2">
            {/* Con el diálogo del sistema hay que llamarlo en el mismo toque; las instrucciones esperan a que esta ventana cierre (dos Radix cruzados bloquean los clics). */}
            <Button size="lg" className="h-12 w-full text-[16px]" onClick={() => { setOpen(false); if (direct) void install(); else whenFree(() => void install(), 250) }}>Instalar ahora</Button>
            <Button size="lg" variant="outline" className="h-11 w-full" onClick={() => setOpen(false)}>Instalar después</Button>
            <Button variant="ghost" className="h-10 w-full text-[13px] font-normal text-muted-foreground" onClick={nunca}>No ver más este mensaje</Button>
          </div>
          <p className="text-center text-[13px] leading-[18px] text-muted-foreground">Si tocas <b>Instalar después</b>, te lo recordamos la próxima vez que entres.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
