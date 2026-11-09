"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Settings2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/mirai/page-header"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { StatusPill } from "@/components/mirai/status-pill"
import { Icon } from "@/components/mirai/icon"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { DataTable, DTPrimary, type DTColumn, type DTFilter } from "@/components/mirai/data-table"
import { Tip } from "@/components/mirai/tip"
import { ToneIcon, type IconTone } from "@/components/mirai/tone-icon"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { saveTope } from "./api"
import { ingresoMensual } from "@/lib/domain"
import { gastadoMes, presupuestoCategorias, type EstadoPresupuesto, type FilaPresupuesto } from "@/lib/domain/presupuesto"
import { fmtMoney, fmtPct, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"

const GRUPOS = [
  { k: "n", t: "Necesidades", icon: "house", color: "#1F2B4B", d: "Arriendo, mercado, servicios, transporte, salud" },
  { k: "g", t: "Gustos", icon: "coffee", color: "#9EDB4E", d: "Restaurantes, salidas, ropa, suscripciones" },
  { k: "a", t: "Ahorro e inversión", icon: "piggy-bank", color: "#3F7A1E", d: "Lo que guardas para el futuro" },
] as const
const TONO: Record<string, IconTone> = { n: "navy", g: "brand", a: "green" }

function TopeCell({ id, value, onSaved, label }: { id: string; value: number; onSaved: () => void; label: string }) {
  const bookId = useBookId()
  const [v, setV] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) { setPrev(value); setV(value) }
  return (
    <div className="w-36">
      <MoneyInput aria-label={label} value={v} onChange={setV} onBlur={async () => {
        if (v === value) return
        try { await saveTope(bookId, id, v) } catch { return toast.error("No se pudo guardar el tope") }
        toast.success("Tope actualizado"); onSaved()
      }} />
    </div>
  )
}

type Fila = FilaPresupuesto
type Estado = EstadoPresupuesto
const ESTADO: Record<Estado, { tone: "gray" | "vencido" | "porVencer" | "pagado"; label: string; tip: string }> = {
  sin: { tone: "gray", label: "Sin tope", tip: "Escribe un tope para que te avisemos cuando te acerques." },
  pasado: { tone: "vencido", label: "Te pasaste", tip: "Ya gastaste más de lo que planeaste este mes." },
  cerca: { tone: "porVencer", label: "Cerca del tope", tip: "Vas cerca del límite: cuida los próximos gastos." },
  bien: { tone: "pagado", label: "Bien", tip: "Vas dentro de lo que planeaste." },
  otra: { tone: "gray", label: "Sin categoría", tip: "Gastos con una categoría que ya no existe. Edítalos en Gastos." },
}

export function BudgetView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const today = todayISO()
  const mes = today.slice(0, 7)
  const { data: book, isPending } = useBookData()
  const d = useMemo(() => {
    if (!book) return null
    const pct = book.settings.pct ?? { n: 50, g: 30, a: 20 }
    const ing = ingresoMensual(book.incomes, book.settings.trm)
    // Las mismas filas que la bandeja "Todos los gastos" (una sola cifra; los gastos en USD o EUR, en pesos).
    const filas: Fila[] = presupuestoCategorias(book, mes)
    const llevasDe = new Map(filas.map((f) => [f.id, f.llevas]))
    const grupo = (k: string) => book.categories.filter((c) => c.grupo === k).reduce((a, c) => a + (llevasDe.get(c.id) ?? 0), 0)
    const planeado = (k: string) => book.categories.filter((c) => c.grupo === k).reduce((a, c) => a + Number(c.tope), 0)
    const gastado = gastadoMes(filas)
    const topes = book.categories.reduce((a, c) => a + Number(c.tope), 0)
    return { pct, ing, grupo, planeado, filas, gastado, topes, pasadas: filas.filter((f) => f.st === "pasado").length }
  }, [book, mes])
  if (isPending || !book || !d) return <PageSkeleton kpis={4} />
  const refresh = () => invalidateBook(qc, bookId, "categories")
  const libre = d.ing - d.gastado

  const columns: DTColumn<Fila>[] = [
    { id: "nombre", header: "Categoría", sort: (f) => f.nombre, csv: (f) => f.nombre,
      cell: (f) => <DTPrimary media={<ToneIcon icon={f.icon} tone={f.unknown ? "gray" : TONO[f.grupo ?? ""] ?? "gray"} size="sm" />} title={f.nombre} sub={GRUPOS.find((g) => g.k === f.grupo)?.t} /> },
    { id: "tope", header: "Tope al mes", info: "Lo máximo que quieres gastar al mes. Se guarda al salir del campo.", sort: (f) => f.tope, csv: (f) => f.tope,
      cell: (f) => (f.unknown ? <span className="text-muted-foreground">—</span> : canEdit ? <TopeCell id={f.id} value={f.tope} onSaved={refresh} label={`Tope de ${f.nombre}`} /> : <Money value={f.tope} />) },
    { id: "llevas", header: "Llevas", align: "right", sort: (f) => f.llevas, csv: (f) => f.llevas, cell: (f) => <Money value={f.llevas} className="font-semibold" /> },
    { id: "uso", header: "Uso", sort: (f) => f.u, csv: (f) => Math.round(f.u),
      cell: (f) => (f.tope > 0 ? (
        <div className="flex min-w-28 items-center gap-2">
          <Progress value={Math.min(100, f.u)} aria-label={`Uso: ${fmtPct(f.u, 0)}`} className={cn("h-1.5 flex-1", f.u >= 100 ? "[&>div]:bg-danger" : f.u >= 80 ? "[&>div]:bg-[#E08A00]" : "[&>div]:bg-lime")} />
          <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{fmtPct(f.u, 0)}</span>
        </div>
      ) : <span className="text-muted-foreground">—</span>) },
    { id: "estado", header: "Estado", sort: (f) => f.u, csv: (f) => ESTADO[f.st].label,
      cell: (f) => <Tip label={ESTADO[f.st].tip}><span className="inline-flex"><StatusPill tone={ESTADO[f.st].tone}>{ESTADO[f.st].label}</StatusPill></span></Tip> },
  ]
  const filters: DTFilter<Fila>[] = [
    { id: "grupo", label: "Tipo", options: GRUPOS.map((g) => ({ value: g.k, label: g.t })), match: (f, v) => f.grupo === v },
    { id: "estado", label: "Estado", options: (["pasado", "cerca", "bien", "sin"] as Estado[]).map((k) => ({ value: k, label: ESTADO[k].label })), match: (f, v) => f.st === v },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader id="presupuesto" description={`La regla más usada para organizar el sueldo: ${d.pct.n} % para lo necesario, ${d.pct.g} % para gustos y ${d.pct.a} % para ahorrar. Con tu ingreso de ${fmtMoney(d.ing)} queda así:`}
        actions={<Button variant="outline" asChild><Link href="/ajustes?tab=categorias"><Settings2 /> Editar categorías</Link></Button>} />
      <KpiGrid>
        <Kpi icon="wallet" tone="green" label="Te entra al mes" value={<Money value={d.ing} />} sub="Según tus ingresos" />
        <Kpi icon="receipt" tone="red" label="Gastado este mes" value={<Money value={d.gastado} />} sub={libre >= 0 ? <>Te quedan <Money value={libre} /></> : <>Te pasaste <Money value={-libre} /></>} />
        <Kpi icon="target" tone="blue" label="Topes planeados" value={<Money value={d.topes} />} sub={d.ing ? `${fmtPct((d.topes / d.ing) * 100, 0)} de tu ingreso` : "Suma de tus topes"} />
        <Kpi icon="circle-alert" tone={d.pasadas ? "red" : "green"} label="Categorías pasadas" value={d.pasadas} valueClassName={d.pasadas ? "text-danger" : "text-success"} sub={d.pasadas ? "Revisa la tabla de abajo" : "Ninguna se pasó del tope"} />
      </KpiGrid>
      <div className="grid gap-4 md:grid-cols-3">
        {GRUPOS.map((g) => {
          const p = d.pct[g.k], rec = (d.ing * p) / 100, gastado = d.grupo(g.k), plan = d.planeado(g.k)
          const v = gastado || plan
          const uso = rec ? Math.round((v / rec) * 100) : 0
          return (
            <Card key={g.k} className="h-full gap-3 p-5 shadow-card ring-0">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full text-white" style={{ background: g.color }}><Icon name={g.icon} className="size-5" /></span>
                <div className="grid min-w-0 flex-1"><h2 className="font-semibold">{g.t}</h2><span className="text-xs text-muted-foreground">{g.d}</span></div>
                <Tip label={`Recomendado: ${p} % de tu ingreso`}><span tabIndex={0} className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><StatusPill tone="info">{p} %</StatusPill></span></Tip>
              </div>
              <div className="mt-auto"><Money value={v} className="text-[22px] font-semibold" /><p className="text-xs text-muted-foreground">{gastado ? "Gastado este mes" : "Planeado"} · recomendado {fmtMoney(rec)}</p></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={uso} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.t}: ${uso} % de lo recomendado`}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, uso)}%`, background: g.color }} />
              </div>
            </Card>
          )
        })}
      </div>
      <DataTable title="Cada categoría este mes" info="Escribe cuánto quieres gastar como máximo en cada una. Te avisamos cuando te acerques al tope."
        data={d.filas} columns={columns} rowKey={(f) => f.id} search={{ placeholder: "Buscar categoría", text: (f) => f.nombre }}
        filters={filters} exportName="presupuesto" pageSize={50} />
    </div>
  )
}
