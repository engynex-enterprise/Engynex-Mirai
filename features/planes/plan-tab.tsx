"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Crown, Receipt } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusPill } from "@/components/mirai/status-pill"
import { useApp } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { fmtDate } from "@/lib/format"
import { isFull, precio } from "@/lib/plans"
import { SettingRow, SettingSection } from "@/features/settings/ui"
import { cancelRenewal } from "./actions"
import { PremiumBadge } from "./premium"

const PROV = { mercadopago: "Mercado Pago (tarjeta)", wompi: "Wompi (Nequi, PSE, Bancolombia)", manual: "Asignado por Mirai" } as const
const PAY = { aprobado: ["pagado", "Aprobado"], pendiente: ["porVencer", "Pendiente"], rechazado: ["vencido", "Rechazado"], reembolsado: ["gray", "Devuelto"], anulado: ["gray", "Anulado"] } as const

/** Ajustes › Mi plan: plan actual, vencimiento, renovación y pagos. */
export function PlanTab() {
  const { household, plan, isAdmin } = useApp()
  const qc = useQueryClient()
  const params = useSearchParams()
  const sb = createClient()
  const { data: sub, isPending } = useQuery({
    queryKey: ["plan-sub", household.id],
    queryFn: async () => (await sb.rpc("household_subscription", { h: household.id })).data?.[0] ?? null,
  })
  const { data: pays } = useQuery({
    queryKey: ["plan-pays", household.id],
    enabled: household.role === "owner",
    queryFn: async () => (await sb.from("plan_payments").select("id,proveedor,referencia,periodo,monto,estado,metodo,paid_at,created_at,factura_ref,plan").eq("household_id", household.id).neq("estado", "pendiente").order("created_at", { ascending: false }).limit(50)).data ?? [],
  })
  useEffect(() => {
    if (params.get("pago")) toast("Estamos confirmando tu pago", { description: "Puede tardar unos minutos. Te avisamos cuando quede listo." })
  }, [params])
  const cancel = async () => {
    const r = await cancelRenewal()
    toast[r.ok ? "success" : "error"](r.msg)
    qc.invalidateQueries({ queryKey: ["plan-sub", household.id] })
  }
  if (isPending) return <Skeleton className="h-60" />
  return (
    <div className="grid gap-6">
      <SettingSection icon="crown" title="Tu plan" desc="El plan es del hogar: lo comparten todos sus integrantes.">
        <SettingRow title={`Mirai ${plan.nombre}`} desc={plan.id !== "gratis"
          ? isAdmin && !sub ? "Incluido por ser administrador de Mirai." : sub?.vence_at ? `${sub.estado === "cancelada" ? "No se renueva. Termina" : sub.proveedor === "mercadopago" && sub.estado === "activa" ? "Se renueva" : "Vence"} el ${fmtDate(sub.vence_at.slice(0, 10), { year: true })}.` : "Activo."
          : `Lo básico${plan.ads ? ", con anuncios" : ""}${plan.limites.libros ? `, ${plan.limites.libros} libro` : ""}${plan.limites.personas ? ` y hasta ${plan.limites.personas} personas` : ""}.`}>
          {isFull(plan) ? <PremiumBadge label={plan.nombre} /> : <Button asChild><Link href="/planes"><Crown /> {plan.id === "gratis" ? "Pásate a Premium" : "Ver planes"}</Link></Button>}
        </SettingRow>
        {sub && <SettingRow title="Cómo pagas" desc={`${PROV[sub.proveedor as keyof typeof PROV] ?? sub.proveedor} · ${sub.periodo === "anio" ? "anual" : "mensual"}`}>{null}</SettingRow>}
        {sub?.proveedor === "mercadopago" && sub.estado === "activa" && household.role === "owner" && (
          <SettingRow title="Renovación automática" desc="Si la cancelas, no te cobramos más y sigues con Premium hasta el vencimiento.">
            <Button variant="outline" className="text-danger" onClick={cancel}>Cancelar renovación</Button>
          </SettingRow>
        )}
        {plan.id !== "gratis" && sub && sub.proveedor !== "mercadopago" && household.role === "owner" && (
          <SettingRow title="Extender tu plan" desc="Paga otro mes o un año antes de que venza: los días se suman.">
            <Button variant="outline" asChild><Link href="/planes">Ver opciones</Link></Button>
          </SettingRow>
        )}
      </SettingSection>
      {household.role === "owner" && (
        <SettingSection icon="receipt" title="Pagos" desc="Historial de pagos de Mirai Premium.">
          {!pays?.length ? <p className="py-3 text-sm text-muted-foreground">Aún no hay pagos.</p> : (
            <ul className="grid">
              {pays.map((x) => {
                const st = PAY[x.estado as keyof typeof PAY] ?? PAY.pendiente
                return (
                  <li key={x.id} className="flex flex-wrap items-center gap-3 border-b py-3 last:border-0">
                    <Receipt className="size-5 text-muted-foreground" />
                    <div className="grid min-w-0 flex-1"><p className="text-sm font-medium">Plan {x.plan ?? "premium"} {x.periodo === "anio" ? "anual" : "mensual"} · {precio(x.monto)}</p><p className="text-xs text-muted-foreground">{fmtDate((x.paid_at ?? x.created_at).slice(0, 10), { year: true })} · {PROV[x.proveedor as keyof typeof PROV] ?? x.proveedor}{x.metodo ? ` · ${x.metodo}` : ""}</p></div>
                    <StatusPill tone={st[0]}>{st[1]}</StatusPill>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="pt-2 text-xs text-muted-foreground">¿Necesitas la factura o una devolución? Escríbenos desde <Link className="text-link underline" href="/opiniones">Tu opinión</Link>.</p>
        </SettingSection>
      )}
    </div>
  )
}
