"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, ShoppingBag, Trash2, Wallet } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { Notice } from "@/components/mirai/notice"
import { EmptyState } from "@/components/mirai/empty-state"
import { FormField } from "@/components/mirai/field"
import { Segmented } from "@/components/mirai/choice-cards"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { apiDeleteRow, apiRestoreRow, apiRows } from "@/lib/api/book-rows"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { ListRow } from "@/components/mirai/list-row"
import { StatusPill } from "@/components/mirai/status-pill"
import { DataTable } from "@/components/mirai/data-table"
import { brandFor } from "@/lib/brands"
import { annuity, compraEstado, deudaTarjeta, proxDia, tarjetaPagoMes, tarjetasDeuda, type CardConPagos, type PurchaseState } from "@/lib/domain"
import { fmtDate, fmtMoney, fmtPct, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { useBookData } from "@/features/book/use-book-data"
import { usePaymentMethods } from "@/features/catalogs/hooks"
import { CardForm, PayCardForm, PurchaseForm } from "./card-forms"

type CardRow = Row<"credit_cards"> & { purchases: Row<"card_purchases">[]; pagos?: Row<"card_payments">[] }
type Compra = { p: Row<"card_purchases">; e: PurchaseState }
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export function CardsView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const today = todayISO()
  // ?nuevo=compra y ?nuevo=pago (menú Agregar y ⌘K) abren la compra o el pago de la tarjeta elegida; sin tarjetas, la nueva tarjeta.
  const [nuevo, setNuevo, nuevoV] = useNewParam()
  const { data: book, isPending } = useBookData()
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<CardRow | null>(null)
  const [buying, setBuying] = useState<CardRow | null>(null)
  const [editBuy, setEditBuy] = useState<{ card: CardRow; p: Row<"card_purchases"> } | null>(null)
  const [paying, setPaying] = useState<CardRow | null>(null)
  const delCompra = useSoftDelete("card_purchases", "Compra eliminada")
  const delPago = useSoftDelete("card_payments", "Pago eliminado")
  const { data: methods = [] } = usePaymentMethods()
  const [confirmDel, setConfirmDel] = useState<CardRow | null>(null)
  const [sim, setSim] = useState({ v: 1200000, t: "2,1" })

  if (isPending || !book) return <PageSkeleton kpis={3} />
  const cards = book.creditCards as unknown as CardRow[]
  const asIn = (c: CardRow) => c as unknown as CardConPagos
  const deuda = tarjetasDeuda(cards.map(asIn), today)
  const pagoMes = cards.reduce((a, c) => a + tarjetaPagoMes(asIn(c), today), 0)
  const cupoTotal = cards.reduce((a, c) => a + Number(c.cupo), 0)
  const uso = cupoTotal ? (deuda / cupoTotal) * 100 : 0
  const card = cards.find((c) => c.id === sel) ?? cards[0]

  const refresh = () => { invalidateBook(qc, bookId, "credit_cards"); invalidateBook(qc, bookId, "card_purchases"); invalidateBook(qc, bookId, "card_payments"); invalidateBook(qc, bookId, "expenses") }
  /** Borra la tarjeta: sus compras vivas a la papelera y la tarjeta (la base se lleva sus pagos y los gastos de esas compras); Deshacer trae solo esas compras. */
  const borrar = async (c: CardRow) => {
    const compras = await apiRows<{ id: string }>(bookId, "card_purchases", { eq: { card_id: c.id }, select: "id" }).catch(() => [])
    for (const p of compras) await apiDeleteRow(bookId, "card_purchases", p.id)
    await apiDeleteRow(bookId, "credit_cards", c.id)
    toast("Tarjeta eliminada", { action: { label: "Deshacer", onClick: async () => {
      await apiRestoreRow(bookId, "credit_cards", c.id)
      for (const p of compras) await apiRestoreRow(bookId, "card_purchases", p.id)
      refresh()
    } } })
    setSel(null)
    refresh()
  }

  const t = +sim.t.replace(",", ".") / 100

  return (
    <div className="grid gap-6">
      <PageHeader id="tarjetas" actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar tarjeta</Button>} />
      <KpiGrid cols={3}>
        <Kpi icon="credit-card" tone="red" label="Debes en tarjetas" value={<Money value={deuda} />} sub={`${cards.length} tarjeta${cards.length === 1 ? "" : "s"}`} />
        <Kpi icon="calendar-clock" tone="amber" label="Pago de este mes" value={<Money value={pagoMes} />} sub="Cuotas que se cobran, menos lo que ya pagaste" />
        <Kpi icon="gauge" tone={uso > 30 ? "red" : "green"} label="Uso del cupo total" info="Qué parte del cupo de tus tarjetas estás usando. Usar menos del 30 % cuida tu historial en las centrales de riesgo." value={fmtPct(uso, 0)} valueClassName={uso > 30 ? "text-danger" : "text-success"} sub="Lo sano: menos del 30 %" />
      </KpiGrid>

      {!cards.length ? (
        <Card className="shadow-card ring-0"><EmptyState iso="tarjetas" title="Aún no tienes tarjetas" description="Agrega tu tarjeta con su cupo, día de corte, día de pago e interés mensual." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar tarjeta</Button>} /></Card>
      ) : card && (() => {
        const ci = asIn(card)
        const d = deudaTarjeta(ci, today)
        const pm = tarjetaPagoMes(ci, today)
        const pagos = (card.pagos ?? []).filter((x) => !x.deleted_at).sort((a, b) => b.fecha.localeCompare(a.fecha))
        const u = Number(card.cupo) ? (d / Number(card.cupo)) * 100 : 0
        return (
          <Card className="shadow-card ring-0">
            <CardHeader className="gap-3">
              {cards.length > 1 && <Segmented value={card.id} onChange={setSel} items={cards.map((c) => ({ value: c.id, label: c.nombre, icon: "credit-card" }))} />}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg"><EntityLogo name={card.nombre} brand={brandFor(book.entities.find((x) => x.id === card.entity_id)?.nombre)} icon="credit-card" seed={card.id} size={36} /> {card.nombre}</CardTitle>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="soft" onClick={() => setBuying(card)}><ShoppingBag /> Registrar compra</Button>
                    <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="Editar tarjeta" onClick={() => setEditing(card)}><Pencil /></Button></TooltipTrigger><TooltipContent>Editar tarjeta</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="Eliminar tarjeta" onClick={() => setConfirmDel(card)}><Trash2 /></Button></TooltipTrigger><TooltipContent>Eliminar tarjeta, sus compras y sus pagos</TooltipContent></Tooltip>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[["Debes en total", <Money key="a" value={d} />], ["Pago de este mes", <Money key="b" value={pm} />], ["Cupo disponible", <Money key="c" value={Math.max(Number(card.cupo) - d, 0)} />], ["Próxima fecha de pago", fmtDate(isoOf(proxDia(card.pago, today)))]].map(([l, v]) => (
                  <div key={l as string} className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-base font-semibold">{v}</p></div>
                ))}
              </div>
              <div className="grid gap-2">
                <div className="flex justify-between text-sm"><span>Uso del cupo</span><b>{fmtPct(u, 0)}</b></div>
                <Progress value={Math.min(100, u)} className={cn("h-3", u > 70 ? "[&>div]:bg-danger" : u > 30 ? "[&>div]:bg-[#F7B928]" : "[&>div]:bg-lime")} />
                <Notice tone={u > 30 ? "warn" : "ok"} title={u > 30 ? "Lo ideal es no pasar del 30 %" : "¡Bien!"}>
                  {u > 30 ? "Así cuidas tu historial en las centrales de riesgo." : "Usar menos del 30 % cuida tu historial crediticio."}
                </Notice>
              </div>
              {canEdit && (d > 0.5 || pm > 0.5) && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => setPaying(card)}><Wallet /> Pagar la tarjeta</Button>
                  <span className="text-sm text-muted-foreground">Registra lo que le pagas al banco: la deuda baja y el pago queda en tu flujo. Pagar el total cada mes evita casi todos los intereses.</span>
                </div>
              )}
              {pagos.length > 0 && (
                <div className="grid gap-1">
                  <p className="text-sm font-semibold">Pagos que registraste</p>
                  <ul className="-mx-2 grid">
                    {pagos.slice(0, 6).map((x) => (
                      <ListRow key={x.id} icon="wallet" media={<EntityLogo name="Pago" icon="wallet" seed={x.id} />}
                        title={x.tipo === "total" ? "Pagaste el total" : x.tipo === "minimo" ? "Pagaste el mes" : "Pagaste la tarjeta"}
                        subtitle={[fmtDate(x.fecha), methods.find((m) => m.id === x.payment_method_id)?.nombre].filter(Boolean).join(" · ")}
                        value={<Money value={Number(x.valor)} className="font-bold" />}
                        actions={canEdit ? [{ label: `Eliminar pago del ${fmtDate(x.fecha)}`, tip: "Eliminar este pago", icon: "trash-2", destructive: true, onClick: () => delPago.mutate({ id: x.id, descripcion: `Pago de ${fmtMoney(Number(x.valor))}` }) }] : []} />
                    ))}
                  </ul>
                </div>
              )}
              {card.purchases.length > 0 && (
                <>
                  <DataTable<Compra>
                    bare title="Compras" data={card.purchases.map((p) => ({ p, e: compraEstado(ci, p as never, today) }))} rowKey={(x) => x.p.id} noun={["compra", "compras"]} exportName={`compras-${card.nombre}`}
                    total={{ value: (x) => x.e.saldo, label: "te falta pagar" }}
                    columns={[
                      { id: "fecha", header: "Fecha", sort: (x) => x.p.fecha, csv: (x) => x.p.fecha },
                      { id: "descripcion", header: "Compra", sort: (x) => x.p.descripcion.toLowerCase(), csv: (x) => x.p.descripcion },
                      { id: "valor", header: "Valor", sort: (x) => Number(x.p.valor), csv: (x) => Number(x.p.valor) },
                      { id: "cuotas", header: "Cuotas", sort: (x) => x.e.n, csv: (x) => `${x.e.k} de ${x.e.n}` },
                      { id: "cuota", header: "Cuota mensual", csv: (x) => Math.round(x.e.cuota) },
                      { id: "intereses", header: "Intereses", sort: (x) => x.e.int, csv: (x) => Math.round(x.e.int) },
                      { id: "saldo", header: "Te falta", sort: (x) => x.e.saldo, csv: (x) => Math.round(x.e.saldo) },
                    ]}
                    initialSort={{ id: "fecha", dir: "desc" }}
                    search={{ placeholder: "Buscar compra", text: (x) => x.p.descripcion }}
                    views={[{ id: "todas", label: "Todas" }, { id: "pend", label: "Por pagar", match: (x) => x.e.pendiente }, { id: "pagadas", label: "Pagadas", match: (x) => !x.e.pendiente }]}
                    filters={[
                      { id: "tipo", label: "Cuotas", options: [{ value: "1", label: "A una cuota" }, { value: "n", label: "Diferidas" }], match: (x, v) => (v === "1") === (x.e.n === 1) },
                      { id: "fecha", label: "Fecha", kind: "dates", value: (x) => x.p.fecha },
                      { id: "valor", label: "Valor", kind: "range", money: true, value: (x) => Number(x.p.valor) },
                    ]}
                    item={({ p, e }) => {
                      const cat = book.categories.find((c) => c.id === p.category_id)
                      return (
                        <ListRow key={p.id} icon="shopping-bag" className={cn(!e.pendiente && "opacity-70")}
                          media={<EntityLogo name={p.descripcion} icon={cat?.icon ?? "shopping-bag"} seed={cat?.id ?? p.descripcion} />}
                          title={p.descripcion}
                          badges={!e.pendiente ? <StatusPill tone="pagado" check hint="Ya no tiene cuotas por pagar.">pagada</StatusPill>
                            : e.n > 1 ? <StatusPill tone="info" hint={`La pagas en ${e.n} cuotas mensuales. Cada cuota trae intereses al ${fmtPct(Number(card.tasa), 1)} mensual.`}>diferida</StatusPill> : null}
                          subtitle={`${fmtDate(p.fecha)} · cuota ${e.k} de ${e.n} · cuota mensual ${fmtMoney(e.cuota)}`}
                          extra={e.int > 0.5 ? <span className="text-warning">Intereses en total {fmtMoney(e.int)}</span> : "Sin intereses si pagas a tiempo"}
                          value={<span className="grid text-right"><Money value={e.saldo} className="font-bold" /><span className="text-xs text-muted-foreground">de <Money value={Number(p.valor)} /></span></span>}
                          actions={canEdit ? [
                            { label: `Editar compra ${p.descripcion}`, tip: "Editar", icon: "pencil", onClick: () => setEditBuy({ card, p }) },
                            { label: `Eliminar compra ${p.descripcion}`, tip: p.expense_id ? "Eliminar (también sale de tus gastos)" : "Eliminar", icon: "trash-2", destructive: true, onClick: () => delCompra.mutate(p) },
                          ] : []} />
                      )
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Suponemos que pagas al menos el mínimo cada mes. Las compras a una sola cuota no cobran intereses si pagas a tiempo.</p>
                </>
              )}
            </CardContent>
          </Card>
        )
      })()}

      <Card className="shadow-card ring-0">
        <CardHeader><CardTitle className="text-base">¿A cuántas cuotas difiero una compra?</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Valor de la compra" htmlFor="sim-v"><MoneyInput id="sim-v" value={sim.v} onChange={(v) => setSim((s) => ({ ...s, v }))} /></FormField>
            <FormField label="Interés mensual (%)" htmlFor="sim-t" tip="Aparece en tu extracto como “tasa mes vencido” o “MV”. En Colombia suele estar cerca del 2 % mensual.">
              <Input id="sim-t" className="h-11" inputMode="decimal" value={sim.t} onChange={(e) => setSim((s) => ({ ...s, t: e.target.value }))} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[1, 3, 6, 12, 24, 36].map((n) => { const c = annuity(sim.v, n > 1 ? t : 0, n); return (
              <div key={n} className="grid gap-0.5 rounded-lg border p-3 text-sm">
                <b>{n} cuota{n > 1 ? "s" : ""}</b>
                <span>Cuota <Money value={c} /></span>
                <span className={cn(n > 1 ? "text-warning" : "text-success")}>Intereses <Money value={c * n - sim.v} /></span>
                <span className="text-muted-foreground">Total <Money value={c * n} /></span>
              </div>) })}
          </div>
        </CardContent>
      </Card>

      <CardForm open={(nuevo && !(card && (nuevoV === "compra" || nuevoV === "pago"))) || !!editing} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditing(null) } }} card={editing} onSaved={(id) => setSel(id)} />
      <PurchaseForm card={buying ?? editBuy?.card ?? (nuevoV === "compra" ? card ?? null : null)} purchase={editBuy?.p ?? null} onOpenChange={(o) => { if (!o) { setBuying(null); setEditBuy(null); if (nuevoV === "compra") setNuevo(false) } }} />
      <PayCardForm card={paying ?? (nuevoV === "pago" ? card ?? null : null)} onOpenChange={(o) => { if (!o) { setPaying(null); if (nuevoV === "pago") setNuevo(false) } }} />
      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar tarjeta?</AlertDialogTitle><AlertDialogDescription>Se borrará la tarjeta con sus compras, sus pagos y los gastos que quedaron de esas compras. Podrás deshacerlo durante unos segundos.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-danger text-white hover:bg-danger/90" onClick={() => confirmDel && borrar(confirmDel)}>Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
