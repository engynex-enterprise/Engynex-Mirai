"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Settings2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/mirai/page-header"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { StatusPill } from "@/components/mirai/status-pill"
import { Icon } from "@/components/mirai/icon"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { ingresoMensual } from "@/lib/domain"
import { fmtMoney, fmtPct, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"

const GRUPOS = [
  { k: "n", t: "Necesidades", icon: "house", color: "#1F2B4B", d: "Arriendo, mercado, servicios, transporte, salud" },
  { k: "g", t: "Gustos", icon: "coffee", color: "#9EDB4E", d: "Restaurantes, salidas, ropa, suscripciones" },
  { k: "a", t: "Ahorro e inversión", icon: "piggy-bank", color: "#3F7A1E", d: "Lo que guardas para el futuro" },
] as const

function TopeCell({ id, value, onSaved }: { id: string; value: number; onSaved: () => void }) {
  const [v, setV] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) { setPrev(value); setV(value) }
  return (
    <div className="w-36">
      <MoneyInput value={v} onChange={setV} onBlur={async () => {
        if (v === value) return
        const { error } = await createClient().from("categories").update({ tope: v }).eq("id", id)
        if (error) return toast.error("No se pudo guardar el tope")
        toast.success("Tope actualizado"); onSaved()
      }} />
    </div>
  )
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
    const gastos = book.expenses.filter((g) => g.fecha.startsWith(mes))
    const byCat = new Map<string, number>()
    for (const g of gastos) byCat.set(g.category_id ?? "", (byCat.get(g.category_id ?? "") ?? 0) + Number(g.valor))
    const grupo = (k: string) => book.categories.filter((c) => c.grupo === k).reduce((a, c) => a + (byCat.get(c.id) ?? 0), 0)
    const planeado = (k: string) => book.categories.filter((c) => c.grupo === k).reduce((a, c) => a + Number(c.tope), 0)
    const unknown = [...byCat.entries()].filter(([id]) => !book.categories.some((c) => c.id === id))
    return { pct, ing, byCat, grupo, planeado, unknown, alerta: book.settings.alerta_pres }
  }, [book, mes])
  if (isPending || !book || !d) return <PageSkeleton kpis={3} />
  const refresh = () => invalidateBook(qc, bookId, "categories")

  return (
    <div className="grid gap-6">
      <PageHeader id="presupuesto" description={`La regla más usada para organizar el sueldo: ${d.pct.n} % para lo necesario, ${d.pct.g} % para gustos y ${d.pct.a} % para ahorrar. Con tu ingreso de ${fmtMoney(d.ing)} queda así:`}
        actions={<Button variant="outline" asChild><Link href="/ajustes?tab=categorias"><Settings2 /> Editar categorías</Link></Button>} />
      <div className="grid gap-4 md:grid-cols-3">
        {GRUPOS.map((g) => {
          const p = d.pct[g.k], rec = (d.ing * p) / 100, gastado = d.grupo(g.k), plan = d.planeado(g.k)
          const v = gastado || plan
          return (
            <Card key={g.k} className="gap-3 p-5 shadow-card ring-0">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-lg text-white" style={{ background: g.color }}><Icon name={g.icon} className="size-5" /></span>
                <div className="grid flex-1"><b>{g.t}</b><span className="text-xs text-muted-foreground">{g.d}</span></div>
                <StatusPill tone="info">{p} %</StatusPill>
              </div>
              <div><Money value={v} className="text-[22px] font-semibold" /><p className="text-xs text-muted-foreground">{gastado ? "Gastado este mes" : "Planeado"} · recomendado {fmtMoney(rec)}</p></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(rec ? (v / rec) * 100 : 0)} aria-label={g.t}>
                <div className="h-full rounded-full transition-all" style={{ width: `${rec ? Math.min(100, (v / rec) * 100) : 0}%`, background: g.color }} />
              </div>
            </Card>
          )
        })}
      </div>
      <Card className="shadow-card ring-0">
        <CardHeader><CardTitle className="text-base">Cada categoría este mes</CardTitle><CardDescription>Escribe cuánto quieres gastar como máximo en cada una.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Categoría</TableHead><TableHead className="max-sm:hidden">Tipo</TableHead><TableHead>Tope al mes</TableHead><TableHead className="text-right">Llevas</TableHead><TableHead className="w-32 max-sm:hidden">Uso</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
            <TableBody>
              {book.categories.map((c) => {
                const llevas = d.byCat.get(c.id) ?? 0, tope = Number(c.tope), u = tope ? (llevas / tope) * 100 : 0
                const st = !tope ? ["gray", "Sin tope"] : u >= 100 ? ["vencido", "Te pasaste"] : u >= d.alerta * 0.8 ? ["porVencer", "Cerca del tope"] : ["pagado", "Bien"]
                return (
                  <TableRow key={c.id}>
                    <TableCell><span className="flex items-center gap-2"><Icon name={c.icon} className="size-4 text-muted-foreground" />{c.nombre}</span></TableCell>
                    <TableCell className="text-muted-foreground max-sm:hidden">{GRUPOS.find((g) => g.k === c.grupo)?.t ?? "—"}</TableCell>
                    <TableCell>{canEdit ? <TopeCell id={c.id} value={tope} onSaved={refresh} /> : <Money value={tope} />}</TableCell>
                    <TableCell className="text-right"><Money value={llevas} /></TableCell>
                    <TableCell className="max-sm:hidden"><Progress value={Math.min(100, u)} className={cn("h-1.5", u >= 100 ? "[&>div]:bg-danger" : u >= 80 ? "[&>div]:bg-[#E08A00]" : "[&>div]:bg-lime")} /></TableCell>
                    <TableCell><StatusPill tone={st[0] as "gray"}>{st[1]}</StatusPill>{tope > 0 && <span className="ml-1 text-xs text-muted-foreground">{fmtPct(u, 0)}</span>}</TableCell>
                  </TableRow>
                )
              })}
              {d.unknown.map(([id, v]) => (
                <TableRow key={id || "none"}><TableCell>No está en tus categorías</TableCell><TableCell className="max-sm:hidden">—</TableCell><TableCell>—</TableCell><TableCell className="text-right"><Money value={v} /></TableCell><TableCell className="max-sm:hidden" /><TableCell><StatusPill tone="gray">Sin categoría</StatusPill></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
