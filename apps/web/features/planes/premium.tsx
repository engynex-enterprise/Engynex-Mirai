"use client"

import Link from "next/link"
import { useQuery } from "@/lib/query"
import { Check, Crown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Icon } from "@/components/mirai/icon"
import { PageHeader } from "@/components/mirai/page-header"
import { useApp } from "@/components/app/app-context"
import { loadPublicPlans } from "./api"
import { FEATURES, ahorroAnual, can, precio, type PremiumFeature } from "@/lib/plans"
import { cn } from "@/lib/utils"

export type PlanRow = { id: string; nombre: string; descripcion: string; precio_mes: number; precio_anio: number; funciones: string[]; anuncios: boolean; limites: { libros?: number; personas?: number; automatizaciones?: number }; destacado: boolean; orden: number; activo: boolean; publico: boolean }

/** Planes visibles en /planes (los edita el administrador en la consola). */
export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const list = await loadPublicPlans()
      const premium = list.find((p) => p.id === "premium")
      return { list, mes: premium?.precio_mes ?? 14900, anio: premium?.precio_anio ?? 149000 }
    },
    staleTime: 10 * 60_000,
  })
}

/** El plan de pago más barato que incluye la función. */
export const cheapestWith = (list: PlanRow[], f: PremiumFeature) => list.filter((p) => p.precio_mes > 0 && p.funciones.includes(f)).sort((a, b) => a.precio_mes - b.precio_mes)[0]

/** Etiqueta "Premium" (menú y tarjetas). */
export function PremiumBadge({ className, label = "Premium" }: { className?: string; label?: string }) {
  return <span className={cn("inline-flex h-5 items-center gap-1 rounded-full bg-[linear-gradient(135deg,#FFD36B,#E08A00)] px-2 text-[11px] font-bold text-white", className)}><Crown className="size-3" />{label}</span>
}

/** Invitación a un plan de pago en lugar de una función que el plan actual no incluye. */
export function PremiumUpsell({ feature, compact }: { feature: PremiumFeature; compact?: boolean }) {
  const f = FEATURES[feature]
  const { data } = usePlans()
  const best = data ? cheapestWith(data.list, feature) : undefined
  const ahorro = best ? ahorroAnual(best.precio_mes, best.precio_anio) : null
  return (
    <Card className={cn("gap-5 shadow-card ring-0", compact ? "p-5" : "p-6 sm:p-8")} data-testid="premium-upsell">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#FFD36B,#E08A00)] text-white shadow-[0_6px_18px_rgba(224,138,0,.35)]"><Icon name={f.icon} className="size-7" /></span>
        <div className="grid min-w-0 flex-1 gap-1">
          <PremiumBadge className="w-fit" label={best?.nombre ?? "Premium"} />
          <h2 className="text-xl font-semibold">{f.label} es parte de Mirai {best?.nombre ?? "Premium"}</h2>
          <p className="text-muted-foreground">{f.desc}</p>
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {f.beneficios.map((b) => <li key={b} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" />{b}</li>)}
      </ul>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/60 p-4">
        <div className="grid flex-1 gap-0.5">
          <p className="font-semibold">{best ? <>Desde {precio(best.precio_mes)} al mes</> : "Mirai Premium"}</p>
          <p className="text-sm text-muted-foreground">{best && ahorro && ahorro.pesos > 0 ? <>O {precio(best.precio_anio)} al año: ahorras {precio(ahorro.pesos)}. </> : null}Para toda tu familia{best && !best.anuncios ? ", sin anuncios" : ""}.</p>
        </div>
        <Button asChild><Link href={`/planes?f=${feature}`}><Crown /> Ver planes</Link></Button>
      </div>
    </Card>
  )
}

/**
 * Muestra la sección solo si el plan del hogar incluye la función; si no, su encabezado y la invitación.
 * `free`: lo que sí sirve en cualquier plan dentro de esa sección (p. ej. traer el respaldo de la v4 en Importar).
 */
export function PremiumGate({ feature, section, title, children, free }: { feature: PremiumFeature; section: string; title: string; children: React.ReactNode; free?: React.ReactNode }) {
  const { plan } = useApp()
  if (can(plan, feature)) return children
  return (
    <div className="grid gap-6">
      <PageHeader id={section} title={title} noHelp />
      <PremiumUpsell feature={feature} />
      {free}
    </div>
  )
}
