"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import Script from "next/script"
import { useQuery } from "@/lib/query"
import { Crown, ExternalLink, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useApp, useBookId } from "@/components/app/app-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { adSeed, goesToAdsense, type AdSlotId } from "@/lib/ads"
import { cn } from "@/lib/utils"

const ENV_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT
const ENV_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT
const CONSENT_KEY = "mirai-ads-consent"
const PREVIEW_KEY = "mirai-ads-preview"
const hoyCo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
const ls = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} } }
const ss = { get: (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch {} } }

// ── Preferencias locales (consentimiento de cookies y vista previa del administrador) ─────────────────────────────
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
const sub = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }
export function setAdsConsent(v: "si" | "no") { ls.set(CONSENT_KEY, v); notify() }
export function useAdsConsent() { return useSyncExternalStore(sub, () => ls.get(CONSENT_KEY), () => null) }
/** Vista previa para administradores: ver los anuncios aunque tu hogar tenga un plan sin anuncios. */
export function setAdsPreview(on: boolean) { ls.set(PREVIEW_KEY, on ? "1" : "0"); notify() }
export function useAdsPreview() { return useSyncExternalStore(sub, () => ls.get(PREVIEW_KEY) === "1", () => false) }

// El anuncio de cada espacio lo elige la API (GET /v1/books/:b/ads/eligible, misma segmentación, frecuencia y sorteo
// de @mirai/domain/ads), las vistas/clics/cierres van a POST /v1/ads/events y AdSense sale de GET /v1/public/adsense.
type AdsenseRow = { modo: string; planes: string[] | null; config: unknown } | null

async function loadAdsense(): Promise<AdsenseRow> {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  const a = unwrap(await browserApi().ads.adsense())
  return { modo: a.activo ? "opcional" : "apagada", planes: a.planes, config: { client: a.client ?? undefined, slot: a.slot ?? undefined } }
}

/** AdSense de la consola (Integraciones globales › Google AdSense) o, como respaldo, de las variables de entorno. */
export function useAdsense(planId?: string) {
  const { data } = useQuery({
    queryKey: ["adsense-config"],
    queryFn: loadAdsense,
    staleTime: 10 * 60_000,
  })
  const cfg = (data?.config ?? {}) as { client?: string; slot?: string }
  if (data && data.modo !== "apagada" && cfg.client && cfg.slot && (!planId || !data.planes?.length || data.planes.includes(planId))) return { client: cfg.client, slot: cfg.slot, source: "consola" as const }
  if (ENV_CLIENT && ENV_SLOT) return { client: ENV_CLIENT, slot: ENV_SLOT, source: "vercel" as const }
  return null
}

export type Ad = { id: string; titulo: string; texto: string; imagen: string | null; url: string; cta: string; anunciante: string; ubicaciones: string[]; activo: boolean; desde: string | null; hasta: string | null; prioridad: number; campaign_id: string | null; formato: string; media: { video?: string; poster?: string; color?: string; items?: { imagen?: string; titulo: string; url?: string }[] } }
type Settings = { anuncios_adsense_pct: number; anuncios_accion_cada: number; anuncios_modal_horas: number; anuncios_ticker: boolean }
type AdsData = { settings?: Settings | null; ready: boolean }

/** Por la API: el anuncio elegido para el espacio (y, en la cinta, la lista), con los ajustes de anuncios. */
function useEligible(slot: AdSlotId, salt = "") {
  // Solo se pide si se muestran anuncios (plan con anuncios o vista previa de un administrador).
  const show = useShowAds()
  const bookId = useBookId()
  const mobile = useIsMobile()
  const [hoy] = useState(hoyCo)
  return useQuery({
    queryKey: ["ads-eligible", bookId, slot, salt, mobile, hoy], enabled: show, staleTime: 60_000,
    queryFn: async () => {
      const { browserApi, unwrap } = await import("@/lib/api/client")
      return unwrap(await browserApi().ads.eligible({ params: { bookId }, query: { slot, device: mobile ? "movil" : "escritorio", hoy, ...(salt ? { salt } : {}) } }))
    },
  })
}

/** ¿Se muestran anuncios? Solo en planes con anuncios (o en vista previa de un administrador). */
function useShowAds() {
  const { plan, isAdmin } = useApp()
  const preview = useAdsPreview()
  return plan.ads || (isAdmin && preview)
}

/** Elegir el anuncio de un espacio para esta persona (segmentación, frecuencia y prioridad). */
function usePick(slot: AdSlotId, salt = ""): { ad: Ad | null; data: AdsData } {
  const e = useEligible(slot, salt)
  return { ad: (e.data?.ad as Ad | null | undefined) ?? null, data: { settings: e.data?.settings ?? null, ready: !!e.data } }
}

export function useTrack() {
  return (ad: string, slot: AdSlotId, kind: "vista" | "clic" | "cierre") => {
    // Si falla, no interrumpe nada (es solo una métrica).
    void import("@/lib/api/client").then(({ browserApi }) => browserApi().ads.track({ body: { ad, slot, kind } })).catch(() => {})
  }
}

/** Cuenta la vista cuando el anuncio se ve de verdad (al menos la mitad en pantalla). */
function useViewTracker(ad: Ad | null, slot: AdSlotId) {
  const box = useRef<HTMLDivElement>(null)
  const seen = useRef<string | null>(null)
  const track = useTrack()
  useEffect(() => {
    if (!ad || !box.current || seen.current === ad.id) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && seen.current !== ad.id) { seen.current = ad.id; track(ad.id, slot, "vista"); io.disconnect() } }, { threshold: 0.5 })
    io.observe(box.current)
    return () => io.disconnect()
  }, [ad, slot]) // eslint-disable-line react-hooks/exhaustive-deps
  return box
}

const Label = ({ className }: { className?: string }) => <span className={cn("text-[11px] font-semibold tracking-wide text-muted-foreground uppercase", className)}>Publicidad</span>
const isInternal = (u: string) => u.startsWith("/")
function AdLink({ ad, slot, className, children }: { ad: Ad; slot: AdSlotId; className?: string; children: React.ReactNode }) {
  const track = useTrack()
  return isInternal(ad.url)
    ? <Link href={ad.url} onClick={() => track(ad.id, slot, "clic")} className={className}>{children}</Link>
    : <a href={ad.url} target="_blank" rel="sponsored noopener noreferrer" onClick={() => track(ad.id, slot, "clic")} className={className}>{children}</a>
}

/** El creativo de un anuncio según su formato (imagen, carrusel, video, texto o ventana). */
export function AdCreative({ ad, slot, large }: { ad: Ad; slot: AdSlotId; large?: boolean }) {
  const track = useTrack()
  if (ad.formato === "carrusel" && ad.media.items?.length) return (
    <div className="grid gap-2">
      <p className="font-semibold">{ad.titulo}</p>
      {ad.texto && <p className="text-sm text-muted-foreground">{ad.texto}</p>}
      <div className="no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {ad.media.items.map((it, i) => (
          <a key={i} href={it.url || ad.url} target={isInternal(it.url || ad.url) ? undefined : "_blank"} rel="sponsored noopener noreferrer" onClick={() => track(ad.id, slot, "clic")} className="grid w-40 shrink-0 snap-start overflow-hidden rounded-lg bg-secondary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {it.imagen ? <img src={it.imagen} alt="" className="aspect-square w-full object-cover" /> : <span className="aspect-square w-full" style={{ background: ad.media.color ?? "#E7F3FF" }} />}
            <span className="truncate px-2 py-1.5 text-sm font-medium">{it.titulo}</span>
          </a>
        ))}
      </div>
      <AdLink ad={ad} slot={slot} className="w-fit text-sm font-semibold text-link">{ad.cta} →</AdLink>
    </div>
  )
  if (ad.formato === "video" && ad.media.video) return (
    <div className="grid gap-2">
      <video src={ad.media.video} poster={ad.media.poster} controls muted playsInline preload="metadata" className="aspect-video w-full rounded-lg bg-black" />
      <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{ad.titulo}</p>{ad.texto && <p className="truncate text-sm text-muted-foreground">{ad.texto}</p>}</div><Button size="sm" asChild><AdLink ad={ad} slot={slot}>{ad.cta}</AdLink></Button></div>
    </div>
  )
  if (ad.formato === "texto") return (
    <AdLink ad={ad} slot={slot} className="flex items-center justify-between gap-3 rounded-lg p-1 outline-none">
      <span className="grid min-w-0"><span className="font-semibold">{ad.titulo}</span>{ad.texto && <span className="text-sm text-muted-foreground">{ad.texto}</span>}</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-link">{ad.cta} <ExternalLink className="size-3.5" /></span>
    </AdLink>
  )
  return (
    <AdLink ad={ad} slot={slot} className={cn("rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring", large ? "grid gap-3" : "flex items-center gap-4")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {ad.imagen && <img src={ad.imagen} alt="" className={large ? "aspect-[16/9] w-full rounded-lg object-cover" : "size-20 shrink-0 rounded-lg object-cover sm:size-24"} />}
      <span className="grid min-w-0 flex-1 gap-1">
        <span className={cn("font-semibold", large && "text-lg")}>{ad.titulo}</span>
        {ad.texto && <span className="text-sm text-muted-foreground">{ad.texto}</span>}
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-link">{ad.cta} <ExternalLink className="size-3.5" /></span>
      </span>
    </AdLink>
  )
}

/** Unidad de Google AdSense (solo con consentimiento). */
function AdSenseUnit({ client, slot }: { client: string; slot: string }) {
  const ref = useRef<HTMLModElement>(null)
  useEffect(() => {
    if (!ref.current || ref.current.dataset.done) return
    ref.current.dataset.done = "1"
    try { ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({}) } catch {}
  }, [])
  return (
    <>
      <Script id="adsbygoogle" strategy="afterInteractive" crossOrigin="anonymous" src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`} />
      <ins ref={ref} className="adsbygoogle block min-h-24" style={{ display: "block" }} data-ad-client={client} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </>
  )
}

function HouseAd({ className, slot }: { className?: string; slot: string }) {
  return (
    <Card className={cn("flex-row flex-wrap items-center gap-3 p-4 shadow-card ring-0", className)} data-testid={`ad-${slot}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#FFD36B,#E08A00)] text-white"><Crown className="size-5" /></span>
      <div className="grid min-w-0 flex-1"><p className="font-semibold">Mirai sin anuncios y con IA</p><p className="text-sm text-muted-foreground">Premium agrega el consejero, la automatización con tu banco y los impuestos.</p></div>
      <Button size="sm" variant="outline" asChild><Link href="/planes">Ver Premium</Link></Button>
    </Card>
  )
}

/**
 * Espacio de anuncio en línea (feed de Inicio, junto al consejero, listas y reportes). Mezcla anuncios propios con
 * AdSense según el porcentaje configurado; sin anuncio disponible, invita a Premium. Con un plan sin anuncios no muestra nada.
 */
export function AdSlot({ slot, className }: { slot: Exclude<AdSlotId, "historia" | "ticker" | "modal" | "accion">; className?: string }) {
  const { user, plan } = useApp()
  const show = useShowAds()
  const consent = useAdsConsent()
  const adsense = useAdsense(plan.id)
  const { ad, data } = usePick(slot)
  const box = useViewTracker(show ? ad : null, slot)
  if (!show || !data.ready) return null
  const toGoogle = adsense && consent === "si" && (!ad || goesToAdsense(adSeed(user.id + slot, hoyCo()), data.settings?.anuncios_adsense_pct ?? 30))
  if (toGoogle) return <Card className={cn("gap-2 p-4 shadow-card ring-0", className)}><Label /><AdSenseUnit client={adsense.client} slot={adsense.slot} /></Card>
  if (!ad) return slot === "consejero" ? null : <HouseAd className={className} slot={slot} />
  return (
    <Card ref={box} className={cn("gap-3 p-4 shadow-card ring-0", className)} data-testid={`ad-${slot}`}>
      <div className="flex items-center justify-between"><Label />{ad.anunciante && <span className="truncate text-xs text-muted-foreground">{ad.anunciante}</span>}</div>
      <AdCreative ad={ad} slot={slot} />
    </Card>
  )
}

/** Anuncio en formato historia, entre las tarjetas de arriba de Inicio. */
export function StoryAd() {
  const show = useShowAds()
  const { ad } = usePick("historia")
  const box = useViewTracker(show ? ad : null, "historia")
  if (!show || !ad) return null
  return (
    <div ref={box} className="shrink-0 snap-start" data-testid="ad-historia">
      <AdLink ad={ad} slot="historia" className="press lift relative flex h-48 w-36 flex-col justify-between overflow-hidden rounded-xl p-3 text-white shadow-card sm:h-52 sm:w-40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {ad.imagen ? <img src={ad.imagen} alt="" className="absolute inset-0 size-full object-cover" /> : <span className="absolute inset-0" style={{ background: ad.media.color ?? "linear-gradient(160deg,#1F2B4B,#3F7A1E)" }} />}
        <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.35),transparent_40%,rgba(0,0,0,.65))]" />
        <span className="relative w-fit rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold tracking-wide text-black uppercase">Publicidad</span>
        <span className="relative grid gap-1">
          <span className="text-[15px] leading-tight font-extrabold drop-shadow">{ad.titulo}</span>
          <span className="w-fit rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-black">{ad.cta}</span>
        </span>
      </AdLink>
    </div>
  )
}

/** Texto en movimiento fijo arriba (anuncios de texto con la ubicación "Texto en movimiento"). */
export function AdTicker() {
  const show = useShowAds()
  const e = useEligible("ticker")
  const d = { settings: e.data?.settings ?? null }
  const track = useTrack()
  const [closed, setClosed] = useState(() => ss.get("mirai-ticker-off") === "1")
  const apiList = e.data?.lista as Ad[] | undefined
  const list = useMemo(() => apiList ?? [], [apiList])
  const sent = useRef(false)
  useEffect(() => { if (!show || closed || !list.length || sent.current) return; sent.current = true; list.forEach((a) => track(a.id, "ticker", "vista")) }, [show, closed, list]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!show || closed || !list.length || d.settings?.anuncios_ticker === false) return null
  const items = [...list, ...list]
  return (
    <div className="sticky top-0 z-30 -mx-3 mb-3 flex items-center gap-2 overflow-hidden border-b bg-navy px-3 py-1.5 text-[13px] text-white sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" role="region" aria-label="Publicidad" data-testid="ad-ticker">
      <span className="shrink-0 rounded bg-lime px-1.5 py-0.5 text-[10px] font-bold text-navy uppercase">Publicidad</span>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div className="flex w-max gap-10 whitespace-nowrap motion-safe:animate-[mirai-ticker_28s_linear_infinite] hover:[animation-play-state:paused]">
          {items.map((a, i) => <AdLink key={`${a.id}-${i}`} ad={a} slot="ticker" className="font-medium hover:underline"><b>{a.titulo}</b>{a.texto ? ` · ${a.texto}` : ""} <span className="text-lime">{a.cta} →</span></AdLink>)}
        </div>
      </div>
      <button type="button" aria-label="Cerrar la barra de publicidad" className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-white/15" onClick={() => { setClosed(true); ss.set("mirai-ticker-off", "1"); list.forEach((a) => track(a.id, "ticker", "cierre")) }}><X className="size-4" /></button>
    </div>
  )
}

/**
 * Abre una ventana de anuncio cuando no hay otra ventana abierta (dos ventanas cruzadas bloquean los clics).
 * Reintenta unos segundos; devuelve la función para cancelar.
 */
function whenFree(open: () => void, delay: number) {
  let t: ReturnType<typeof setTimeout>
  let tries = 0
  const tick = () => {
    const busy = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-vaul-drawer][data-state="open"]') || document.body.style.pointerEvents === "none"
    if (busy) { if (tries++ < 40) t = setTimeout(tick, 300); return }
    open()
  }
  t = setTimeout(tick, delay)
  return () => clearTimeout(t)
}

function AdDialog({ ad, slot, open, onClose, adsense }: { ad: Ad | null; slot: AdSlotId; open: boolean; onClose: () => void; adsense?: { client: string; slot: string } | null }) {
  const track = useTrack()
  const shown = useRef(false)
  useEffect(() => { if (open && ad && !shown.current) { shown.current = true; track(ad.id, slot, "vista") } }, [open, ad]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { if (ad) track(ad.id, slot, "cierre"); onClose() } }}>
      <DialogContent className="max-w-lg gap-3 p-5" data-testid={`ad-${slot}`}>
        <div className="flex items-center justify-between pr-8"><Label />{ad?.anunciante && <span className="text-xs text-muted-foreground">{ad.anunciante}</span>}</div>
        <DialogTitle className="sr-only">{ad?.titulo ?? "Publicidad"}</DialogTitle>
        <DialogDescription className="sr-only">Anuncio</DialogDescription>
        {ad ? <AdCreative ad={ad} slot={slot} large /> : adsense ? <AdSenseUnit client={adsense.client} slot={adsense.slot} /> : null}
        <Button variant="ghost" className="w-fit justify-self-center text-muted-foreground" onClick={() => { if (ad) track(ad.id, slot, "cierre"); onClose() }}>Cerrar</Button>
      </DialogContent>
    </Dialog>
  )
}

/** Ventana de anuncio al iniciar sesión (una vez por sesión y como máximo cada N horas). */
export function AdModal() {
  const show = useShowAds()
  const { ad, data } = usePick("modal")
  const [open, setOpen] = useState(false)
  const horas = data.settings?.anuncios_modal_horas
  useEffect(() => {
    if (!show || !ad?.id || !horas || ss.get("mirai-ad-modal") === "1") return
    if (Date.now() - +(ls.get("mirai-ad-modal-at") ?? 0) < horas * 3_600_000) return
    // La marca se pone al abrir (si los datos se refrescan antes, el temporizador se reinicia sin perder la ventana).
    return whenFree(() => { ss.set("mirai-ad-modal", "1"); ls.set("mirai-ad-modal-at", String(Date.now())); setOpen(true) }, 1500)
  }, [show, ad?.id, horas])
  if (!show) return null
  return <AdDialog ad={ad} slot="modal" open={open} onClose={() => setOpen(false)} />
}

/** Anuncio después de registrar algo (cada N acciones, configurable en la consola). */
export function AfterActionAd() {
  const { plan } = useApp()
  const show = useShowAds()
  const consent = useAdsConsent()
  const adsense = useAdsense(plan.id)
  const [salt, setSalt] = useState("0")
  const { ad, data } = usePick("accion", salt)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => {
      if (!show || !data.settings) return
      const n = +(ss.get("mirai-acciones") ?? 0) + 1
      ss.set("mirai-acciones", String(n))
      if (n % Math.max(1, data.settings.anuncios_accion_cada) !== 0) return
      setSalt(String(n))
      whenFree(() => setOpen(true), 600)
    }
    addEventListener("mirai:accion", on)
    return () => removeEventListener("mirai:accion", on)
  }, [show, data.settings])
  if (!show || (!ad && !(adsense && consent === "si"))) return null
  return <AdDialog ad={ad} slot="accion" open={open} onClose={() => setOpen(false)} adsense={adsense && consent === "si" ? adsense : null} />
}

/** Aviso de cookies de publicidad: solo con anuncios y si AdSense está configurado. */
export function AdsConsentBanner() {
  const { plan } = useApp()
  const consent = useAdsConsent()
  const adsense = useAdsense(plan.id)
  const show = useShowAds()
  if (!adsense || !show || consent) return null
  return (
    <div role="dialog" aria-label="Cookies de publicidad" className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-xl rounded-2xl bg-popover p-4 shadow-xl ring-1 ring-border md:bottom-4">
      <p className="text-sm"><b>¿Aceptas anuncios personalizados?</b> En el plan gratis mostramos anuncios de Google, que usa cookies para elegirlos. Si no aceptas, verás solo anuncios de Mirai y sus aliados, sin cookies de terceros. <Link href="/legal/privacidad" className="text-link underline">Más información</Link></p>
      <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setAdsConsent("no")}>No, gracias</Button><Button size="sm" onClick={() => setAdsConsent("si")}>Aceptar</Button></div>
    </div>
  )
}
