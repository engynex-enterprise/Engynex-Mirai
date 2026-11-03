import Link from "next/link"
import { ArrowRight, Check, Crown, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { supabaseServer } from "@/utils/supabase/server"
import { FEATURES, FEATURE_LIST, FREE_PLAN, GRATIS_INCLUYE, ahorroAnual, precio, type PlanLimits } from "@/lib/plans"
import { SITE_URL } from "./content"

type PlanPublico = { id: string; nombre: string; precio_mes: number; precio_anio: number; anuncios: boolean; limites: PlanLimits }

/** Respaldo si la base no responde a tiempo: los mismos valores que usa la app (usePlans y FREE_PLAN). */
const RESPALDO = { mes: 14900, anio: 149000, gratis: FREE_PLAN.limites, premiumAds: false }

/** Planes públicos desde la tabla plans, sin bloquear la página si la base tarda. */
async function planesPublicos() {
  try {
    const sb = await supabaseServer()
    const consulta = sb.from("plans").select("id,nombre,precio_mes,precio_anio,anuncios,limites,publico,activo").then(({ data }) => data)
    const data = await Promise.race([consulta, new Promise<null>((r) => setTimeout(() => r(null), 2500))])
    const list = ((data ?? []) as (PlanPublico & { publico: boolean; activo: boolean })[]).filter((p) => p.publico && p.activo)
    const premium = list.find((p) => p.id === "premium")
    const gratis = list.find((p) => p.id === "gratis")
    return {
      mes: premium?.precio_mes ?? RESPALDO.mes,
      anio: premium?.precio_anio ?? RESPALDO.anio,
      gratis: { ...RESPALDO.gratis, ...(gratis?.limites ?? {}) },
      premiumAds: premium?.anuncios ?? RESPALDO.premiumAds,
    }
  } catch {
    return RESPALDO
  }
}

const limitesTexto = (l: PlanLimits) =>
  [
    l.libros != null && `${l.libros} libro de cuentas`,
    l.personas != null && `hasta ${l.personas} personas en el hogar`,
    l.automatizaciones != null && `${l.automatizaciones} automatizaciones activas`,
  ].filter(Boolean).join(", ")

export function PreciosSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-2" aria-hidden>
      <Skeleton className="h-[460px] rounded-2xl" />
      <Skeleton className="h-[460px] rounded-2xl" />
    </div>
  )
}

/** Gratis vs Premium con los precios reales de la tabla plans. */
export async function Precios() {
  const p = await planesPublicos()
  const ahorro = ahorroAnual(p.mes, p.anio)
  const lim = limitesTexto(p.gratis)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Mirai",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web, Android, iOS (aplicación web instalable)",
    inLanguage: "es-CO",
    url: SITE_URL,
    description: "Finanzas personales y familiares para Colombia: quincena, gastos, deudas, metas e impuestos en palabras simples.",
    offers: [
      { "@type": "Offer", name: "Gratis", price: 0, priceCurrency: "COP" },
      { "@type": "Offer", name: "Premium mensual", price: p.mes, priceCurrency: "COP" },
      { "@type": "Offer", name: "Premium anual", price: p.anio, priceCurrency: "COP" },
    ],
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2">
        <article className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-card backdrop-blur sm:p-8">
          <header className="grid gap-1">
            <h3 className="text-xl font-semibold">Gratis</h3>
            <p className="text-sm text-muted-foreground">Para ordenar tu plata desde hoy.</p>
          </header>
          <p className="text-4xl font-bold tracking-tight">$0 <span className="text-base font-normal text-muted-foreground">para siempre</span></p>
          <ul className="grid gap-2.5">
            {GRATIS_INCLUYE.map((t) => (
              <li key={t} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{t}</li>
            ))}
            <li className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />Chat y Consejero con los cálculos de Mirai</li>
          </ul>
          {lim && <p className="flex items-start gap-2 rounded-xl bg-muted/70 p-3 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />Incluye {lim}. Muestra anuncios.</p>}
          <Button size="lg" variant="outline" className="mt-auto" asChild><Link href="/registro">Crear cuenta gratis</Link></Button>
        </article>

        <article className="relative flex flex-col gap-5 rounded-2xl border-2 border-amber-400 bg-card p-6 shadow-float backdrop-blur sm:p-8">
          <span className="absolute -top-3 left-6 inline-flex h-6 items-center gap-1 rounded-full bg-[linear-gradient(135deg,#FFD36B,#E08A00)] px-3 text-xs font-bold text-white"><Crown className="size-3.5" aria-hidden />Para todo tu hogar</span>
          <header className="grid gap-1">
            <h3 className="flex items-center gap-2 text-xl font-semibold"><Crown className="size-5 text-amber-500" aria-hidden /> Premium</h3>
            <p className="text-sm text-muted-foreground">Para que Mirai trabaje por ti.</p>
          </header>
          <div className="grid gap-1">
            <p className="text-4xl font-bold tracking-tight">{precio(p.mes)} <span className="text-base font-normal text-muted-foreground">al mes</span></p>
            <p className="text-sm text-muted-foreground">
              O {precio(p.anio)} al año{ahorro.pesos > 0 && <> (ahorras {precio(ahorro.pesos)})</>}.
            </p>
          </div>
          <p className="text-sm font-medium">Todo lo de Gratis, y además:</p>
          <ul className="grid gap-3">
            {FEATURE_LIST.map((k) => (
              <li key={k} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
                <span><b>{FEATURES[k].label}.</b> {FEATURES[k].beneficios.join(" · ")}.</span>
              </li>
            ))}
            {!p.premiumAds && <li className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden /><b>Sin anuncios.</b></li>}
          </ul>
          <Button size="lg" className="mt-auto h-auto min-h-10 py-2.5 whitespace-normal" asChild><Link href="/registro">Empieza gratis y pásate cuando quieras <ArrowRight aria-hidden /></Link></Button>
          <p className="text-center text-xs text-muted-foreground">Tarjeta, Nequi, PSE o Bancolombia. Cancelas cuando quieras.</p>
        </article>
      </div>
    </>
  )
}
