"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CreditCard, Pencil, Plus, ShoppingBag, Trash2, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { invalidateBook } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { createClient } from "@/utils/supabase/client"
import { annuity, compraEstado, proxDia, tarjetaPagoMes, tarjetasDeuda, type CreditCardIn } from "@/lib/domain"
import { fmtDate, fmtPct, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { useBookData } from "@/features/book/use-book-data"
import { CardForm, PurchaseForm } from "./card-forms"

type CardRow = Row<"credit_cards"> & { purchases: Row<"card_purchases">[] }
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export function CardsView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const today = todayISO()
  const [nuevo, setNuevo] = useNewParam()
  const { data: book, isPending } = useBookData()
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<CardRow | null>(null)
  const [buying, setBuying] = useState<CardRow | null>(null)
  const [confirmDel, setConfirmDel] = useState<CardRow | null>(null)
  const [sim, setSim] = useState({ v: 1200000, t: "2,1" })

  if (isPending || !book) return <PageSkeleton kpis={3} />
  const cards = book.creditCards as unknown as CardRow[]
  const asIn = (c: CardRow) => c as unknown as CreditCardIn
  const deuda = tarjetasDeuda(cards.map(asIn), today)
  const pagoMes = cards.reduce((a, c) => a + tarjetaPagoMes(asIn(c), today), 0)
  const cupoTotal = cards.reduce((a, c) => a + Number(c.cupo), 0)
  const uso = cupoTotal ? (deuda / cupoTotal) * 100 : 0
  const card = cards.find((c) => c.id === sel) ?? cards[0]

  const refresh = () => { invalidateBook(qc, bookId, "credit_cards"); invalidateBook(qc, bookId, "card_purchases") }
  const pagarTotal = async (c: CardRow) => {
    const { error } = await createClient().from("card_purchases").update({ pagada: true }).eq("card_id", c.id).is("deleted_at", null)
    if (error) return toast.error("No se pudo marcar", { description: error.message })
    toast.success("¡Tarjeta al día!")
    refresh()
  }
  const borrar = async (c: CardRow) => {
    const now = new Date().toISOString()
    await createClient().from("card_purchases").update({ deleted_at: now }).eq("card_id", c.id).is("deleted_at", null)
    await createClient().from("credit_cards").update({ deleted_at: now }).eq("id", c.id)
    toast("Tarjeta eliminada", { action: { label: "Deshacer", onClick: async () => {
      await createClient().from("credit_cards").update({ deleted_at: null }).eq("id", c.id)
      await createClient().from("card_purchases").update({ deleted_at: null }).eq("card_id", c.id).eq("deleted_at", now)
      refresh()
    } } })
    setSel(null)
    refresh()
  }

  const t = +sim.t.replace(",", ".") / 100

  return (
    <div className="grid gap-6">
      <PageHeader id="tarjetas" actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar tarjeta</Button>} />
      <KpiGrid className="xl:grid-cols-3">
        <Kpi icon="credit-card" tone="red" label="Debes en tarjetas" value={<Money value={deuda} />} sub={`${cards.length} tarjeta${cards.length === 1 ? "" : "s"}`} />
        <Kpi icon="calendar-clock" tone="amber" label="Pago mínimo de este mes" value={<Money value={pagoMes} />} sub="Suma de las cuotas que se cobran" />
        <Kpi icon="gauge" tone={uso > 30 ? "red" : "green"} label="Uso del cupo total" value={fmtPct(uso, 0)} valueClassName={uso > 30 ? "text-danger" : "text-success"} sub="Lo sano: menos del 30 %" />
      </KpiGrid>

      {!cards.length ? (
        <Card className="shadow-card ring-0"><EmptyState iso="tarjetas" title="Aún no tienes tarjetas" description="Agrega tu tarjeta con su cupo, día de corte, día de pago e interés mensual." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar tarjeta</Button>} /></Card>
      ) : card && (() => {
        const ci = asIn(card)
        const d = card.purchases.reduce((a, p) => a + compraEstado(ci, p as never, today).saldo, 0)
        const u = Number(card.cupo) ? (d / Number(card.cupo)) * 100 : 0
        return (
          <Card className="shadow-card ring-0">
            <CardHeader className="gap-3">
              {cards.length > 1 && <Segmented value={card.id} onChange={setSel} items={cards.map((c) => ({ value: c.id, label: c.nombre, icon: "credit-card" }))} />}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg"><CreditCard className="size-5 text-brand" /> {card.nombre}</CardTitle>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="soft" onClick={() => setBuying(card)}><ShoppingBag /> Registrar compra</Button>
                    <Button variant="outline" size="icon" aria-label="Editar tarjeta" onClick={() => setEditing(card)}><Pencil /></Button>
                    <Button variant="outline" size="icon" aria-label="Eliminar tarjeta" onClick={() => setConfirmDel(card)}><Trash2 /></Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[["Debes en total", <Money key="a" value={d} />], ["Pago mínimo del mes", <Money key="b" value={tarjetaPagoMes(ci, today)} />], ["Cupo disponible", <Money key="c" value={Math.max(Number(card.cupo) - d, 0)} />], ["Próxima fecha de pago", fmtDate(isoOf(proxDia(card.pago, today)))]].map(([l, v]) => (
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
              {canEdit && card.purchases.some((p) => !p.pagada) && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => pagarTotal(card)}><Wallet /> Pagué el total de la tarjeta</Button>
                  <span className="text-sm text-muted-foreground">Pagar el total cada mes evita casi todos los intereses.</span>
                </div>
              )}
              {card.purchases.length > 0 && (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader><TableRow><TableHead>Compra</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Cuotas</TableHead><TableHead className="text-right">Cuota mensual</TableHead><TableHead className="text-right">Intereses</TableHead><TableHead className="text-right">Te falta</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {card.purchases.map((p) => { const e = compraEstado(ci, p as never, today); return (
                          <TableRow key={p.id} className={cn(!e.pendiente && "opacity-60")}>
                            <TableCell className="font-medium">{p.descripcion}</TableCell><TableCell>{fmtDate(p.fecha)}</TableCell>
                            <TableCell className="text-right"><Money value={Number(p.valor)} /></TableCell><TableCell>{e.k} de {e.n}</TableCell>
                            <TableCell className="text-right"><Money value={e.cuota} /></TableCell><TableCell className="text-right text-warning"><Money value={e.int} /></TableCell>
                            <TableCell className="text-right font-semibold"><Money value={e.saldo} /></TableCell>
                          </TableRow>) })}
                      </TableBody>
                    </Table>
                  </div>
                  <ul className="grid gap-2 md:hidden">
                    {card.purchases.map((p) => { const e = compraEstado(ci, p as never, today); return (
                      <li key={p.id} className="grid gap-1 rounded-lg border p-3 text-sm">
                        <div className="flex justify-between font-semibold"><span>{p.descripcion}</span><Money value={Number(p.valor)} /></div>
                        <div className="flex justify-between text-muted-foreground"><span>{fmtDate(p.fecha)} · cuota {e.k} de {e.n}</span><span>cuota <Money value={e.cuota} /></span></div>
                        <div className="flex justify-between"><span className="text-warning">Intereses <Money value={e.int} /></span><b>Te falta <Money value={e.saldo} /></b></div>
                      </li>) })}
                  </ul>
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

      <CardForm open={nuevo || !!editing} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditing(null) } }} card={editing} onSaved={(id) => setSel(id)} />
      <PurchaseForm card={buying} onOpenChange={(o) => !o && setBuying(null)} />
      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar tarjeta?</AlertDialogTitle><AlertDialogDescription>Se borrará la tarjeta con sus compras registradas. Podrás deshacerlo durante unos segundos.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-danger text-white hover:bg-danger/90" onClick={() => confirmDel && borrar(confirmDel)}>Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
