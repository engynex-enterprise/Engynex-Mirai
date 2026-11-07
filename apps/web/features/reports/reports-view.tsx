"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { ChartColumn, Download, FileSpreadsheet, Lightbulb, ThumbsUp, TriangleAlert, WandSparkles } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Combobox } from "@/components/mirai/combobox"
import { FormField } from "@/components/mirai/field"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Panel } from "@/components/mirai/panel"
import { ToneIcon, toneFor } from "@/components/mirai/tone-icon"
import { Money } from "@/components/mirai/money"
import { Notice } from "@/components/mirai/notice"
import { PageHeader } from "@/components/mirai/page-header"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useApp, useCanEdit } from "@/components/app/app-context"
import { useList } from "@/hooks/use-book-data"
import { conv, indicadores, loanEngine, loanName, reportData } from "@/lib/domain"
import { fmtMonth, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"
import { useMembers, usePaymentMethods } from "@/features/catalogs/hooks"
import { fetchMonthSummary, generateMonthSummary } from "./api"
import { AdSlot } from "@/features/ads/ad-slot"

function months(today: string) {
  const [y, m] = today.split("-").map(Number)
  return Array.from({ length: 12 }, (_, j) => { const d = new Date(y, m - 1 - j, 1); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; return { value: k, label: fmtMonth(k).replace(/^./, (c) => c.toUpperCase()) } })
}

function Row({ l, v, cls, bold }: { l: string; v: number; cls?: string; bold?: boolean }) {
  return <tr className={cn("border-b last:border-0", bold && "bg-muted/40")}><td className={cn("py-2 pr-2 pl-1", bold && "font-semibold")}>{l}</td><td className={cn("py-2 pr-1 text-right tabular-nums", bold && "font-semibold", cls)}><Money value={v} /></td></tr>
}

function SummaryCard({ k }: { k: string }) {
  const { book } = useApp()
  const can = useCanEdit()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const { data: r } = useQuery({
    queryKey: ["b", book.id, "monthly_summaries", k],
    queryFn: () => fetchMonthSummary(book.id, k),
  })
  const cols: [string, typeof ChartColumn, string[] | undefined][] = r ? [["En qué gastaste más", ChartColumn, r.gastaste_mas], ["Lo que mejoró", ThumbsUp, r.mejoro], ["Ojo con esto", TriangleAlert, r.alertas]] : []
  return (
    <Panel title="Resumen del mes con IA" icon="sparkles" action={
        <Button variant="soft" disabled={busy || !can} onClick={async () => {
          setBusy(true)
          try { const x = await generateMonthSummary(k); qc.setQueryData(["b", book.id, "monthly_summaries", k], x); if (x.local) toast.warning("Resumen sin IA", { description: "Activa un proveedor de IA para un análisis completo." }) } catch (e) { toast.error((e as Error).message) }
          setBusy(false)
        }}>{busy ? <Spinner /> : <WandSparkles />}{busy ? "Analizando el mes…" : r ? "Actualizar" : "Generar resumen"}</Button>}>
      {!r ? <p className="text-sm text-muted-foreground">La IA revisa tus gastos del mes, los compara con el mes anterior y te da una recomendación concreta.</p> : (
        <>
          <div><h3 className="text-lg font-semibold">{r.titular}</h3><p>{r.resumen}</p></div>
          <div className="grid gap-4 md:grid-cols-3">
            {cols.map(([t, I, l]) => (
              <div key={t} className="rounded-lg bg-muted/40 p-3"><p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"><I className="size-4" aria-hidden />{t}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">{l?.length ? l.map((x) => <li key={x}>{x}</li>) : <li className="text-muted-foreground">Nada destacado</li>}</ul></div>
            ))}
          </div>
          <Notice tone="ok" title="Para el próximo mes">{r.recomendacion}</Notice>
        </>
      )}
    </Panel>
  )
}

export function ReportsView() {
  const today = todayISO()
  const { book: libro } = useApp()
  const [k, setK] = useState(today.slice(0, 7))
  const [pdfBusy, setPdfBusy] = useState(false)
  const { data: book, isPending } = useBookData()
  const { data: expenses = [] } = useList("expenses")
  const { data: members = [] } = useMembers()
  const { data: medios = [] } = usePaymentMethods()
  const R = useMemo(() => (book ? reportData(book, k, today) : null), [book, k, today])
  if (isPending || !book || !R) return <PageSkeleton kpis={0} />

  const trm = book.settings.trm
  const raw = book as unknown as { assets: { nombre: string; valor: number; currency: string }[]; liabilities: { nombre: string; valor: number; currency: string }[] }
  const activos = raw.assets.map((a) => [a.nombre, conv(a.valor, a.currency, trm)] as [string, number])
  const pasivos = raw.liabilities.map((a) => [a.nombre, conv(a.valor, a.currency, trm)] as [string, number])
  const catName = (id: string) => book.categories.find((c) => c.id === id)?.nombre ?? "Sin categoría"
  const catIcon = (id: string) => book.categories.find((c) => c.id === id)?.icon ?? "tag"
  const top = R.cats.slice(0, 6)

  const csv = () => {
    const name = (arr: { id: string; nombre: string }[], id: string | null) => arr.find((x) => x.id === id)?.nombre ?? ""
    const rows = [["Fecha", "Descripción", "Categoría", "Quién", "Medio", "Valor"], ...expenses.filter((g) => g.fecha.startsWith(k)).sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((g) => [g.fecha, g.descripcion, g.category_id ? catName(g.category_id) : "", g.member_id ? name(members, g.member_id) : "Toda la familia", name(medios, g.payment_method_id), String(g.valor)])]
    const text = "﻿" + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n")
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })), download: `movimientos-${k}.csv` })
    a.click()
  }
  const pdf = async () => {
    setPdfBusy(true)
    try {
      const { downloadReport } = await import("./report-pdf")
      const prestamos = book.loans.map((L) => [`${L.kind === "cobrar" ? "Me debe" : "Le debo"} · ${loanName(L, book.contacts, book.entities)}`, loanEngine(L, today).saldo] as [string, number]).filter(([, v]) => v > 0)
      await downloadReport({ mes: fmtMonth(k), libro: libro.nombre, hoy: today, R, activos, pasivos, ind: indicadores(book, today), prestamos, cats: R.cats.map(([c, v]) => [catName(c), v]) }, `reporte-${k}.pdf`)
    } catch (e) { toast.error("No se pudo generar el PDF", { description: (e as Error).message }) }
    setPdfBusy(false)
  }

  return (
    <div className="grid gap-6">
      <PageHeader id="reportes" title="Reportes" description={`Tu balance y el resultado de ${fmtMonth(k)}, listos para revisar en familia o guardar en PDF.`} />
      <Panel className="flex-row flex-wrap items-end gap-3">
        <FormField label="Mes" htmlFor="rep-mes" tip={false} className="w-full sm:w-60"><Combobox id="rep-mes" value={k} onChange={setK} options={months(today)} /></FormField>
        <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
          <Button className="h-11" onClick={pdf} disabled={pdfBusy}>{pdfBusy ? <Spinner /> : <Download />} Descargar PDF</Button>
          <Button className="h-11" variant="outline" onClick={csv}><FileSpreadsheet /> Movimientos en Excel (CSV)</Button>
        </div>
      </Panel>
      <KpiGrid className="xl:grid-cols-3">
        <Kpi icon="arrow-down-to-line" tone="income" label="Ingresos del mes" value={<Money value={R.ing} />} sub={fmtMonth(k)} />
        <Kpi icon="arrow-up-from-line" tone="expense" label="Gastos y cuotas" value={<Money value={R.grp.n + R.grp.g + R.grp.x + R.grp.a + R.cuo + R.sub} />} sub="Necesidades, gustos, cuotas y suscripciones" />
        <Kpi icon={R.res >= 0 ? "piggy-bank" : "triangle-alert"} tone={R.res >= 0 ? "green" : "red"} label="Saldo del mes" value={<Money value={R.res} />} valueClassName={R.res >= 0 ? "text-success" : "text-danger"} sub={R.ing > 0 ? `${Math.round((R.res / R.ing) * 100)} % de tus ingresos` : "Registra tus ingresos"} />
      </KpiGrid>
      <SummaryCard k={k} />
      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Balance: lo que tengo y lo que debo" icon="scale" className="gap-2">
          <table className="w-full text-sm"><tbody>
            {activos.map(([l, v], i) => <Row key={`a${i}`} l={l} v={v} />)}
            <Row l="Inversiones" v={R.T.xi} /><Row l="Lo que me deben" v={R.T.xc} /><Row l="Total que tengo" v={R.T.A} cls="text-success" bold />
            {pasivos.map(([l, v], i) => <Row key={`p${i}`} l={l} v={v} />)}
            <Row l="Créditos y préstamos" v={R.T.xp} /><Row l="Total que debo" v={R.T.P} cls="text-danger" bold />
          </tbody><tfoot><Row l="Patrimonio" v={R.T.pat} bold /></tfoot></table>
        </Panel>
        <Panel title="Resultado del mes" icon="chart-column" className="gap-2">
          <table className="w-full text-sm"><tbody>
            <Row l="Ingresos" v={R.ing} cls="text-success" /><Row l="Necesidades" v={R.grp.n} /><Row l="Gustos" v={R.grp.g} />
            <Row l="Otros gastos" v={R.grp.x + R.grp.a} /><Row l="Cuotas de créditos" v={R.cuo} /><Row l="Suscripciones" v={R.sub} />
          </tbody><tfoot><Row l={R.res >= 0 ? "Te sobró" : "Te faltó"} v={R.res} cls={R.res >= 0 ? "text-success" : "text-danger"} bold /></tfoot></table>
          {top.length > 0 && (
            <div className="mt-3 grid gap-2.5">
              <p className="text-sm font-semibold">Dónde se fue más plata</p>
              {top.map(([c, v]) => (
                <div key={c} className="grid gap-1">
                  <div className="flex items-center gap-2 text-sm"><ToneIcon icon={catIcon(c)} tone={toneFor(catName(c))} size="sm" /><span className="min-w-0 flex-1 truncate">{catName(c)}</span><Money value={v} className="font-medium" /></div>
                  <div className="ml-10 h-2 rounded-full bg-muted" role="presentation"><div className="h-2 rounded-full bg-navy dark:bg-lime" style={{ width: `${Math.max(2, (v / top[0][1]) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lightbulb className="size-3.5" /> El PDF incluye además la salud financiera, los préstamos y todos los gastos por categoría.</p>
      <AdSlot slot="reportes" />
    </div>
  )
}
