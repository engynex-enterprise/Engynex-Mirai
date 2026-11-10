"use client"

// Consola › Datos de referencia: la tasa de usura de cada mes (ref_usury_rate). La llena sola el cron de referencias
// desde datos.gov.co; si la fuente falla (casi siempre a fin de mes, cuando la Superfinanciera publica la nueva),
// aquí se carga a mano con su resolución y se aplica de una vez a los libros en automático.
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldGroup } from "@/components/ui/field"
import { FormField } from "@/components/mirai/field"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Notice } from "@/components/mirai/notice"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { Segmented } from "@/components/mirai/choice-cards"
import { DataTable, DTPrimary, DTTwoLine } from "@/components/mirai/data-table"
import { StatusPill } from "@/components/mirai/status-pill"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { fmtDate, fmtPct } from "@/lib/format"
import { mesUsura, usuraDesdeIbc } from "@mirai/domain/usura"
import { deleteUsura, loadUsura, saveUsura, type UsuraFila } from "./platform-api"
import { useAsk, useDialogTarget } from "./ui"

const KEY = ["admin", "usura"]
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const nombreMes = (ym: string) => `${MESES[+ym.slice(5, 7) - 1]} de ${ym.slice(0, 4)}`
const num = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0

export function UsuraPanel() {
  const qc = useQueryClient()
  const ask = useAsk()
  const { data, isPending } = useQuery({ queryKey: KEY, queryFn: loadUsura })
  const edit = useDialogTarget<{ ym: string; fila: UsuraFila | null }>()
  const v = data?.vigente
  const borrar = async (f: UsuraFila) => {
    if (!(await ask.confirm({ title: `¿Borrar la usura de ${nombreMes(f.desde.slice(0, 7))}?`, description: "Si era la vigente, los libros en automático quedan con la del mes anterior.", confirmLabel: "Borrar", destructive: true }))) return
    try { toast(await deleteUsura(f.desde)) } catch (e) { return toast.error("No se pudo borrar", { description: (e as Error).message }) }
    qc.invalidateQueries({ queryKey: KEY })
  }
  const alerta = data?.alerta
  return (
    <div className="grid gap-6">
      {alerta && (
        <Notice tone={alerta === "falta-siguiente" ? "warn" : "bad"} title={alerta === "sin-tasa" ? "No hay una tasa de usura para hoy" : alerta === "vencida" ? "La tasa de usura está vencida" : `Falta la usura de ${nombreMes(data!.siguiente)}`}
          action={<Button size="sm" onClick={() => edit.show({ ym: alerta === "falta-siguiente" ? data!.siguiente : data!.hoy.slice(0, 7), fila: null })}>Cargarla a mano</Button>}>
          {alerta === "falta-siguiente"
            ? "La Superfinanciera la publica a fin de mes. Si el cron no la trae, cárgala con su resolución antes del día 1."
            : `La última es de ${v ? nombreMes(v.desde.slice(0, 7)) : "ningún mes"}. Puede que datos.gov.co no haya respondido: carga la de este mes con su resolución.`}
        </Notice>
      )}
      <KpiGrid cols={3}>
        <Kpi icon="scale" tone="brand" label="Usura vigente hoy" loading={isPending} value={v ? fmtPct(v.tasa_ea, 2) : "—"} sub={v ? `E.A. · ${nombreMes(v.desde.slice(0, 7))}` : "Sin tasa"} info="Consumo y ordinario: interés bancario corriente × 1,5. Es el tope legal de interés en Colombia." />
        <Kpi icon="file-text" tone="blue" label="Fuente" loading={isPending} value={<span className="text-base">{v?.fuente || "Sin fuente"}</span>} sub={v ? `Del ${fmtDate(v.desde, { year: true })} al ${fmtDate(v.hasta, { year: true })}` : undefined} />
        <Kpi icon="book-open" tone={data && data.librosAlDia < data.librosAuto ? "amber" : "green"} label="Libros al día" loading={isPending} value={data ? `${data.librosAlDia} de ${data.librosAuto}` : "—"} sub="Libros con la usura en automático" />
      </KpiGrid>

      <DataTable<UsuraFila>
        title="Tasa de usura por mes" info="La trae sola el cron de referencias (datos.gov.co, Superfinanciera). Si falla, cárgala aquí: se aplica de una vez a los libros en automático."
        data={data?.filas} loading={isPending} rowKey={(f) => f.desde} exportName="mirai-usura" initialSort={{ id: "mes", dir: "desc" }}
        create={{ label: "Cargar un mes", onClick: () => edit.show({ ym: data?.hoy.slice(0, 7) ?? "", fila: null }) }}
        actions={[
          { label: "Corregir", onSelect: (f) => edit.show({ ym: f.desde.slice(0, 7), fila: f }) },
          { label: "Borrar", destructive: true, onSelect: borrar },
        ]}
        columns={[
          { id: "mes", header: "Mes", sort: (f) => f.desde, csv: (f) => f.desde.slice(0, 7), cell: (f) => <DTPrimary media={<ToneIcon icon="scale" tone={f.desde === v?.desde ? "green" : "gray"} />} title={nombreMes(f.desde.slice(0, 7))} sub={`Del ${fmtDate(f.desde)} al ${fmtDate(f.hasta)}`} /> },
          { id: "tasa", header: "Usura E.A.", align: "right", sort: (f) => f.tasa_ea, csv: (f) => f.tasa_ea, cell: (f) => <DTTwoLine top={<span className="font-semibold tabular-nums">{fmtPct(f.tasa_ea, 2)}</span>} bottom={`≈ ${fmtPct((Math.pow(1 + f.tasa_ea / 100, 1 / 12) - 1) * 100, 2)} mensual`} /> },
          { id: "fuente", header: "Fuente", csv: (f) => f.fuente ?? "", cell: (f) => <span className="text-sm">{f.fuente || <span className="text-muted-foreground">Sin fuente</span>}</span> },
          { id: "estado", header: "Estado", sort: (f) => f.desde, csv: (f) => (f.desde === v?.desde ? "Vigente" : f.desde > (data?.hoy ?? "") ? "Próxima" : "Anterior"), cell: (f) => f.desde === v?.desde ? <StatusPill tone="pagado">Vigente</StatusPill> : f.desde > (data?.hoy ?? "") ? <StatusPill tone="info">Próxima</StatusPill> : <StatusPill tone="gray">Anterior</StatusPill> },
        ]}
        empty={<p className="text-muted-foreground">Aún no hay tasas. Carga la de este mes con <b>Cargar un mes</b>.</p>}
      />
      {edit.value && <UsuraDialog key={edit.key} ym={edit.value.ym} fila={edit.value.fila} open={edit.open} onOpenChange={edit.onOpenChange} />}
      {ask.node}
    </div>
  )
}

function UsuraDialog({ ym: ym0, fila, open, onOpenChange }: { ym: string; fila: UsuraFila | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [ym, setYm] = useState(ym0)
  const [modo, setModo] = useState<"usura" | "ibc">("usura")
  const [valor, setValor] = useState(fila ? String(fila.tasa_ea).replace(".", ",") : "")
  const [fuente, setFuente] = useState(fila?.fuente ?? "Superintendencia Financiera, Resolución ")
  const [busy, setBusy] = useState(false)
  const tasa = modo === "ibc" ? usuraDesdeIbc(num(valor)) : Math.round(num(valor) * 100) / 100
  const okMes = /^\d{4}-(0[1-9]|1[0-2])$/.test(ym)
  const ok = okMes && tasa >= 1 && tasa <= 200 && fuente.trim().length >= 3
  const guardar = async () => {
    setBusy(true)
    try {
      toast.success(await saveUsura(mesUsura(ym).desde, tasa, fuente.trim()))
      qc.invalidateQueries({ queryKey: KEY })
      onOpenChange(false)
    } catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }) }
    setBusy(false)
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={fila ? `Corregir la usura de ${nombreMes(ym0)}` : "Cargar la usura de un mes"} description="Búscala en la resolución mensual de la Superintendencia Financiera (consumo y ordinario)."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={!ok || busy} onClick={guardar}>Guardar y aplicar</Button></>}>
      <FieldGroup>
        <FormField label="Mes" htmlFor="us-mes" required tip={false} hint={okMes ? `Rige del ${fmtDate(mesUsura(ym).desde, { year: true })} al ${fmtDate(mesUsura(ym).hasta, { year: true })}.` : "Usa el formato AAAA-MM."}>
          <Input id="us-mes" type="month" className="h-11 w-48" value={ym} disabled={!!fila} onChange={(e) => setYm(e.target.value)} />
        </FormField>
        <FormField label="¿Qué dato tienes?" tip={false}>
          <Segmented value={modo} onChange={(x) => setModo(x as typeof modo)} items={[{ value: "usura", label: "La usura E.A." }, { value: "ibc", label: "El interés bancario corriente" }]} />
        </FormField>
        <FormField label={modo === "ibc" ? "Interés bancario corriente E.A. (%)" : "Tasa de usura E.A. (%)"} htmlFor="us-tasa" required tip={false}
          hint={modo === "ibc" && tasa > 0 ? `Usura = ${valor} × 1,5 = ${fmtPct(tasa, 2)} E.A.` : "Ej. 28,34 para noviembre de 2026."}>
          <Input id="us-tasa" className="h-11 w-40" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </FormField>
        <FormField label="Fuente" htmlFor="us-fuente" required tip={false} hint="Ej. Superintendencia Financiera, Resolución 1707 de 2026.">
          <Input id="us-fuente" className="h-11" value={fuente} onChange={(e) => setFuente(e.target.value)} />
        </FormField>
      </FieldGroup>
    </ResponsiveDialog>
  )
}
