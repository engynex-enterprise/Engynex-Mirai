"use client"

// Informes a la medida: el usuario elige qué quiere ver (gastos por categoría, persona, proveedor, producto o medio;
// ingresos por fuente o persona; activos, pasivos, deudas y préstamos; mes a mes) y el periodo. Las cifras salen de
// @mirai/domain/informes (flujoIntegral y estadoIntegral: las mismas de Todos los gastos y del Balance).
import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { Panel } from "@/components/mirai/panel"
import { Segmented } from "@/components/mirai/choice-cards"
import { Icon } from "@/components/mirai/icon"
import { ListRow } from "@/components/mirai/list-row"
import { EmptyState } from "@/components/mirai/empty-state"
import { DataTable, type DTColumn } from "@/components/mirai/data-table"
import { useBookData } from "@/features/book/use-book-data"
import { useIntegralExtras } from "@/features/balance/use-integral"
import { MonthNav } from "@/features/balance/balance-parts"
import { useMembers, useProviders } from "@/features/catalogs/hooks"
import { estadoIntegral, flujoIntegral, periodo } from "@/lib/domain/flujo-integral"
import { moverRef, periodoBandeja, tituloPeriodo, type TipoBandeja } from "@/lib/domain/bandeja"
import { INFORMES, informeEstado, informeFlujo, informeMeses, type FilaInforme, type GrupoInforme, type TipoInforme } from "@/lib/domain/informes"
import type { MesSerie } from "@/lib/domain/dashboard"
import { fmtPct, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"

const CategoriasChart = dynamic(() => import("@/features/dashboard/charts").then((m) => m.CategoriasChart), { ssr: false, loading: () => <Skeleton className="h-48 w-full rounded-lg" aria-hidden /> })
const MesesChart = dynamic(() => import("@/features/dashboard/charts").then((m) => m.MesesChart), { ssr: false, loading: () => <Skeleton className="h-64 w-full rounded-lg" aria-hidden /> })

const TIPOS = INFORMES.map((i) => i.id) as [TipoInforme, ...TipoInforme[]]
const GRUPOS_ORDEN: GrupoInforme[] = ["Gastos", "Ingresos", "Lo que tienes y lo que debes", "En el tiempo"]
const PERIODOS: { value: Extract<TipoBandeja, "mes" | "semestre" | "anio">; label: string }[] = [{ value: "mes", label: "Mes" }, { value: "semestre", label: "Semestre" }, { value: "anio", label: "Año" }]
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

export function InformesView() {
  const today = todayISO()
  const [tipo, setTipo] = useQueryState("tipo", parseAsStringLiteral(TIPOS).withDefault("gastos-categoria").withOptions({ history: "replace" }))
  const [per, setPer] = useState<"mes" | "semestre" | "anio">("mes")
  const [ref, setRef] = useState(today)
  const { data: book, isPending } = useBookData()
  const { data: members = [] } = useMembers()
  const { data: providers = [] } = useProviders()
  const X = useIntegralExtras(book, today)
  const def = INFORMES.find((i) => i.id === tipo)!
  const anual = tipo === "mes-a-mes"

  const d = useMemo(() => {
    if (!book) return null
    const byId = <T extends { id?: string | null; nombre?: string | null }>(l: T[] | undefined) => { const m = new Map((l ?? []).map((x) => [x.id ?? "", x.nombre ?? ""])); return (id: string) => m.get(id) || undefined }
    const N = { member: byId(members), provider: byId(providers), contact: byId(book.contacts), entity: byId(book.entities), medio: byId(book.paymentMethods) }
    if (anual) {
      const y = +ref.slice(0, 4)
      const meses = Array.from({ length: 12 }, (_, m) => ({ k: `${y}-${String(m + 1).padStart(2, "0")}`, label: `${MES[m]} ${y}`, F: flujoIntegral(book, periodo(book, "mes", y, m), today, X) }))
      const serie: MesSerie[] = meses.map(({ k, F }, m) => ({ k, l: MES[m], entra: F.tot.entra, gasto: F.tot.gasto, deuda: F.tot.deuda, sale: F.tot.sale, ahorro: F.tot.ahorro, queda: F.tot.queda, parcial: k === today.slice(0, 7) }))
      return { I: informeMeses(meses), titulo: `Año ${y}`, serie }
    }
    if (!def.periodo) return { I: informeEstado(tipo, estadoIntegral(book, today, X), book, today), titulo: "Hoy", serie: null }
    const P = periodoBandeja(book, per, ref, today)
    return { I: informeFlujo(tipo, flujoIntegral(book, P, today, X), N), titulo: tituloPeriodo(per, P), serie: null }
  }, [book, X, today, tipo, per, ref, def.periodo, anual, members, providers])

  const I = d?.I
  const top = I?.filas[0]
  const conGrupo = I?.filas.some((f) => f.grupo)
  const columns: DTColumn<FilaInforme>[] = [
    { id: "label", header: anual ? "Mes" : "Nombre", sort: (f) => (anual ? f.k : f.label.toLowerCase()), csv: (f) => f.label },
    ...(conGrupo ? [{ id: "grupo", header: "Grupo", sort: (f: FilaInforme) => f.grupo ?? "", csv: (f: FilaInforme) => f.grupo ?? "" }] : []),
    ...(anual ? [
      { id: "entra", header: "Entra", align: "right" as const, sort: (f: FilaInforme) => f.entra ?? 0, csv: (f: FilaInforme) => Math.round(f.entra ?? 0) },
      { id: "queda", header: "Te queda", align: "right" as const, sort: (f: FilaInforme) => f.queda ?? 0, csv: (f: FilaInforme) => Math.round(f.queda ?? 0) },
    ] : [{ id: "n", header: "Movimientos", align: "right" as const, sort: (f: FilaInforme) => f.n, csv: (f: FilaInforme) => f.n }]),
    { id: "pct", header: "Parte del total", align: "right", sort: (f) => f.pct, csv: (f) => Math.round(f.pct * 1000) / 10 },
    { id: "v", header: anual ? "Sale" : "Valor", align: "right", sort: (f) => f.v, csv: (f) => Math.round(f.v) },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader id="informes" title="Informes" description="Elige qué quieres ver y de qué periodo: tus gastos por categoría, persona, proveedor o producto, tus ingresos, lo que tienes y lo que debes, o cómo va cada mes." />

      {/* Qué informe: agrupados por tema */}
      <div className="grid gap-4" role="radiogroup" aria-label="Tipo de informe">
        {GRUPOS_ORDEN.map((g) => (
          <div key={g} className="grid gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g}</p>
            <div className="flex flex-wrap gap-2">
              {INFORMES.filter((i) => i.grupo === g).map((i) => {
                const on = i.id === tipo
                return (
                  <button key={i.id} type="button" role="radio" aria-checked={on} title={i.desc} onClick={() => void setTipo(i.id)}
                    className={cn("inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors", on ? "border-primary bg-brand-soft text-foreground" : "bg-card text-muted-foreground hover:bg-hover hover:text-foreground")}>
                    <Icon name={i.icon} className="size-4" /> {i.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Periodo: los de patrimonio son a hoy; mes a mes va por año */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground"><b className="text-foreground">{def.label}</b> · {def.desc}</p>
        {anual ? (
          <MonthNav ym={ref.slice(0, 7)} label={d?.titulo} onMove={(k) => setRef(moverRef("anio", ref, k))} />
        ) : def.periodo ? (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={per} onChange={(v) => { setPer(v as typeof per); setRef(today) }} items={PERIODOS} />
            <MonthNav ym={ref.slice(0, 7)} label={d?.titulo} onMove={(k) => setRef(moverRef(per, ref, k))} />
          </div>
        ) : <span className="text-sm font-semibold">A hoy</span>}
      </div>

      <KpiGrid cols={3}>
        <Kpi icon={def.icon} tone="brand" label={anual ? "Sale en el año" : "Total"} loading={isPending} value={<Money value={I?.total ?? 0} />} sub={d?.titulo} info={I?.nota} />
        <Kpi icon="list" tone="blue" label={anual ? "Meses" : "Elementos"} loading={isPending} value={I?.filas.length ?? 0} sub={anual ? "Del año" : "Filas del informe"} />
        <Kpi icon="trophy" tone="amber" label={anual ? "El mes que más salió" : "El más alto"} loading={isPending}
          value={top ? <Money value={anual ? Math.max(...I!.filas.map((f) => f.v)) : top.v} /> : "—"}
          sub={top ? (anual ? I!.filas.reduce((a, f) => (f.v > a.v ? f : a)).label : `${top.label} · ${fmtPct(top.pct * 100, 0)}`) : "Sin datos"} />
      </KpiGrid>

      {!!I?.filas.length && (
        <Panel title={anual ? "Entra, sale y te queda cada mes" : "Lo más grande"} icon="chart-bar" info={I.nota}>
          {anual && d?.serie ? <MesesChart data={d.serie} /> : <CategoriasChart data={I.filas.slice(0, 10).map((f) => ({ cat: f.label, v: f.v }))} />}
        </Panel>
      )}

      <DataTable<FilaInforme>
        title={def.label} info={I?.nota} subtitle={d?.titulo}
        data={I?.filas} loading={isPending} columns={columns} rowKey={(f) => f.k} noun={anual ? ["mes", "meses"] : ["fila", "filas"]}
        exportName={`informe-${tipo}`} total={{ value: (f) => f.v, label: "suman" }} initialSort={anual ? { id: "label", dir: "asc" } : { id: "v", dir: "desc" }}
        search={anual ? undefined : { placeholder: "Buscar en el informe", text: (f) => `${f.label} ${f.grupo ?? ""} ${f.sub ?? ""}` }}
        selectable
        groupings={conGrupo ? [{ id: "grupo", label: "Por grupo", by: (f) => f.grupo ?? "Otros" }] : undefined}
        emptyState={<EmptyState iso="reportes" title="No hay datos para este informe" description={def.periodo ? "Prueba con otro periodo o registra tus movimientos." : "Registra tus cuentas, bienes y deudas para verlas aquí."} />}
        item={(f, select) => (
          <ListRow key={f.k} icon={def.icon} title={f.label} select={select && { ...select, label: `Elegir ${f.label}` }}
            subtitle={anual
              ? <span data-money>Entra <Money value={f.entra ?? 0} /> · te queda <Money value={f.queda ?? 0} className={(f.queda ?? 0) < 0 ? "text-danger" : undefined} /></span>
              : [f.grupo, f.sub, f.n > 1 ? `${f.n} movimientos` : null].filter(Boolean).join(" · ") || undefined}
            extra={<span className="flex items-center gap-2"><span className="h-1.5 w-24 rounded-full bg-muted sm:w-40" role="presentation"><span className="block h-1.5 rounded-full bg-navy dark:bg-lime" style={{ width: `${Math.max(2, f.pct * 100)}%` }} /></span>{fmtPct(f.pct * 100, 0)}</span>}
            value={<Money value={f.v} className="font-bold" />} />
        )}
      />
    </div>
  )
}
