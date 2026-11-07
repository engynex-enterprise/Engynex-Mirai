"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { Crown, Receipt } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { SubmitButton } from "@/components/mirai/submit-button"
import { Tip } from "@/components/mirai/tip"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusPill } from "@/components/mirai/status-pill"
import { useApp } from "@/components/app/app-context"
import { fmtDate } from "@/lib/format"
import { isFull, precio } from "@/lib/plans"
import { SettingRow, SettingSection } from "@/features/settings/ui"
import { cancelRenewal, loadHouseholdPayments, loadHouseholdSub, paysRenewal } from "./api"
import { PremiumBadge } from "./premium"

const PROV = { mercadopago: "Mercado Pago (tarjeta)", wompi: "Wompi (Nequi, PSE, Bancolombia)", manual: "Asignado por Mirai" } as const
const PAY = { aprobado: ["pagado", "Aprobado"], pendiente: ["porVencer", "Pendiente"], rechazado: ["vencido", "Rechazado"], reembolsado: ["gray", "Devuelto"], anulado: ["gray", "Anulado"] } as const

/** Ajustes › Mi plan: plan actual, vencimiento, renovación y pagos. */
export function PlanTab() {
  const { household, plan, isAdmin } = useApp()
  const qc = useQueryClient()
  const params = useSearchParams()
  const { data: sub, isPending } = useQuery({
    queryKey: ["plan-sub", household.id],
    queryFn: () => loadHouseholdSub(household.id),
  })
  const { data: mine } = useQuery({ queryKey: ["plan-mine", household.id], enabled: household.role !== "owner", queryFn: () => paysRenewal() })
  const { data: pays } = useQuery({
    queryKey: ["plan-pays", household.id],
    enabled: household.role === "owner",
    queryFn: () => loadHouseholdPayments(household.id),
  })
  useEffect(() => {
    if (params.get("pago")) toast("Estamos confirmando tu pago", { description: "Puede tardar unos minutos. Te avisamos cuando quede listo." })
  }, [params])
  const [confirmar, setConfirmar] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const cancel = async () => {
    setCancelando(true)
    const r = await cancelRenewal().finally(() => setCancelando(false))
    toast[r.ok ? "success" : "error"](r.msg)
    if (r.ok) setConfirmar(false)
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
        {sub?.proveedor === "mercadopago" && sub.estado === "activa" && (household.role === "owner" || mine) && (
          <SettingRow title="Renovación automática" desc="Si la cancelas, no te cobramos más y sigues con Premium hasta el vencimiento.">
            <AlertDialog open={confirmar} onOpenChange={(o) => !cancelando && setConfirmar(o)}>
              <AlertDialogTrigger asChild><Button variant="outline" className="text-danger">Cancelar renovación</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Cancelar la renovación automática?</AlertDialogTitle>
                  <AlertDialogDescription>No te cobramos más. Sigues con {plan.nombre} hasta el {sub.vence_at ? fmtDate(sub.vence_at.slice(0, 10), { year: true }) : "vencimiento"} y luego tu hogar pasa a Gratis, sin perder datos.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={cancelando}>Seguir con la renovación</AlertDialogCancel>
                  <SubmitButton className="bg-danger text-white hover:bg-danger/90" loading={cancelando} loadingText="Cancelando…" onClick={cancel}>Sí, cancelar renovación</SubmitButton>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
                    <Tip label={x.referencia ? `Referencia: ${x.referencia}` : undefined}><span><StatusPill tone={st[0]}>{st[1]}</StatusPill></span></Tip>
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
