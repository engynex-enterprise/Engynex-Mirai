"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Check, Plus, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PageHeader } from "@/components/mirai/page-header"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { Icon } from "@/components/mirai/icon"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useList, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { createClient } from "@/utils/supabase/client"
import { RETOS_T, retoEstado } from "@/lib/domain"
import { fmtMoney, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"

export function RetosView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const today = todayISO()
  const [nuevo, setNuevo] = useNewParam()
  const { data: book, isPending } = useBookData()
  const { data: retos = [] } = useList("savings_challenges", { order: { column: "created_at" } })
  const del = useSoftDelete("savings_challenges", "Reto eliminado")
  const [busy, setBusy] = useState(false)
  if (isPending || !book) return <PageSkeleton kpis={0} />
  const refresh = () => invalidateBook(qc, bookId, "savings_challenges")
  const sb = createClient()
  const crear = async (k: string) => {
    const t = RETOS_T.find((x) => x.k === k)!
    setBusy(true)
    const { error } = await sb.from("savings_challenges").insert({ book_id: bookId, k, tipo: t.tipo, category_id: t.cat ? book.categories.find((c) => c.nombre === t.cat)?.id ?? null : null, dias: t.dias, base: t.base ?? 0, n: t.tipo === "semanas" ? 52 : t.dias, inicio: today, marcas: [] })
    setBusy(false)
    if (error) return toast.error("No se pudo crear el reto", { description: error.message })
    toast.success("¡Reto iniciado!", { description: t.n }); setNuevo(false); refresh()
  }
  const marcar = async (r: (typeof retos)[number], m: number) => {
    const marcas = (r.marcas as number[]) ?? []
    const next = marcas.includes(m) ? marcas.filter((x) => x !== m) : [...marcas, m]
    await sb.from("savings_challenges").update({ marcas: next }).eq("id", r.id); refresh()
  }
  const reiniciar = async (id: string) => { await sb.from("savings_challenges").update({ inicio: today, marcas: [] }).eq("id", id); toast("Volviste a empezar desde hoy"); refresh() }
  const ctx = { expenses: book.expenses, categories: book.categories, umbral: book.settings.umbral }

  return (
    <div className="grid gap-6">
      <PageHeader id="retos" actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Nuevo reto</Button>} />
      {!retos.length ? (
        <Card className="shadow-card ring-0"><EmptyState iso="retos" title="Aún no tienes retos" description="Pequeños retos que te ayudan a ahorrar sin darte cuenta." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Elegir un reto</Button>} /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {retos.map((r) => {
            const t = RETOS_T.find((x) => x.k === r.k)
            const e = retoEstado({ tipo: r.tipo, category_id: r.category_id, dias: r.dias ?? 30, base: Number(r.base), inicio: r.inicio, marcas: r.marcas as number[] }, ctx, today)
            const marcas = (r.marcas as number[]) ?? []
            const dayIdx = Math.floor((new Date(today).getTime() - new Date(r.inicio).getTime()) / 864e5)
            return (
              <Card key={r.id} className="gap-4 p-5 shadow-card ring-0">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-full bg-brand-soft text-brand"><Icon name={t?.icon ?? "trophy"} className="size-5" /></span>
                  <div className="grid flex-1"><b>{t?.n ?? r.k}</b><span className="text-sm text-muted-foreground">{t?.d}</span></div>
                  {canEdit && <Button variant="ghost" size="icon" aria-label="Eliminar reto" onClick={() => del.mutate({ id: r.id, nombre: t?.n })}><Trash2 /></Button>}
                </div>
                <div className="flex items-center gap-2">{e.ok ? <StatusPill tone="pagado" check>¡Reto cumplido!</StatusPill> : e.fallo ? <StatusPill tone="vencido">Se rompió</StatusPill> : <StatusPill tone="info">En curso</StatusPill>}<span className="text-sm">{e.txt}</span></div>
                <Progress value={e.prog * 100} className={cn("h-2", e.fallo ? "[&>div]:bg-danger" : "[&>div]:bg-lime")} />
                {r.tipo === "semanas" && (
                  <>
                    <p className="text-sm text-muted-foreground">Toca la semana cuando guardes su valor.</p>
                    <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-13">
                      {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
                        <Tooltip key={w}><TooltipTrigger asChild>
                          <button type="button" disabled={!canEdit} onClick={() => marcar(r, w)} aria-pressed={marcas.includes(w)} aria-label={`Semana ${w}`}
                            className={cn("h-8 rounded-md border text-xs font-medium", marcas.includes(w) ? "border-brand bg-brand text-white dark:text-navy" : "hover:bg-hover")}>{w}</button>
                        </TooltipTrigger><TooltipContent>Semana {w}: {fmtMoney(w * Number(r.base))}</TooltipContent></Tooltip>
                      ))}
                    </div>
                  </>
                )}
                {r.tipo === "diario" && canEdit && (
                  <Button variant={marcas.includes(dayIdx) ? "outline" : "default"} className="w-fit" disabled={marcas.includes(dayIdx) || dayIdx >= (r.dias ?? 30)} onClick={() => marcar(r, dayIdx)}>
                    <Check /> {marcas.includes(dayIdx) ? "Hoy ya ahorraste" : `Hoy ahorré ${fmtMoney(Number(r.base))}`}
                  </Button>
                )}
                {e.ahorro != null && <p className="text-sm">Ahorrado: <Money value={e.ahorro} className="font-semibold text-success" /></p>}
                {e.fallo && canEdit && <Button variant="outline" className="w-fit" onClick={() => reiniciar(r.id)}><RotateCcw /> Volver a empezar desde hoy</Button>}
              </Card>
            )
          })}
        </div>
      )}
      <ResponsiveDialog open={nuevo} onOpenChange={(o) => !o && setNuevo(false)} title="Elige un reto" description="Pequeños retos que te ayudan a ahorrar. Te mostramos cómo vas cada día.">
        <div className="grid gap-2 pb-2">
          {RETOS_T.map((t) => (
            <button key={t.k} type="button" disabled={busy} onClick={() => crear(t.k)} className="flex items-start gap-3 rounded-lg border p-3 text-left hover:border-brand hover:bg-brand-soft">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><Icon name={t.icon} className="size-5" /></span>
              <span className="grid"><b>{t.n}</b><span className="text-sm text-muted-foreground">{t.d}</span></span>
            </button>
          ))}
        </div>
      </ResponsiveDialog>
    </div>
  )
}
