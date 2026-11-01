"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import Script from "next/script"
import { useQuery } from "@tanstack/react-query"
import { Crown, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useApp } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { adSeed, pickAd, type AdSlotId } from "@/lib/ads"
import { cn } from "@/lib/utils"

const ADSENSE = process.env.NEXT_PUBLIC_ADSENSE_CLIENT
const ADSENSE_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT
const CONSENT_KEY = "mirai-ads-consent"
const hoyCo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())

// Consentimiento de cookies de publicidad (Ley 1581): "si", "no" o null si aún no ha respondido.
const listeners = new Set<() => void>()
const readConsent = () => { try { return localStorage.getItem(CONSENT_KEY) } catch { return null } }
export function setAdsConsent(v: "si" | "no") { try { localStorage.setItem(CONSENT_KEY, v) } catch {} listeners.forEach((l) => l()) }
export function useAdsConsent() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, readConsent, () => null)
}
export const adsenseEnabled = !!(ADSENSE && ADSENSE_SLOT)

function useAds() {
  return useQuery({
    queryKey: ["ads"],
    queryFn: async () => (await createClient().from("ads").select("id,titulo,texto,imagen,url,cta,anunciante,ubicaciones,activo,desde,hasta,prioridad")).data ?? [],
    staleTime: 10 * 60_000,
  })
}

const track = (ad: string, slot: AdSlotId, kind: "vista" | "clic") => { void createClient().rpc("ad_track", { p_ad: ad, p_slot: slot, p_kind: kind }) }

function Label() {
  return <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Publicidad</span>
}

/** Unidad de Google AdSense (solo con consentimiento). */
function AdSenseUnit() {
  const ref = useRef<HTMLModElement>(null)
  useEffect(() => {
    if (!ref.current || ref.current.dataset.done) return
    ref.current.dataset.done = "1"
    try { ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({}) } catch {}
  }, [])
  return (
    <>
      <Script id="adsbygoogle" strategy="afterInteractive" crossOrigin="anonymous" src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}`} />
      <ins ref={ref} className="adsbygoogle block min-h-24" style={{ display: "block" }} data-ad-client={ADSENSE} data-ad-slot={ADSENSE_SLOT} data-ad-format="auto" data-full-width-responsive="true" />
    </>
  )
}

/**
 * Espacio de anuncio del plan gratis: anuncio propio vigente → AdSense (si hay consentimiento) → invitación a Premium.
 * Con Premium no se muestra nada.
 */
export function AdSlot({ slot, className }: { slot: AdSlotId; className?: string }) {
  const { plan, user } = useApp()
  const { data: ads } = useAds()
  const consent = useAdsConsent()
  const seen = useRef(false)
  const box = useRef<HTMLDivElement>(null)
  const [hoy] = useState(hoyCo)
  const ad = !plan.ads || !ads ? null : pickAd(ads, slot, hoy, adSeed(user.id, hoy))
  useEffect(() => {
    if (!ad || !box.current || seen.current) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !seen.current) { seen.current = true; track(ad.id, slot, "vista"); io.disconnect() } }, { threshold: 0.5 })
    io.observe(box.current)
    return () => io.disconnect()
  }, [ad, slot])
  if (!plan.ads || !ads) return null

  if (ad) return (
    <Card ref={box} className={cn("gap-3 p-4 shadow-card ring-0", className)} data-testid={`ad-${slot}`}>
      <div className="flex items-center justify-between"><Label />{ad.anunciante && <span className="truncate text-xs text-muted-foreground">{ad.anunciante}</span>}</div>
      <a href={ad.url} target="_blank" rel="sponsored noopener noreferrer" onClick={() => track(ad.id, slot, "clic")} className="flex items-center gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {ad.imagen && <img src={ad.imagen} alt="" className="size-20 shrink-0 rounded-lg object-cover sm:size-24" />}
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="font-semibold">{ad.titulo}</span>
          {ad.texto && <span className="text-sm text-muted-foreground">{ad.texto}</span>}
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-link">{ad.cta} <ExternalLink className="size-3.5" /></span>
        </span>
      </a>
    </Card>
  )

  if (adsenseEnabled && consent === "si") return <Card className={cn("gap-2 p-4 shadow-card ring-0", className)}><Label /><AdSenseUnit /></Card>

  return (
    <Card className={cn("flex-row flex-wrap items-center gap-3 p-4 shadow-card ring-0", className)} data-testid={`ad-${slot}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#FFD36B,#E08A00)] text-white"><Crown className="size-5" /></span>
      <div className="grid min-w-0 flex-1"><p className="font-semibold">Mirai sin anuncios y con IA</p><p className="text-sm text-muted-foreground">Premium agrega el consejero, la automatización con tu banco y los impuestos.</p></div>
      <Button size="sm" variant="outline" asChild><Link href="/planes">Ver Premium</Link></Button>
    </Card>
  )
}

/** Aviso de cookies de publicidad: solo en el plan gratis y si AdSense está configurado. */
export function AdsConsentBanner() {
  const { plan } = useApp()
  const consent = useAdsConsent()
  if (!adsenseEnabled || !plan.ads || consent) return null
  return (
    <div role="dialog" aria-label="Cookies de publicidad" className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-xl rounded-2xl bg-popover p-4 shadow-xl ring-1 ring-border md:bottom-4">
      <p className="text-sm"><b>¿Aceptas anuncios personalizados?</b> En el plan gratis mostramos anuncios de Google, que usa cookies para elegirlos. Si no aceptas, verás solo anuncios de Mirai y sus aliados, sin cookies de terceros. <Link href="/legal/privacidad" className="text-link underline">Más información</Link></p>
      <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setAdsConsent("no")}>No, gracias</Button><Button size="sm" onClick={() => setAdsConsent("si")}>Aceptar</Button></div>
    </div>
  )
}
