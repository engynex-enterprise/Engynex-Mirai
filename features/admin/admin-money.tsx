"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Gift, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { DatePicker } from "@/components/mirai/date-picker"
import { FormField } from "@/components/mirai/field"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { MoneyInput } from "@/components/mirai/money-input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { fmtDate } from "@/lib/format"
import { precio } from "@/lib/plans"
import { adminCleanOrphans, adminGrantPremium, adminPlans, adminRevenue, adminRevokeCourtesy, adminSavePlans, adminSetLimitesDb } from "./actions"

const PROV: Record<string, string> = { mercadopago: "Mercado Pago", wompi: "Wompi", manual: "Cortesía" }
const PAY: Record<string, [Parameters<typeof StatusPill>[0]["tone"], string]> = { aprobado: ["pagado", "Aprobado"], rechazado: ["vencido", "Rechazado"], reembolsado: ["gray", "Devuelto"], anulado: ["gray", "Anulado"], pendiente: ["porVencer", "Pendiente"] }

export function Ingresos() {
  const { data: r, isPending } = useQuery({ queryKey: ["admin", "revenue"], queryFn: () => adminRevenue() })
  const csv = () => {
    if (!r) return
    const rows = [["Fecha", "Hogar", "Pasarela", "Periodo", "Monto", "Estado", "Método", "Pagador", "Referencia"], ...r.pagos.map((x) => [(x.paid_at ?? x.created_at).slice(0, 10), x.hogar, PROV[x.proveedor] ?? x.proveedor, x.periodo ?? "", String(x.monto), x.estado, x.metodo ?? "", x.pagador ?? "", x.referencia])]
    const blob = new Blob(["﻿" + rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `mirai-pagos-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  return (
    <div className="grid gap-5">
      <KpiGrid>
        <Kpi icon="repeat" tone="green" label="Ingreso mensual recurrente" value={r ? precio(r.mrr) : ""} sub="MRR estimado (anuales ÷ 12)" loading={isPending} />
        <Kpi icon="banknote" tone="blue" label="Cobrado en 30 días" value={r ? precio(r.ingresosMes) : ""} sub={r && `${r.pagosMes} pagos · total histórico ${precio(r.ingresosTotal)}`} loading={isPending} />
        <Kpi icon="crown" tone="amber" label="Hogares Premium" value={r ? String(r.pagando + r.cortesia) : ""} sub={r && `${r.pagando} pagando · ${r.cortesia} de cortesía`} loading={isPending} />
        <Kpi icon="circle-alert" tone="red" label="Problemas del mes" value={r ? String(r.rechazadosMes + r.canceladasMes) : ""} sub={r && `${r.rechazadosMes} pagos rechazados · ${r.canceladasMes} cancelaciones`} loading={isPending} />
      </KpiGrid>
      <Card className="gap-4 p-5 shadow-card ring-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold">Pagos</h2>{r && <p className="text-sm text-muted-foreground">{r.porProveedor.map((x) => `${PROV[x.p]}: ${x.n} activos`).join(" · ")}</p>}</div>
          <Button variant="outline" onClick={csv} disabled={!r?.pagos.length}><Download /> Descargar CSV</Button>
        </div>
        {isPending ? <Skeleton className="h-40" /> : !r!.pagos.length ? <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay pagos. Aparecerán aquí cuando conectes Mercado Pago o Wompi y alguien pague Premium.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 font-medium">Fecha</th><th className="font-medium">Hogar</th><th className="font-medium">Pasarela</th><th className="font-medium">Estado</th><th className="text-right font-medium">Monto</th></tr></thead>
              <tbody>{r!.pagos.map((x) => (
                <tr key={x.id} className="border-b last:border-0">
                  <td className="py-2 whitespace-nowrap">{fmtDate((x.paid_at ?? x.created_at).slice(0, 10))}</td>
                  <td className="max-w-48 truncate">{x.hogar}<span className="block truncate text-xs text-muted-foreground">{x.pagador}</span></td>
                  <td>{PROV[x.proveedor] ?? x.proveedor}{x.metodo ? <span className="block text-xs text-muted-foreground">{x.metodo}</span> : null}</td>
                  <td><StatusPill tone={PAY[x.estado]?.[0] ?? "gray"}>{PAY[x.estado]?.[1] ?? x.estado}</StatusPill></td>
                  <td className="text-right font-semibold tabular-nums">{precio(x.monto)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

const in30 = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

/** Botón y ventana "Regalar Premium" (cortesía) para el hogar de una persona. */
export function GiftPremium({ householdId, nombre, premiumHasta }: { householdId: string; nombre: string; premiumHasta: string | null }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [hasta, setHasta] = useState(in30())
  const [nota, setNota] = useState("")
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    try { await fn(); toast.success(msg); setOpen(false); qc.invalidateQueries({ queryKey: ["admin"] }) }
    catch (e) { toast.error("No se pudo", { description: (e as Error).message }) }
    finally { setBusy(false) }
  }
  return (
    <>
      <Button size="icon-sm" variant="ghost" aria-label={`Regalar Premium a ${nombre}`} onClick={() => setOpen(true)}><Gift /></Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={`Regalar Premium a ${nombre}`} description="Todo su hogar tendrá Premium sin pagar hasta la fecha que elijas. Le llega un aviso.">
        <FieldGroup className="pb-2">
          {premiumHasta && <p className="rounded-lg bg-secondary/60 p-3 text-sm">Ya tiene Premium hasta el {fmtDate(premiumHasta.slice(0, 10), { year: true })}.</p>}
          <FormField label="Hasta" htmlFor="gift-hasta" tip={false}><DatePicker id="gift-hasta" quick="futuro" value={hasta} onChange={(v) => setHasta(v ?? in30())} /></FormField>
          <FormField label="Nota (solo para ti)" htmlFor="gift-nota" tip={false}><Input id="gift-nota" className="h-11" placeholder="Ej. Aliado, soporte, prueba" value={nota} onChange={(e) => setNota(e.target.value)} /></FormField>
          <div className="flex flex-wrap justify-end gap-2">
            {premiumHasta && <Button variant="ghost" className="mr-auto text-danger" disabled={busy} onClick={() => run(() => adminRevokeCourtesy(householdId), "Cortesía retirada")}>Quitar cortesía</Button>}
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={busy} onClick={() => run(() => adminGrantPremium(householdId, hasta, nota), "Premium regalado")}>{busy ? <Spinner /> : <Gift />} Regalar</Button>
          </div>
        </FieldGroup>
      </ResponsiveDialog>
    </>
  )
}

export function PlanesAdmin() {
  const qc = useQueryClient()
  const { data: p, isPending } = useQuery({ queryKey: ["admin", "plans"], queryFn: () => adminPlans() })
  const [edit, setEdit] = useState<{ precioMes: number; precioAnio: number; libros: number; personas: number } | null>(null)
  const [busy, setBusy] = useState(false)
  if (isPending || !p) return <Skeleton className="h-80" />
  const v = edit ?? { precioMes: p.precioMes, precioAnio: p.precioAnio, libros: p.libros, personas: p.personas }
  const set = (k: keyof typeof v, n: number) => setEdit({ ...v, [k]: n })
  const save = async () => {
    setBusy(true)
    try { await adminSavePlans(v); toast.success("Planes guardados"); setEdit(null); qc.invalidateQueries({ queryKey: ["admin"] }); qc.invalidateQueries({ queryKey: ["plans"] }) }
    catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }) }
    finally { setBusy(false) }
  }
  return (
    <div className="grid gap-5">
      <Card className="gap-4 p-5 shadow-card ring-0">
        <div><h2 className="font-semibold">Precio de Premium</h2><p className="text-sm text-muted-foreground">Aplica a los pagos nuevos. Las suscripciones con tarjeta ya creadas mantienen su precio hasta que la persona vuelva a suscribirse.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Mensual (COP)" htmlFor="pl-mes" tip={false}><MoneyInput id="pl-mes" value={v.precioMes} onChange={(n) => set("precioMes", n ?? 0)} /></FormField>
          <FormField label="Anual (COP)" htmlFor="pl-anio" tip={false} hint={v.precioMes ? `Equivale a ${(v.precioAnio / v.precioMes).toFixed(1).replace(".", ",")} meses` : undefined}><MoneyInput id="pl-anio" value={v.precioAnio} onChange={(n) => set("precioAnio", n ?? 0)} /></FormField>
        </div>
        <div><h2 className="font-semibold">Límites del plan Gratis</h2></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Libros de cuentas por hogar" htmlFor="pl-lib" tip={false}><Input id="pl-lib" type="number" min={1} className="h-11" value={v.libros} onChange={(e) => set("libros", +e.target.value)} /></FormField>
          <FormField label="Personas por hogar" htmlFor="pl-per" tip={false}><Input id="pl-per" type="number" min={1} className="h-11" value={v.personas} onChange={(e) => set("personas", +e.target.value)} /></FormField>
        </div>
        <Button className="w-fit" disabled={busy || !edit} onClick={save}>{busy && <Spinner />} Guardar cambios</Button>
      </Card>
      <Card className="gap-3 p-5 shadow-card ring-0">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="font-semibold">Hacer cumplir los límites también en la base de datos</h2><p className="text-sm text-muted-foreground">La app ya respeta los límites del plan Gratis. Al encender esto, la base de datos también impide crear libros o agregar personas de más, aunque alguien use la API directamente. Enciéndelo cuando publiques los planes en producción.</p></div>
          <Switch checked={p.limitesDb} aria-label="Límites en la base de datos" onCheckedChange={async (on) => { try { await adminSetLimitesDb(on); toast.success(on ? "Límites activos en la base" : "Límites de la base apagados"); qc.invalidateQueries({ queryKey: ["admin", "plans"] }) } catch (e) { toast.error((e as Error).message) } }} />
        </div>
      </Card>
      <Card className="gap-3 p-5 shadow-card ring-0">
        <div><h2 className="font-semibold">Mantenimiento</h2><p className="text-sm text-muted-foreground">Hogares sin ningún integrante: nadie puede verlos (restos de pruebas o de cuentas eliminadas). Borrarlos limpia también sus libros y movimientos.</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={p.huerfanos ? "porVencer" : "pagado"}>{p.huerfanos} hogares sin integrantes</StatusPill>
          <Button variant="outline" className="text-danger" disabled={!p.huerfanos || busy} onClick={async () => {
            if (!confirm(`¿Borrar ${p.huerfanos} hogares sin integrantes y todos sus datos? No se puede deshacer.`)) return
            setBusy(true)
            try { const n = await adminCleanOrphans(); toast.success(`${n} hogares borrados`); qc.invalidateQueries({ queryKey: ["admin"] }) } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
          }}><Trash2 /> Borrar hogares vacíos</Button>
        </div>
      </Card>
    </div>
  )
}
