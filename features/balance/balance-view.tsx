"use client"

import { useMemo, useState } from "react"
import { parseAsString, useQueryState } from "nuqs"
import Link from "next/link"
import { Download, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { Segmented } from "@/components/mirai/choice-cards"
import { SectionTitle } from "@/components/mirai/panel"
import { Notice } from "@/components/mirai/notice"
import { IconButton } from "@/components/mirai/tip"
import { toast } from "@/components/mirai/toast"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useCanEdit } from "@/components/app/app-context"
import { useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { hallazgosBalance } from "@/lib/domain/balance"
import { ESTADOS, GRUPOS, MODULOS, estadoIntegral, flujoIntegral, partesEstado, periodo, snapshotMes, type LineaEstado, type Modulo, type Mov } from "@/lib/domain/flujo-integral"
import type { SaldoCuenta } from "@/lib/domain/cuentas"
import { fmtDate, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { useBookData } from "@/features/book/use-book-data"
import { AssetForm, PUC, type AssetEdit } from "./asset-form"
import { ComposicionCard, EstadosLeyenda, FlujoColumna, HallazgosBalance, MesCard, MonthNav, TColumn, type Line } from "./balance-parts"
import { useIntegralExtras } from "./use-integral"
import { PatrimonioCard } from "@/features/patrimonio/patrimonio-card"

type Tab = "general" | "q1" | "q2" | "mes" | "anio"
type Filtro = "todo" | "pendiente" | "vencido" | "hecho"

/** Descarga un CSV (separado por ; y con BOM para que Excel lea las tildes). */
function downloadCsv(name: string, rows: (string | number)[][]) {
  const txt = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n")
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv;charset=utf-8" }))
  a.download = `${name}-${todayISO()}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
  toast.success("Balance exportado", { description: "Ábrelo con Excel o Google Sheets." })
}

const PERIODO: Record<Exclude<Tab, "general">, string> = { q1: "1ª quincena", q2: "2ª quincena", mes: "Mes completo", anio: "Año" }
const ORDEN_GRUPO = Object.keys(GRUPOS)
const FILTROS: Record<Filtro, (x: Mov) => boolean> = {
  todo: () => true, pendiente: (x) => x.estado === "programado" || x.estado === "estimado", vencido: (x) => x.estado === "vencido", hecho: (x) => x.estado === "hecho",
}

export function BalanceView() {
  const canEdit = useCanEdit()
  const today = todayISO()
  const [tabRaw, setTab] = useQueryState("tab", parseAsString.withDefault("general"))
  const tab = (["general", "q1", "q2", "mes", "anio"].includes(tabRaw) ? tabRaw : "general") as Tab
  const [modRaw, setMod] = useQueryState("modulo", parseAsString.withDefault("todos"))
  const [filtro, setFiltro] = useState<Filtro>("todo")
  const [nuevo, setNuevo] = useNewParam()
  const [edit, setEdit] = useState<AssetEdit | null>(null)
  const [ym, setYm] = useState(today.slice(0, 7))
  const { data: book, isPending } = useBookData()
  const X = useIntegralExtras(book, today)
  const delA = useSoftDelete("assets", "Eliminado")
  const delP = useSoftDelete("liabilities", "Eliminado")

  const data = useMemo(() => {
    if (!book) return null
    const trm = book.settings.trm
    const E = estadoIntegral(book, today, X)
    const tengoP = partesEstado(E.tengo)
    const deboP = partesEstado(E.debo)
    const C = { T: { ...E.T, P: E.P, pat: E.pat }, liquidez: E.liquidez, tengo: tengoP, debo: deboP }
    const sub = (x: { currency?: string | null; valor: number; cod?: string }) =>
      x.currency && x.currency !== "COP" ? `${x.currency} ${new Intl.NumberFormat("es-CO").format(x.valor)} × $${new Intl.NumberFormat("es-CO").format(trm[x.currency] ?? 0)}` : PUC[x.cod ?? ""]?.[0] ?? `PUC ${x.cod}`
    const toLine = (l: LineaEstado): Line => {
      const row = l.ref ? ((l.ref.table === "assets" ? book.assets : book.liabilities) as unknown as (Row<"assets"> & { cuenta?: SaldoCuenta })[]).find((r) => r.id === l.ref!.id) : undefined
      const c = row?.cuenta
      const s = c?.vivo ? `${PUC[row!.cod]?.[0] ?? "Cuenta"} · se actualiza con tus movimientos${c.movs.length ? ` (${c.movs.length})` : ""}` : row ? sub({ ...row, valor: Number(row.valor) }) : l.s
      return { id: l.k, table: l.ref?.table, row, icon: row ? PUC[row.cod]?.[1] ?? l.icon : l.icon, n: l.n, s, v: l.v, href: l.href, grupo: GRUPOS[l.grupo].label, estimado: l.estimado, vivo: !!c?.vivo }
    }
    const byGrupo = (a: LineaEstado, b: LineaEstado) => ORDEN_GRUPO.indexOf(a.grupo) - ORDEN_GRUPO.indexOf(b.grupo) || b.v - a.v
    const act = [...E.tengo].sort(byGrupo).map(toLine)
    const pas = [...E.debo].sort(byGrupo).map(toLine)
    const [y, m] = ym.split("-").map(Number)
    const P = periodo(book, tab === "general" ? "mes" : tab, y, m - 1)
    const F = flujoIntegral(book, P, today, X)
    const [ty, tm] = today.split("-").map(Number)
    const mesHoy = P.tipo === "mes" && ym === today.slice(0, 7) ? F : flujoIntegral(book, periodo(book, "mes", ty, tm - 1), today, X)
    const H = hallazgosBalance(book, today, mesHoy, C)
    const vivas = book.assets.filter((a) => (a as { cuenta?: SaldoCuenta }).cuenta?.vivo).length
    const manuales = book.assets.filter((a) => /^11/.test(String(a.cod)) && !(a as { cuenta?: SaldoCuenta }).cuenta?.vivo).length
    return { E, C, act, pas, F, H, snap: snapshotMes(book, today, X), vivas, manuales }
  }, [book, today, tab, ym, X])

  if (isPending || !data) return <PageSkeleton kpis={3} />
  const { E, C, F } = data
  const t = F.tot
  const step = tab === "anio" ? 12 : 1
  const move = (d: number) => { const [y, m] = ym.split("-").map(Number); const x = new Date(y, m - 1 + d * step, 1); setYm(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`) }
  const del = (l: Line) => (l.table === "assets" ? delA : delP).mutate(l.row as never)
  const onEdit = (l: Line) => l.row && l.table && setEdit({ table: l.table, row: { ...(l.row as AssetEdit["row"]), valor: Number(l.row.valor) } })
  const mod = (modRaw in MODULOS ? modRaw : "todos") as Modulo | "todos"
  const vis = F.movs.filter((x) => (mod === "todos" || x.modulo === mod) && FILTROS[filtro](x))

  const exportar = () => {
    if (tab === "general") {
      downloadCsv("balance", [
        ["Lado", "Grupo", "Nombre", "Detalle", "Valor (COP)"],
        ...data.act.map((l) => ["Lo que tengo", l.grupo ?? "", l.n, l.s, Math.round(l.v)]),
        ["Lo que tengo", "", "Total", "", Math.round(E.A)],
        ...data.pas.map((l) => ["Lo que debo", l.grupo ?? "", l.n, l.estimado ? `${l.s} (estimado)` : l.s, Math.round(l.v)]),
        ["Lo que debo", "", "Total", "", Math.round(E.P)],
        ["Patrimonio", "", "Lo que tengo − lo que debo", "", Math.round(E.pat)],
      ])
    } else {
      downloadCsv(`balance-${PERIODO[tab].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]|[ªº]/g, "").replace(/\s+/g, "-")}-${tab === "anio" ? ym.slice(0, 4) : ym}`, [
        ["Tipo", "Fecha", "Módulo", "Categoría", "Concepto", "Detalle", "Estado", "Valor (COP)"],
        ...vis.map((x) => [x.dir === "entra" ? "Entrada" : x.clase === "ahorro" ? "Ahorro" : "Salida", x.fecha, MODULOS[x.modulo].label, x.cat, x.n, x.s, x.supuesto ? "Ya pasó" : ESTADOS[x.estado].label, Math.round(x.v)]),
        ["Total", "", "", "", "Entra", "", "", Math.round(t.entra)],
        ["Total", "", "", "", "Sale", "", "", Math.round(t.sale)],
        ["Total", "", "", "", "Ahorro", "", "", Math.round(t.ahorro)],
        ["Resultado", "", "", "", t.queda >= 0 ? "Te sobra" : "Te falta", "", "", Math.round(t.queda)],
      ])
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader id="balance" description="Todo lo que entra y sale de cada módulo (ingresos, gastos, fijos, tarjetas, deudas, impuestos, ahorro…), lo que tienes y lo que debes."
        actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar cuenta o bien</Button>} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented value={tab} onChange={setTab} items={[
          { value: "general", label: "Lo que tengo y lo que debo", icon: "scale" }, { value: "q1", label: "1ª quincena", icon: "calendar" },
          { value: "q2", label: "2ª quincena", icon: "calendar" }, { value: "mes", label: "Mes completo", icon: "calendar-days" }, { value: "anio", label: "Año", icon: "calendar-range" },
        ]} />
        <Button variant="outline" size="sm" onClick={exportar}><Download /> Exportar</Button>
      </div>

      {tab === "general" ? (
        <>
          <KpiGrid cols={3}>
            <Kpi icon="wallet" tone="green" label="Lo que tengo" value={<Money value={E.A} />} sub={<>Disponible ya: <Money value={E.liquidez} /></>}
              info="Todo lo que tienes: plata en cuentas y efectivo, lo que llevas en tus metas y tu fondo de emergencia (si no está dentro de una cuenta), casa, carro, inversiones y lo que te deben." />
            <Kpi icon="hand-coins" tone="red" label="Lo que debo" value={<Money value={E.P} />} valueClassName={E.P ? "text-danger" : undefined}
              sub={E.A > 0 ? `Es el ${Math.round((E.P / E.A) * 100)} % de lo que tienes` : "Créditos, tarjetas, impuestos y otras deudas"} info="Todas tus deudas hoy: créditos y préstamos de Le debo, tarjetas de crédito, impuestos que ya debes (estimados) y otras deudas." />
            <Kpi icon="scale" tone={E.pat >= 0 ? "brand" : "red"} label="Patrimonio" value={<Money value={E.pat} />} valueClassName={E.pat >= 0 ? "text-success" : "text-danger"}
              sub="Lo que tengo − lo que debo" info="Si hoy vendieras todo lo que tienes y pagaras todas tus deudas, esto es lo que te quedaría. Si crece mes a mes, vas bien." />
          </KpiGrid>
          <p className="-mt-2 text-sm text-muted-foreground" data-money>
            {E.A === 0 && E.P === 0 ? "Agrega tus cuentas y bienes para ver tu patrimonio." : E.pat >= 0
              ? <>Si hoy vendieras todo y pagaras todas tus deudas, te quedarían <b className="text-foreground"><Money value={E.pat} /></b>.</>
              : <>Aunque vendieras todo, te faltarían <b className="text-danger"><Money value={-E.pat} /></b> para pagar todas tus deudas.</>}
            {E.impuestos > 0 && <> Lo que debes incluye <Money value={E.impuestos} /> de impuestos que vienen (estimados).</>}
          </p>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <MesCard q={F} ym={ym} onMove={move} onDetalle={() => setTab("mes")} canEdit={canEdit} />
            <HallazgosBalance list={data.H} onAgregar={() => setNuevo(true)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ComposicionCard tengo={C.tengo} debo={C.debo} A={E.A} P={E.P} />
            <PatrimonioCard activos={data.snap.activos} deudas={data.snap.deudas} />
          </div>

          <Card className="shadow-card ring-0">
            <CardContent className="grid gap-6">
              <SectionTitle icon="scale" info="La cuenta T pone a un lado lo que tienes (activos) y al otro lo que debes (pasivos), con cada cuenta, inversión, préstamo, tarjeta e impuesto. Toca una cuenta tuya para actualizar su valor; lo demás se calcula solo desde su sección.">Cuenta T: el detalle</SectionTitle>
              <div className="grid gap-8 md:grid-cols-2">
                <TColumn title="Lo que tengo" sub="Activos · Debe" lines={data.act} total={E.A} empty="Agrega tus cuentas, efectivo y bienes." onDelete={del} onEdit={onEdit} canEdit={canEdit} />
                <TColumn title="Lo que debo" sub="Pasivos · Haber" lines={data.pas} total={E.P} empty="Sin deudas registradas." onDelete={del} onEdit={onEdit} canEdit={canEdit} />
              </div>
              <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg p-4", E.pat >= 0 ? "bg-success-soft" : "bg-danger-soft")}>
                <div><p className="font-semibold">Patrimonio</p><p className="text-sm text-muted-foreground">Lo que tengo − lo que debo</p></div>
                <Money value={E.pat} className={cn("text-[22px] font-extrabold", E.pat >= 0 ? "text-success" : "text-danger")} />
              </div>
              <p className="text-sm text-muted-foreground">
                {data.vivas > 0 ? "Las cuentas que dicen «se actualiza con tus movimientos» suben y bajan solas con lo que registras con sus medios de pago; tócalas para ver sus movimientos o cuadrarlas con tu banco. " : ""}
                {data.manuales > 0 ? "En las demás cuentas toca su nombre y escribe el saldo que ves en tu banco (o activa que el saldo se actualice solo). " : ""}
                Tus metas y tu fondo de emergencia suman como ahorro apartado, salvo que digas en qué cuenta está esa plata. Los créditos, tarjetas, inversiones, préstamos e impuestos se actualizan solos desde su sección.
              </p>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <MonthNav ym={ym} label={tab === "anio" ? `Año ${ym.slice(0, 4)}` : undefined} onMove={move}>
            <p className="text-sm text-muted-foreground sm:ml-2">Del {fmtDate(F.a, { year: tab === "anio" })} al {fmtDate(F.b, { year: tab === "anio" })}</p>
          </MonthNav>
          <KpiGrid>
            <Kpi icon="arrow-down-to-line" tone="income" label="Entra" value={<Money value={t.entra} />} valueClassName="text-success" sub={`${F.ent.length} entrada${F.ent.length === 1 ? "" : "s"}`}
              info="Ingresos (en su fecha de pago), ingresos extra, primas, cuotas que te pagan y préstamos que te dieron." />
            <Kpi icon="arrow-up-from-line" tone="expense" label="Sale" value={<Money value={t.sale} />} valueClassName="text-danger"
              sub={F.nGastos ? <>Incluye <Money value={F.gastado} /> de {F.nGastos} gasto{F.nGastos === 1 ? "" : "s"}</> : "Fijos, cuotas, tarjetas, impuestos y gastos"}
              info="Gastos fijos, suscripciones, cuotas de tus deudas, el pago de tus tarjetas, impuestos, mesadas, los gastos que registraste y, si el periodo no ha terminado, lo que te falta por gastar según tu presupuesto. Cada peso cuenta una sola vez." />
            <Kpi icon="piggy-bank" tone="blue" label="Ahorras" value={<Money value={t.ahorro} />} sub="Metas, fondo e inversiones"
              info="Plata que apartas para tus metas, tu fondo de emergencia o inversiones. No es un gasto: sigue siendo tuya." />
            <Kpi icon="wallet" tone={t.queda >= 0 ? "green" : "red"} label={t.queda >= 0 ? "Te sobra" : "Te falta"} value={<Money value={Math.abs(t.queda)} />} valueClassName={t.queda >= 0 ? "text-success" : "text-danger"} sub="Disponible del periodo"
              info="Entra − sale − ahorras. Si es positivo, puedes llevarlo a una meta antes de que se gaste." />
          </KpiGrid>
          {F.momento === "pasado" && <Notice tone="info" title="Este periodo ya terminó">Cuenta lo que registraste y lo que ya pasó; ya no se estima lo que faltaba por gastar.</Notice>}
          {(t.vencidoSale > 0 || t.vencidoEntra > 0 || t.pendienteSale > 0 || t.pendienteEntra > 0) && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-money>
              {[
                { k: "Por recibir", v: t.pendienteEntra, c: "text-success", f: "pendiente" as const },
                { k: "Por pagar", v: t.pendienteSale, c: "text-foreground", f: "pendiente" as const },
                { k: "Vencido por cobrar", v: t.vencidoEntra, c: "text-warning", f: "vencido" as const },
                { k: "Vencido por pagar", v: t.vencidoSale, c: "text-danger", f: "vencido" as const },
              ].map((x) => (
                <button key={x.k} type="button" onClick={() => setFiltro(filtro === x.f ? "todo" : x.f)} className={cn("grid gap-0.5 rounded-lg bg-card p-3 text-left shadow-card hover:bg-hover", filtro === x.f && "ring-2 ring-brand/40")}>
                  <span className="text-xs font-medium text-muted-foreground">{x.k}</span>
                  <Money value={x.v} className={cn("font-bold", x.v ? x.c : "text-muted-foreground")} />
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={mod} onValueChange={(v) => setMod(v === "todos" ? null : v)}>
              <SelectTrigger className="h-10 w-full rounded-lg sm:w-64" aria-label="Módulo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los módulos</SelectItem>
                {F.porModulo.map((g) => <SelectItem key={g.modulo} value={g.modulo}>{g.label} ({g.n})</SelectItem>)}
              </SelectContent>
            </Select>
            <Segmented value={filtro} onChange={(v) => setFiltro(v as Filtro)} items={[
              { value: "todo", label: "Todo" }, { value: "pendiente", label: "Pendiente" }, { value: "vencido", label: "Vencido" }, { value: "hecho", label: "Hecho" },
            ]} />
          </div>
          <Card className="shadow-card ring-0">
            <CardContent className="grid gap-8 md:grid-cols-2">
              <FlujoColumna title="Entradas" sub="Debe · lo que te llega" movs={vis.filter((x) => x.dir === "entra")} abiertos={tab !== "anio"} empty="Sin entradas con este filtro. Registra tus ingresos en Mi dinero › Ingresos." />
              <FlujoColumna title="Salidas" sub="Haber · lo que pagas y ahorras" movs={vis.filter((x) => x.dir === "sale")} abiertos={tab !== "anio"} empty="Sin salidas con este filtro." />
            </CardContent>
          </Card>
          {F.sinValor.length > 0 && (
            <Notice tone="warn" title={`${F.sinValor.length} impuesto${F.sinValor.length === 1 ? "" : "s"} sin valor en este periodo`}
              action={<Button asChild size="sm" variant="outline"><Link href="/calendario">Escribir el valor</Link></Button>}>
              {F.sinValor.map((x) => `${x.titulo} (${fmtDate(x.fecha, { year: false })})`).join(", ")}. Escribe cuánto es en el Calendario fiscal o registra tus bienes en la Declaración de renta para estimarlo.
            </Notice>
          )}
          <details className="rounded-lg bg-card p-4 text-sm shadow-card">
            <summary className="cursor-pointer font-semibold">¿Cómo se calcula? (en palabras simples)</summary>
            <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-muted-foreground">
              <li><b className="text-foreground">Entra</b>: tus ingresos el día que te pagan, ingresos extra, primas que escribiste en el calendario, las cuotas que te pagan y los préstamos que te dieron.</li>
              <li><b className="text-foreground">Sale</b>: gastos, gastos fijos, suscripciones, cuotas de tus deudas, el pago de tus tarjetas, impuestos, mesadas y lo que prestaste.</li>
              <li><b className="text-foreground">Ahorras</b>: aportes a tus metas, tu fondo de emergencia e inversiones. No es gasto: si sacas del fondo para un imprevisto, se resta.</li>
              <li><b className="text-foreground">Nada se cuenta dos veces</b>: el pago de un gasto fijo sale una vez; lo que compras con tarjeta sale cuando pagas la tarjeta (no también como gasto); la cuota de un préstamo sale en Deudas; el cobro de una suscripción que marcaste como cobrado sale una vez.</li>
            </ul>
            <div className="mt-3"><EstadosLeyenda /></div>
          </details>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="soft"><Link href="/gastos?nuevo=1"><Plus /> Registrar gasto</Link></Button>
              <IconButton label="Ver todos mis gastos" icon="receipt" href="/gastos" variant="outline" />
              <IconButton label="Ver gráficas en el Dashboard" icon="chart-column" href="/dashboard" variant="outline" />
            </div>
          )}
        </>
      )}
      <AssetForm open={nuevo || !!edit} edit={edit} onOpenChange={(o) => { if (!o) { setNuevo(false); setEdit(null) } }} />
    </div>
  )
}
