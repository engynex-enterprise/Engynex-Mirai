"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Check, Crown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Icon } from "@/components/mirai/icon"
import { PageHeader } from "@/components/mirai/page-header"
import { useApp } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { FEATURES, ahorroAnual, precio, type PremiumFeature } from "@/lib/plans"
import { cn } from "@/lib/utils"

/** Precios vigentes (los edita el administrador en el panel). */
export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data } = await createClient().from("plans").select("*")
      const p = data?.find((x) => x.id === "premium")
      return { mes: p?.precio_mes ?? 14900, anio: p?.precio_anio ?? 149000 }
    },
    staleTime: 10 * 60_000,
  })
}

/** Etiqueta "Premium" (menú y tarjetas). */
export function PremiumBadge({ className }: { className?: string }) {
  return <span className={cn("inline-flex h-5 items-center gap-1 rounded-full bg-[linear-gradient(135deg,#FFD36B,#E08A00)] px-2 text-[11px] font-bold text-white", className)}><Crown className="size-3" />Premium</span>
}

/** Invitación a Premium en lugar de una función paga. */
export function PremiumUpsell({ feature, compact }: { feature: PremiumFeature; compact?: boolean }) {
  const f = FEATURES[feature]
  const { data: p } = usePlans()
  const ahorro = p ? ahorroAnual(p.mes, p.anio) : null
  return (
    <Card className={cn("gap-5 shadow-card ring-0", compact ? "p-5" : "p-6 sm:p-8")} data-testid="premium-upsell">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#FFD36B,#E08A00)] text-white shadow-[0_6px_18px_rgba(224,138,0,.35)]"><Icon name={f.icon} className="size-7" /></span>
        <div className="grid min-w-0 flex-1 gap-1">
          <PremiumBadge className="w-fit" />
          <h2 className="text-xl font-semibold">{f.label} es parte de Mirai Premium</h2>
          <p className="text-muted-foreground">{f.desc}</p>
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {f.beneficios.map((b) => <li key={b} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" />{b}</li>)}
      </ul>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/60 p-4">
        <div className="grid flex-1 gap-0.5">
          <p className="font-semibold">{p ? <>Desde {precio(p.mes)} al mes</> : "Mirai Premium"}</p>
          <p className="text-sm text-muted-foreground">{p && ahorro ? <>O {precio(p.anio)} al año: ahorras {precio(ahorro.pesos)} ({ahorro.meses} meses gratis). </> : null}Incluye todo Premium para toda tu familia, sin anuncios.</p>
        </div>
        <Button asChild><Link href={`/planes?f=${feature}`}><Crown /> Ver planes</Link></Button>
      </div>
    </Card>
  )
}

/** Muestra la sección solo con Premium; en el plan gratis, su encabezado y la invitación a Premium. */
export function PremiumGate({ feature, section, title, children }: { feature: PremiumFeature; section: string; title: string; children: React.ReactNode }) {
  const { plan } = useApp()
  if (plan === "premium") return children
  return (
    <div className="grid gap-6">
      <PageHeader id={section} title={title} noHelp />
      <PremiumUpsell feature={feature} />
    </div>
  )
}
