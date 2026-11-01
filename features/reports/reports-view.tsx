"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ChartColumn, Download, FileSpreadsheet, Lightbulb, ThumbsUp, TriangleAlert, WandSparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Combobox } from "@/components/mirai/combobox"
import { Icon } from "@/components/mirai/icon"
import { Money } from "@/components/mirai/money"
import { Notice } from "@/components/mirai/notice"
import { PageHeader } from "@/components/mirai/page-header"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useApp, useCanEdit } from "@/components/app/app-context"
import { useList } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { conv, indicadores, loanEngine, loanName, reportData } from "@/lib/domain"
import { fmtMonth, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"
import { useMembers, usePaymentMethods } from "@/features/catalogs/hooks"
import { generateMonthSummary, type MonthSummary } from "./actions"

function months(today: string) {
  const [y, m] = today.split("-").map(Number)
  return Array.from({ length: 12 }, (_, j) => { const d = new Date(y, m - 1 - j, 1); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; return { value: k, label: fmtMonth(k).replace(/^./, (c) => c.toUpperCase()) } })
}

function Row({ l, v, cls, bold }: { l: string; v: number; cls?: string; bold?: boolean }) {
  return <tr className="border-b last:border-0"><td className={cn("py-2 pr-2", bold && "font-semibold")}>{l}</td><td className={cn("py-2 text-right tabular-nums", bold && "font-semibold", cls)}><Money value={v} /></td></tr>
}

function SummaryCard({ k }: { k: string }) {
  const { book } = useApp()
  const can = useCanEdit()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const { data: r } = useQuery({
    queryKey: ["b", book.id, "monthly_summaries", k],
    queryFn: async () => ((await createClient().from("monthly_summaries").select("contenido").eq("book_id", book.id).eq("mes", k).is("deleted_at", null).maybeSingle()).data?.contenido ?? null) as MonthSummary | null,
  })
  const cols: [string, typeof ChartColumn, string[] | undefined][] = r ? [["En qué gastaste más", ChartColumn, r.gastaste_mas], ["Lo que mejoró", ThumbsUp, r.mejoro], ["Ojo con esto", TriangleAlert, r.alertas]] : []
  return (
    <Card className="gap-4 p-5 shadow-card ring-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="sparkles" className="size-5 text-brand" />Resumen del mes con IA</h2>
        <Button variant="soft" disabled={busy || !can} onClick={async () => {
          setBusy(true)
          try { const x = await generateMonthSummary(k); qc.setQueryData(["b", book.id, "monthly_summaries", k], x); if (x.local) toast.warning("Resumen sin IA", { description: "Activa un proveedor de IA para un análisis completo." }) } catch (e) { toast.error((e as Error).message) }
          setBusy(false)
        }}>{busy ? <Spinner /> : <WandSparkles />}{busy ? "Analizando el mes…" : r ? "Actualizar" : "Generar resumen"}</Button>
      </div>
      {!r ? <p className="text-sm text-muted-foreground">La IA revisa tus gastos del mes, los compara con el mes anterior y te da una recomendación concreta.</p> : (
        <>
          <div><h3 className="text-lg font-semibold">{r.titular}</h3><p>{r.resumen}</p></div>
          <div className="grid gap-4 md:grid-cols-3">
            {cols.map(([t, I, l]) => (
              <div key={t}><p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><I className="size-4" />{t}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">{l?.length ? l.map((x) => <li key={x}>{x}</li>) : <li className="text-muted-foreground">Nada destacado</li>}</ul></div>
            ))}
          </div>
          <Notice tone="ok" title="Para el próximo mes">{r.recomendacion}</Notice>
        </>
      )}
    </Card>
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
      <Card className="flex-row flex-wrap items-end gap-3 p-4 shadow-card ring-0">
        <div className="grid w-full gap-1 sm:w-60"><span className="text-sm font-medium">Mes</span><Combobox value={k} onChange={setK} options={months(today)} /></div>
        <Button onClick={pdf} disabled={pdfBusy}>{pdfBusy ? <Spinner /> : <Download />} Descargar PDF</Button>
        <Button variant="outline" onClick={csv}><FileSpreadsheet /> Movimientos en Excel (CSV)</Button>
      </Card>
      <SummaryCard k={k} />
      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="gap-2 p-5 shadow-card ring-0">
          <h2 className="font-semibold">Balance: lo que tengo y lo que debo</h2>
          <table className="w-full text-sm"><tbody>
            {activos.map(([l, v], i) => <Row key={`a${i}`} l={l} v={v} />)}
            <Row l="Inversiones" v={R.T.xi} /><Row l="Lo que me deben" v={R.T.xc} /><Row l="Total que tengo" v={R.T.A} cls="text-success" bold />
            {pasivos.map(([l, v], i) => <Row key={`p${i}`} l={l} v={v} />)}
            <Row l="Créditos y préstamos" v={R.T.xp} /><Row l="Total que debo" v={R.T.P} cls="text-danger" bold />
          </tbody><tfoot><Row l="Patrimonio" v={R.T.pat} bold /></tfoot></table>
        </Card>
        <Card className="gap-2 p-5 shadow-card ring-0">
          <h2 className="font-semibold">Resultado del mes</h2>
          <table className="w-full text-sm"><tbody>
            <Row l="Ingresos" v={R.ing} cls="text-success" /><Row l="Necesidades" v={R.grp.n} /><Row l="Gustos" v={R.grp.g} />
            <Row l="Otros gastos" v={R.grp.x + R.grp.a} /><Row l="Cuotas de créditos" v={R.cuo} /><Row l="Suscripciones" v={R.sub} />
          </tbody><tfoot><Row l={R.res >= 0 ? "Te sobró" : "Te faltó"} v={R.res} cls={R.res >= 0 ? "text-success" : "text-danger"} bold /></tfoot></table>
          {top.length > 0 && (
            <div className="mt-3 grid gap-2">
              {top.map(([c, v]) => (
                <div key={c} className="grid gap-1">
                  <div className="flex items-center gap-2 text-sm"><Icon name={catIcon(c)} className="size-4 text-muted-foreground" /><span className="flex-1">{catName(c)}</span><Money value={v} className="font-medium" /></div>
                  <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-navy dark:bg-lime" style={{ width: `${Math.max(2, (v / top[0][1]) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lightbulb className="size-3.5" /> El PDF incluye además la salud financiera, los préstamos y todos los gastos por categoría.</p>
    </div>
  )
}
