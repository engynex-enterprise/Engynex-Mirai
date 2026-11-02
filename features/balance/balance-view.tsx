"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { Segmented } from "@/components/mirai/choice-cards"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { IconAction } from "@/components/mirai/list-row"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useCanEdit } from "@/components/app/app-context"
import { useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { conv, quincena, totales, type FlowItem } from "@/lib/domain"
import { fmtDate, fmtMonth, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { useBookData } from "@/features/book/use-book-data"
import { AssetForm, PUC } from "./asset-form"
import { PatrimonioCard } from "@/features/patrimonio/patrimonio-card"

type Line = { id?: string; table?: "assets" | "liabilities"; icon: string; n: string; s: string; v: number; href?: string; row?: Row<"assets"> | Row<"liabilities"> }

/** Una columna de la cuenta T (DEBE / HABER). */
function TColumn({ title, sub, lines, total, empty, onDelete, canEdit }: { title: string; sub: string; lines: Line[]; total: number; empty: string; onDelete: (l: Line) => void; canEdit: boolean }) {
  return (
    <div className="grid content-start gap-1">
      <div className="border-b-[3px] border-foreground pb-2">
        <p className="font-semibold">{title}</p>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{sub}</p>
      </div>
      {!lines.length ? <p className="py-4 text-sm text-muted-foreground">{empty}</p> : lines.map((l, i) => (
        <div key={l.id ?? i} className="grid grid-cols-[2rem_1fr_auto_auto] items-center gap-2 border-b border-dotted py-2">
          <EntityLogo name={l.row ? l.n : null} icon={l.icon} seed={l.n} size={32} />
          <span className="grid min-w-0">
            <span className="truncate font-medium">{l.href ? <Link href={l.href} className="hover:text-link">{l.n}</Link> : l.n}</span>
            <span className="truncate text-xs text-muted-foreground">{l.s}</span>
          </span>
          <Money value={l.v} className="text-right font-semibold" />
          {l.row && canEdit ? <IconAction a={{ label: `Eliminar ${l.n}`, tip: "Eliminar", icon: "trash-2", destructive: true, onClick: () => onDelete(l) }} /> : <span className="w-9" />}
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t-2 border-foreground pt-2 font-bold"><span>Total</span><Money value={total} /></div>
    </div>
  )
}

function FlowColumn({ title, sub, items, empty }: { title: string; sub: string; items: FlowItem[]; empty: string }) {
  return (
    <div className="grid content-start gap-1">
      <div className="border-b-[3px] border-foreground pb-2"><p className="font-semibold">{title}</p><p className="text-xs tracking-wide text-muted-foreground uppercase">{sub}</p></div>
      {!items.length ? <p className="py-4 text-sm text-muted-foreground">{empty}</p> : items.map((x, i) => (
        <div key={i} className={cn("grid grid-cols-[2rem_1fr_auto] items-center gap-2 border-b border-dotted py-2", x.paid && "opacity-70")}>
          <EntityLogo icon={x.icon} seed={x.n} size={32} />
          <span className="grid min-w-0">
            <span className="flex items-center gap-1.5 truncate font-medium">{x.n}{x.paid && <StatusPill tone="pagado" check hint="Ya está registrado como pagado o recibido.">Hecho</StatusPill>}</span>
            <span className="truncate text-xs text-muted-foreground">{fmtDate(x.fecha, { year: false })} · {x.s}</span>
          </span>
          <Money value={x.v} className="text-right font-semibold" />
        </div>
      ))}
    </div>
  )
}

export function BalanceView() {
  const canEdit = useCanEdit()
  const today = todayISO()
  const [tab, setTab] = useQueryState("tab", parseAsString.withDefault("general"))
  const [nuevo, setNuevo] = useNewParam()
  const [ym, setYm] = useState(today.slice(0, 7))
  const { data: book, isPending } = useBookData()
  const delA = useSoftDelete("assets", "Eliminado")
  const delP = useSoftDelete("liabilities", "Eliminado")

  const data = useMemo(() => {
    if (!book) return null
    const trm = book.settings.trm
    const T = totales(book, today)
    const sub = (x: { currency?: string | null; valor: number; cod?: string }) =>
      x.currency && x.currency !== "COP" ? `${x.currency} ${new Intl.NumberFormat("es-CO").format(x.valor)} × $${new Intl.NumberFormat("es-CO").format(trm[x.currency] ?? 0)}` : `PUC ${x.cod}`
    const act: Line[] = [
      ...(book.assets as unknown as Row<"assets">[]).map((a) => ({ id: a.id, table: "assets" as const, row: a, icon: PUC[a.cod]?.[1] ?? "tag", n: a.nombre, s: sub({ ...a, valor: Number(a.valor) }), v: conv(Number(a.valor), a.currency, trm) })),
      ...(T.xi ? [{ icon: "trending-up", n: "Inversiones", s: "Se calcula solo desde Inversiones", v: T.xi, href: "/inversiones" }] : []),
      ...(T.xc ? [{ icon: "hand-coins", n: "Lo que me deben", s: "Se calcula solo desde Me deben", v: T.xc, href: "/me-deben" }] : []),
    ]
    const pas: Line[] = [
      ...(book.liabilities as unknown as Row<"liabilities">[]).map((p) => ({ id: p.id, table: "liabilities" as const, row: p, icon: PUC[p.cod]?.[1] ?? "tag", n: p.nombre, s: sub({ ...p, valor: Number(p.valor) }), v: conv(Number(p.valor), p.currency, trm) })),
      ...(T.xp ? [{ icon: "landmark", n: "Créditos y préstamos", s: "Se calcula solo desde Le debo", v: T.xp, href: "/le-debo" }] : []),
      ...(T.xt ? [{ icon: "credit-card", n: "Tarjetas de crédito", s: "Se calcula solo desde Tarjetas", v: T.xt, href: "/tarjetas" }] : []),
    ]
    const [y, m] = ym.split("-").map(Number)
    const q = tab === "general" ? null : quincena(book, y, m - 1, tab as "q1" | "q2" | "mes", today)
    return { T, act, pas, q }
  }, [book, today, tab, ym])

  if (isPending || !data) return <PageSkeleton kpis={3} />
  const move = (d: number) => { const [y, m] = ym.split("-").map(Number); const x = new Date(y, m - 1 + d, 1); setYm(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`) }
  const del = (l: Line) => (l.table === "assets" ? delA : delP).mutate(l.row as never)

  return (
    <div className="grid gap-6">
      <PageHeader id="balance" description="Mira lo que tienes y lo que debes, o cuánto entra y sale en cada quincena del mes."
        actions={canEdit && tab === "general" && <Button onClick={() => setNuevo(true)}><Plus /> Agregar cuenta o bien</Button>} />
      <Segmented value={tab} onChange={setTab} items={[
        { value: "general", label: "Lo que tengo y lo que debo", icon: "scale" }, { value: "q1", label: "1ª quincena", icon: "calendar" },
        { value: "q2", label: "2ª quincena", icon: "calendar" }, { value: "mes", label: "Mes completo", icon: "calendar-days" },
      ]} />

      {tab === "general" && <PatrimonioCard activos={data.T.A} deudas={data.T.P} />}

      {tab === "general" ? (
        <Card className="shadow-card ring-0">
          <CardContent className="grid gap-6">
            <div className="grid gap-8 md:grid-cols-2">
              <TColumn title="Lo que tengo" sub="Activos · Debe" lines={data.act} total={data.T.A} empty="Agrega tus cuentas, efectivo y bienes." onDelete={del} canEdit={canEdit} />
              <TColumn title="Lo que debo" sub="Pasivos · Haber" lines={data.pas} total={data.T.P} empty="Sin deudas registradas." onDelete={del} canEdit={canEdit} />
            </div>
            <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg p-4", data.T.pat >= 0 ? "bg-success-soft" : "bg-danger-soft")}>
              <div><p className="font-semibold">Patrimonio</p><p className="text-sm text-muted-foreground">Lo que tengo − lo que debo</p></div>
              <Money value={data.T.pat} className={cn("text-[22px] font-extrabold", data.T.pat >= 0 ? "text-success" : "text-danger")} />
            </div>
            <p className="text-sm text-muted-foreground">Tus gastos del mes (arriendo, mercado, servicios) no van aquí: regístralos en Gastos fijos o Gastos. Aquí solo van bienes que tienes y deudas que debes.</p>
          </CardContent>
        </Card>
      ) : data.q && (
        <>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Mes anterior" onClick={() => move(-1)}><ChevronLeft /></Button>
            <p className="min-w-44 text-center font-semibold capitalize">{fmtMonth(ym)}</p>
            <Button variant="outline" size="icon" aria-label="Mes siguiente" onClick={() => move(1)}><ChevronRight /></Button>
            <p className="ml-2 text-sm text-muted-foreground">Del {fmtDate(data.q.a, { year: false })} al {fmtDate(data.q.b, { year: false })}</p>
          </div>
          <KpiGrid cols={3}>
            <Kpi icon="arrow-down-to-line" tone="income" label="Entra" value={<Money value={data.q.E} />} valueClassName="text-success" />
            <Kpi icon="arrow-up-from-line" tone="expense" label="Sale" value={<Money value={data.q.Sa} />} valueClassName="text-danger" />
            <Kpi icon="wallet" tone={data.q.disp >= 0 ? "green" : "red"} label={data.q.disp >= 0 ? "Te sobra" : "Te falta"} value={<Money value={Math.abs(data.q.disp)} />} valueClassName={data.q.disp >= 0 ? "text-success" : "text-danger"} sub="Disponible del periodo" />
          </KpiGrid>
          <Card className="shadow-card ring-0">
            <CardContent className="grid gap-8 md:grid-cols-2">
              <FlowColumn title="Entradas" sub="Debe" items={data.q.ent} empty="Sin entradas. Registra tus ingresos en Mi dinero › Ingresos." />
              <FlowColumn title="Salidas" sub="Haber" items={data.q.sal} empty="Sin salidas en este periodo." />
            </CardContent>
          </Card>
        </>
      )}
      <AssetForm open={nuevo} onOpenChange={(o) => !o && setNuevo(false)} />
    </div>
  )
}
