"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Plus, Trash2, UserPlus } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/mirai/page-header"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { Segmented } from "@/components/mirai/choice-cards"
import { FormField } from "@/components/mirai/field"
import { EmptyState } from "@/components/mirai/empty-state"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useList, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { createClient } from "@/utils/supabase/client"
import { balancesGrupo } from "@/lib/domain"
import { fmtDate, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { useCategories } from "@/features/catalogs/hooks"

function GroupDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const { user } = useApp()
  const [nombre, setNombre] = useState("")
  const [personas, setPersonas] = useState(`${user.nombre.split(" ")[0]}, `)
  const submit = async () => {
    const list = [...new Set(personas.split(",").map((p) => p.trim()).filter(Boolean))]
    if (!nombre.trim()) return toast.error("Escribe el nombre del grupo")
    if (list.length < 2) return toast.error("Agrega al menos dos personas")
    const { data, error } = await createClient().from("shared_groups").insert({ book_id: bookId, nombre: nombre.trim(), personas: list }).select("id").single()
    if (error) return toast.error("No se pudo crear", { description: error.message })
    toast.success("Grupo creado"); invalidateBook(qc, bookId, "shared_groups"); onCreated(data.id); onOpenChange(false)
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} mdesc="grupo" title="Nuevo grupo">
      <FieldGroup className="pb-2">
        <FormField label="Nombre del grupo" htmlFor="gr-n" required><Input id="gr-n" className="h-11" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Paseo a Santa Marta" /></FormField>
        <FormField label="¿Quiénes participan?" htmlFor="gr-p" hint="Separa los nombres con comas."><Input id="gr-p" className="h-11" value={personas} onChange={(e) => setPersonas(e.target.value)} /></FormField>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit}>Crear grupo</Button></div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

function SharedExpenseDialog({ group, onOpenChange }: { group: Row<"shared_groups"> | null; onOpenChange: (o: boolean) => void }) {
  return <ResponsiveDialog open={!!group} onOpenChange={onOpenChange} mdesc="gastoGrupo" title="Anotar gasto del grupo">{group && <SharedBody group={group} onOpenChange={onOpenChange} />}</ResponsiveDialog>
}
function SharedBody({ group, onOpenChange }: { group: Row<"shared_groups">; onOpenChange: (o: boolean) => void }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const today = todayISO()
  const { data: cats = [] } = useCategories()
  const [desc, setDesc] = useState("")
  const [valor, setValor] = useState(0)
  const [paga, setPaga] = useState(group.personas[0] ?? "")
  const [fecha, setFecha] = useState(today)
  const [entre, setEntre] = useState<string[]>(group.personas)
  const [miGasto, setMiGasto] = useState(false)
  const submit = async () => {
    if (!valor || !entre.length) return toast.error("Completa el valor y las personas")
    const sb = createClient()
    let expense_id: string | null = null
    if (miGasto) {
      const { data } = await sb.from("expenses").insert({ book_id: bookId, fecha, descripcion: `${desc || "Gasto compartido"} (${group.nombre})`, valor: valor / entre.length, category_id: cats.find((c) => c.nombre === "Otros")?.id ?? null, origen: "compartido", hormiga: false }).select("id").single()
      expense_id = data?.id ?? null
    }
    const { error } = await sb.from("shared_group_expenses").insert({ book_id: bookId, group_id: group.id, descripcion: desc.trim(), valor, paga, entre, fecha, expense_id })
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    toast.success("Gasto anotado"); invalidateBook(qc, bookId, "shared_group_expenses"); invalidateBook(qc, bookId, "expenses"); onOpenChange(false)
  }
  return (
    <FieldGroup className="pb-2">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="¿Qué se pagó?" htmlFor="ge-d"><Input id="ge-d" className="h-11" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej. Hotel" /></FormField>
        <FormField label="Valor" htmlFor="ge-v" required><MoneyInput id="ge-v" value={valor} onChange={setValor} /></FormField>
        <FormField label="¿Quién pagó?" htmlFor="ge-p"><Combobox id="ge-p" value={paga} onChange={setPaga} options={group.personas.map((p) => ({ value: p, label: p }))} /></FormField>
        <FormField label="Fecha" htmlFor="ge-f"><DatePicker id="ge-f" value={fecha} onChange={(v) => setFecha(v ?? today)} /></FormField>
      </div>
      <FormField label="¿Entre quiénes se divide?">
        <div className="flex flex-wrap gap-3">{group.personas.map((p) => <label key={p} className="flex items-center gap-2 text-sm"><Checkbox checked={entre.includes(p)} onCheckedChange={(c) => setEntre((e) => (c === true ? [...e, p] : e.filter((x) => x !== p)))} />{p}</label>)}</div>
      </FormField>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={miGasto} onCheckedChange={(c) => setMiGasto(c === true)} /> Registrar mi parte en mis gastos</label>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit}>Guardar</Button></div>
    </FieldGroup>
  )
}

export function CompartidosView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const [nuevo, setNuevo] = useNewParam()
  const { data: groups = [], isPending } = useList("shared_groups", { order: { column: "created_at" } })
  const { data: gastos = [] } = useList("shared_group_expenses", { order: { column: "fecha", ascending: false } })
  const delG = useSoftDelete("shared_groups", "Grupo eliminado")
  const delE = useSoftDelete("shared_group_expenses", "Gasto eliminado")
  const [sel, setSel] = useState<string | null>(null)
  const [adding, setAdding] = useState<Row<"shared_groups"> | null>(null)
  const [persona, setPersona] = useState("")
  if (isPending) return <PageSkeleton kpis={3} />
  const g = groups.find((x) => x.id === sel) ?? groups[0]
  const gg = g ? gastos.filter((x) => x.group_id === g.id) : []
  const B = g ? balancesGrupo(g.personas, gg.map((x) => ({ valor: Number(x.valor), paga: x.paga, entre: x.entre }))) : null
  const total = gg.reduce((a, x) => a + Number(x.valor), 0)
  const addPersona = async () => {
    const p = persona.trim(); if (!g || !p || g.personas.includes(p)) return
    await createClient().from("shared_groups").update({ personas: [...g.personas, p] }).eq("id", g.id); setPersona(""); invalidateBook(qc, bookId, "shared_groups")
  }
  return (
    <div className="grid gap-6">
      <PageHeader id="compartidos" actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Nuevo grupo</Button>} />
      {!g || !B ? (
        <Card className="shadow-card ring-0"><EmptyState iso="compartidos" title="Aún no tienes grupos" description="Crea un grupo para un viaje, la casa con roomies o un regalo entre amigos. Anotan quién pagó qué y te decimos quién le debe a quién." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Crear grupo</Button>} /></Card>
      ) : (
        <>
          {groups.length > 1 && <Segmented value={g.id} onChange={setSel} items={groups.map((x) => ({ value: x.id, label: x.nombre, icon: "split" }))} />}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <Card className="p-3 shadow-card ring-0 sm:p-5"><p className="text-xs text-muted-foreground">Gastado en total</p><Money value={total} className="text-base font-semibold sm:text-xl" /></Card>
            <Card className="p-3 shadow-card ring-0 sm:p-5"><p className="text-xs text-muted-foreground">Le toca a cada uno (si es parejo)</p><Money value={total / (g.personas.length || 1)} className="text-base font-semibold sm:text-xl" /></Card>
            <Card className="p-3 shadow-card ring-0 sm:p-5"><p className="text-xs text-muted-foreground">Personas</p><p className="text-base font-semibold sm:text-xl">{g.personas.length}</p></Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-card ring-0">
              <CardHeader><CardTitle className="text-base">Para quedar a paz y salvo</CardTitle></CardHeader>
              <CardContent className="grid gap-2">
                {!B.tr.length ? <p className="text-sm text-muted-foreground">Todos están a paz y salvo.</p> : B.tr.map((t, i) => (
                  <p key={i} className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm"><b>{t.de}</b><ArrowRight className="size-4" /><b>{t.a}</b><Money value={t.v} className="ml-auto font-bold" /></p>
                ))}
              </CardContent>
            </Card>
            <Card className="shadow-card ring-0">
              <CardHeader><CardTitle className="text-base">Cómo va cada uno</CardTitle></CardHeader>
              <CardContent className="grid gap-2">
                {g.personas.map((p) => { const v = B.b[p] ?? 0; return (
                  <div key={p} className="flex items-center justify-between gap-2 text-sm"><span>{p}</span>{Math.abs(v) <= 1 ? <StatusPill tone="pagado" check>A paz y salvo</StatusPill> : v > 0 ? <StatusPill tone="pagado">Le deben {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v)}</StatusPill> : <StatusPill tone="vencido">Debe {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(-v)}</StatusPill>}</div>) })}
                {canEdit && <div className="flex gap-2 pt-2"><Input className="h-10" placeholder="Agregar persona" value={persona} onChange={(e) => setPersona(e.target.value)} /><Button variant="outline" onClick={addPersona}><UserPlus /> Agregar</Button></div>}
              </CardContent>
            </Card>
          </div>
          <Card className="shadow-card ring-0">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Gastos</CardTitle>
              {canEdit && <div className="flex gap-2"><Button onClick={() => setAdding(g)}><Plus /> Anotar gasto</Button><Button variant="ghost" size="icon" aria-label="Eliminar grupo" onClick={() => delG.mutate(g)}><Trash2 /></Button></div>}
            </CardHeader>
            <CardContent>
              {!gg.length ? <p className="text-sm text-muted-foreground">Aún no hay gastos en este grupo.</p> : (
                <ul className="grid divide-y">{gg.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 py-3 text-sm">
                    <span className="grid flex-1"><b>{x.descripcion || "Gasto"}</b><span className="text-muted-foreground">Pagó {x.paga} · entre {x.entre.length} · {fmtDate(x.fecha)}</span></span>
                    <Money value={Number(x.valor)} className="font-bold" />
                    {canEdit && <Button variant="ghost" size="icon" aria-label="Eliminar gasto" onClick={() => delE.mutate(x)}><Trash2 /></Button>}
                  </li>))}</ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
      <GroupDialog open={nuevo} onOpenChange={(o) => !o && setNuevo(false)} onCreated={setSel} />
      <SharedExpenseDialog group={adding} onOpenChange={(o) => !o && setAdding(null)} />
    </div>
  )
}
