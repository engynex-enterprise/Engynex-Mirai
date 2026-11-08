"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Check, Plus, RotateCcw } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { PageHeader } from "@/components/mirai/page-header"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { IconButton, Tip } from "@/components/mirai/tip"
import { ToneIcon, type IconTone } from "@/components/mirai/tone-icon"
import { ListToolbar, NoResults, useListControls, type ListFilter, type ListSort } from "@/components/mirai/list-toolbar"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useList, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { apiInsertRow, apiUpdateRow } from "@/lib/api/book-rows"
import { RETOS_T, retoEstado, type RetoEstado } from "@/lib/domain"
import { fmtMoney, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { useBookData } from "@/features/book/use-book-data"

type Reto = Row<"savings_challenges">
type RetoFila = { r: Reto; e: RetoEstado; t: (typeof RETOS_T)[number] | undefined }

/** Color de referencia por tipo de reto: evitar un gasto (ámbar), ahorrar (verde). */
const TONO: Record<string, IconTone> = { sin_cat: "amber", sin_hormiga: "violet", semanas: "green", diario: "blue" }
const estadoDe = (e: RetoEstado) => (e.ok ? "ok" : e.fallo ? "roto" : "curso")
const ESTADO = {
  ok: { tone: "pagado", label: "¡Reto cumplido!", tip: "Lo lograste. Puedes empezar otro cuando quieras." },
  roto: { tone: "vencido", label: "Se rompió", tip: "Hubo un gasto que rompió el reto. Puedes volver a empezar desde hoy." },
  curso: { tone: "info", label: "En curso", tip: "Vas bien: sigue así hasta completar el reto." },
} as const

const FILTERS: ListFilter<RetoFila>[] = [
  { value: "todos", label: "Todos" },
  { value: "curso", label: "En curso", icon: "hourglass", match: (x) => estadoDe(x.e) === "curso" },
  { value: "ok", label: "Cumplidos", icon: "trophy", match: (x) => estadoDe(x.e) === "ok" },
  { value: "roto", label: "Rotos", icon: "rotate-ccw", match: (x) => estadoDe(x.e) === "roto" },
]
const SORTS: ListSort<RetoFila>[] = [
  { value: "recientes", label: "Más recientes", by: (a, b) => b.r.created_at.localeCompare(a.r.created_at) },
  { value: "avance", label: "Más avanzados", by: (a, b) => b.e.prog - a.e.prog },
  { value: "nombre", label: "Por nombre", by: (a, b) => (a.t?.n ?? a.r.k).localeCompare(b.t?.n ?? b.r.k, "es") },
]

function RetoCard({ x, canEdit, today, onMark, onRestart }: { x: RetoFila; canEdit: boolean; today: string; onMark: (r: Reto, m: number) => void; onRestart: (id: string) => void }) {
  const del = useSoftDelete("savings_challenges", "Reto eliminado")
  const { r, e, t } = x
  const marcas = (r.marcas as number[]) ?? []
  const dayIdx = Math.floor((new Date(today).getTime() - new Date(r.inicio).getTime()) / 864e5)
  const st = ESTADO[estadoDe(e)]
  return (
    <Card className="h-full gap-4 p-5 shadow-card ring-0">
      <div className="flex items-center gap-3">
        <ToneIcon icon={t?.icon ?? "trophy"} tone={TONO[r.tipo] ?? "brand"} />
        <div className="grid min-w-0 flex-1"><h2 className="font-semibold">{t?.n ?? r.k}</h2><span className="text-sm text-muted-foreground">{t?.d}</span></div>
        {canEdit && <IconButton icon="trash-2" destructive label="Eliminar reto" onClick={() => del.mutate({ id: r.id, nombre: t?.n })} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Tip label={st.tip}><span tabIndex={0} className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><StatusPill tone={st.tone} check={!!e.ok}>{st.label}</StatusPill></span></Tip>
        <span className="text-sm">{e.txt}</span>
      </div>
      <Progress value={e.prog * 100} aria-label={`Avance: ${Math.round(e.prog * 100)} %`} className={cn("h-2", e.fallo ? "[&>div]:bg-danger" : "[&>div]:bg-lime")} />
      {r.tipo === "semanas" && (
        <>
          <p className="text-sm text-muted-foreground">Toca la semana cuando guardes su valor.</p>
          <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-13">
            {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
              <Tip key={w} label={`Semana ${w}: ${fmtMoney(w * Number(r.base))}`}>
                <button type="button" disabled={!canEdit} onClick={() => onMark(r, w)} aria-pressed={marcas.includes(w)} aria-label={`Semana ${w}`}
                  className={cn("h-8 rounded-md border text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", marcas.includes(w) ? "border-brand bg-brand text-white dark:text-navy" : "hover:bg-hover")}>{w}</button>
              </Tip>
            ))}
          </div>
        </>
      )}
      <div className="mt-auto grid gap-3">
        {r.tipo === "diario" && canEdit && (
          <Button variant={marcas.includes(dayIdx) ? "outline" : "default"} className="w-fit" disabled={marcas.includes(dayIdx) || dayIdx >= (r.dias ?? 30)} onClick={() => onMark(r, dayIdx)}>
            <Check /> {marcas.includes(dayIdx) ? "Hoy ya ahorraste" : `Hoy ahorré ${fmtMoney(Number(r.base))}`}
          </Button>
        )}
        {e.ahorro != null && <p className="text-sm">Ahorrado: <Money value={e.ahorro} className="font-semibold text-success" /></p>}
        {e.fallo && canEdit && <Button variant="outline" className="w-fit" onClick={() => onRestart(r.id)}><RotateCcw /> Volver a empezar desde hoy</Button>}
      </div>
    </Card>
  )
}

export function RetosView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const today = todayISO()
  const [nuevo, setNuevo] = useNewParam()
  const { data: book, isPending } = useBookData()
  const { data: retos = [] } = useList("savings_challenges", { order: { column: "created_at" } })
  const [creando, setCreando] = useState<string | null>(null)
  const filas: RetoFila[] = book ? retos.map((r) => ({
    r, t: RETOS_T.find((x) => x.k === r.k),
    e: retoEstado({ tipo: r.tipo, category_id: r.category_id, dias: r.dias ?? 30, base: Number(r.base), inicio: r.inicio, marcas: r.marcas as number[] }, { expenses: book.expenses, categories: book.categories, umbral: book.settings.umbral }, today),
  })) : []
  const c = useListControls(filas, { text: (x) => `${x.t?.n ?? x.r.k} ${x.t?.d ?? ""}`, filters: FILTERS, sorts: SORTS })
  if (isPending || !book) return <PageSkeleton kpis={3} />
  const refresh = () => invalidateBook(qc, bookId, "savings_challenges")
  const crear = async (k: string) => {
    const t = RETOS_T.find((x) => x.k === k)!
    setCreando(k)
    const reto = { k, tipo: t.tipo, category_id: t.cat ? book.categories.find((c) => c.nombre === t.cat)?.id ?? null : null, dias: t.dias, base: t.base ?? 0, n: t.tipo === "semanas" ? 52 : t.dias, inicio: today, marcas: [] }
    const { error } = await apiInsertRow(bookId, "savings_challenges", reto)
    setCreando(null)
    if (error) return toast.error("No se pudo crear el reto", { description: error.message })
    toast.success("¡Reto iniciado!", { description: t.n }); setNuevo(false); refresh()
  }
  const marcar = async (r: Reto, m: number) => {
    const marcas = (r.marcas as number[]) ?? []
    const next = marcas.includes(m) ? marcas.filter((x) => x !== m) : [...marcas, m]
    const { error } = await apiUpdateRow(bookId, "savings_challenges", r.id, { marcas: next })
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    refresh()
  }
  const reiniciar = async (id: string) => {
    const { error } = await apiUpdateRow(bookId, "savings_challenges", id, { inicio: today, marcas: [] })
    if (error) return toast.error("No se pudo reiniciar", { description: error.message })
    toast("Volviste a empezar desde hoy"); refresh()
  }
  const activos = new Set(filas.filter((x) => estadoDe(x.e) === "curso").map((x) => x.r.k))
  const ahorrado = filas.reduce((a, x) => a + (x.e.ahorro ?? 0), 0)
  const cumplidos = filas.filter((x) => x.e.ok).length

  return (
    <div className="grid gap-6">
      <PageHeader id="retos" actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Nuevo reto</Button>} />
      {!retos.length ? (
        <Card className="shadow-card ring-0"><EmptyState iso="retos" title="Aún no tienes retos" description="Pequeños retos que te ayudan a ahorrar sin darte cuenta." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Elegir un reto</Button>} /></Card>
      ) : (
        <>
          <KpiGrid className="xl:grid-cols-3">
            <Kpi icon="hourglass" tone="blue" label="Retos en curso" value={c.counts.curso ?? 0} sub={`${retos.length} en total`} />
            <Kpi icon="trophy" tone="green" label="Retos cumplidos" value={cumplidos} sub={cumplidos ? "¡Vas muy bien!" : "El primero está cerca"} />
            <Kpi icon="piggy-bank" tone="brand" label="Ahorrado con retos" value={<Money value={ahorrado} />} sub="Semanas y días marcados" />
          </KpiGrid>
          {retos.length > 1 && <ListToolbar c={c} placeholder="Buscar un reto" filters={FILTERS} sorts={SORTS} />}
          {!c.rows.length ? <NoResults c={c} /> : (
            <div className="grid gap-6 lg:grid-cols-2">
              {c.rows.map((x) => <RetoCard key={x.r.id} x={x} canEdit={canEdit} today={today} onMark={marcar} onRestart={reiniciar} />)}
            </div>
          )}
        </>
      )}
      <ResponsiveDialog open={nuevo} onOpenChange={(o) => !o && setNuevo(false)} title="Elige un reto" description="Pequeños retos que te ayudan a ahorrar. Te mostramos cómo vas cada día.">
        <div className="grid gap-2 pb-2">
          {RETOS_T.map((t) => (
            <button key={t.k} type="button" disabled={!!creando} onClick={() => crear(t.k)} aria-busy={creando === t.k || undefined}
              className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:border-brand hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60">
              <ToneIcon icon={t.icon} tone={TONO[t.tipo] ?? "brand"} />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-semibold">{t.n}{activos.has(t.k) && <StatusPill tone="info" className="h-5">Ya lo tienes en curso</StatusPill>}</span>
                <span className="text-sm text-muted-foreground">{t.d}</span>
              </span>
              {creando === t.k && <Spinner className="mt-1 shrink-0" />}
            </button>
          ))}
        </div>
      </ResponsiveDialog>
    </div>
  )
}
