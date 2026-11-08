"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Plus, UserPlus } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Panel } from "@/components/mirai/panel"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { IconButton } from "@/components/mirai/tip"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { ListToolbar, NoResults, useListControls, type ListSort } from "@/components/mirai/list-toolbar"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useList, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { apiDeleteRow, apiInsertRow, apiUpdateRow } from "@/lib/api/book-rows"
import { balancesGrupo } from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { useCategories } from "@/features/catalogs/hooks"
import { useLast, useOpenKey } from "@/components/mirai/dialog-state"

type Group = Row<"shared_groups">
type GroupExpense = Row<"shared_group_expenses">

const nombres = (s: string) => [...new Set(s.split(",").map((p) => p.trim()).filter(Boolean))]

function GroupDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const n = useOpenKey(open)
  return <GroupForm key={n} open={open} onOpenChange={onOpenChange} onCreated={onCreated} />
}

function GroupForm({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const { user } = useApp()
  const [nombre, setNombre] = useState("")
  const [personas, setPersonas] = useState(`${user.nombre.split(" ")[0]}, `)
  const [busy, setBusy] = useState(false)
  const list = nombres(personas)
  const valido = !!nombre.trim() && list.length >= 2
  const submit = async () => {
    if (!valido || busy) return
    setBusy(true)
    const grupo = { nombre: nombre.trim(), personas: list }
    const { data, error } = await apiInsertRow<{ id: string }>(bookId, "shared_groups", grupo)
    setBusy(false)
    if (error || !data) return toast.error("No se pudo crear", { description: error?.message })
    toast.success("Grupo creado"); invalidateBook(qc, bookId, "shared_groups"); onCreated(data.id); onOpenChange(false)
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} mdesc="grupo" title="Nuevo grupo"
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <SubmitButton disabled={!valido} loading={busy} loadingText="Creando…" onClick={submit} hint="Escribe el nombre del grupo y al menos dos personas">Crear grupo</SubmitButton></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <FieldGroup className="pb-2">
          <FormField label="Nombre del grupo" htmlFor="gr-n" required><Input id="gr-n" className="h-11" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Paseo a Santa Marta" /></FormField>
          <FormField label="¿Quiénes participan?" htmlFor="gr-p" required hint={list.length < 2 ? "Separa los nombres con comas. Mínimo dos personas." : `${list.length} personas: ${list.join(", ")}`}>
            <Input id="gr-p" className="h-11" value={personas} onChange={(e) => setPersonas(e.target.value)} />
          </FormField>
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  )
}

function SharedExpenseDialog({ group, onOpenChange }: { group: Group | null; onOpenChange: (o: boolean) => void }) {
  const open = !!group
  const n = useOpenKey(open)
  // Mientras se cierra se sigue mostrando el mismo grupo (no cambia de contenido).
  const shown = useLast(group)
  if (!shown) return null
  return <SharedForm key={n} open={open} group={shown} onOpenChange={onOpenChange} />
}

function SharedForm({ open, group, onOpenChange }: { open: boolean; group: Group; onOpenChange: (o: boolean) => void }) {
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
  const [busy, setBusy] = useState(false)
  const valido = valor > 0 && entre.length > 0 && !!paga
  const submit = async () => {
    if (!valido || busy) return
    setBusy(true)
    let expense_id: string | null = null
    if (miGasto) {
      const gasto = { fecha, descripcion: `${desc || "Gasto compartido"} (${group.nombre})`, valor: valor / entre.length, category_id: cats.find((c) => c.nombre === "Otros")?.id ?? null, origen: "compartido" as const, hormiga: false }
      const { data } = await apiInsertRow<{ id: string }>(bookId, "expenses", gasto)
      expense_id = data?.id ?? null
    }
    const fila = { group_id: group.id, descripcion: desc.trim(), valor, paga, entre, fecha, expense_id }
    const { error } = await apiInsertRow(bookId, "shared_group_expenses", fila)
    setBusy(false)
    if (error) {
      // Sin el gasto del grupo, tu parte no debe quedar suelta en tus gastos.
      if (expense_id) await apiDeleteRow(bookId, "expenses", expense_id)
      return toast.error("No se pudo guardar", { description: error.message })
    }
    toast.success("Gasto anotado"); invalidateBook(qc, bookId, "shared_group_expenses"); invalidateBook(qc, bookId, "expenses"); onOpenChange(false)
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} mdesc="gastoGrupo" title="Anotar gasto del grupo"
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <SubmitButton disabled={!valido} loading={busy} onClick={submit} hint="Escribe el valor y elige entre quiénes se divide">Guardar</SubmitButton></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <FieldGroup className="pb-2">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="¿Qué se pagó?" htmlFor="ge-d"><Input id="ge-d" className="h-11" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej. Hotel" /></FormField>
            <FormField label="Valor" htmlFor="ge-v" required><MoneyInput id="ge-v" value={valor} onChange={setValor} /></FormField>
            <FormField label="¿Quién pagó?" htmlFor="ge-p"><Combobox id="ge-p" value={paga} onChange={setPaga} options={group.personas.map((p) => ({ value: p, label: p }))} /></FormField>
            <FormField label="Fecha" htmlFor="ge-f"><DatePicker id="ge-f" value={fecha} onChange={(v) => setFecha(v ?? today)} /></FormField>
          </div>
          <FormField label="¿Entre quiénes se divide?" hint={entre.length ? `A cada uno le tocan ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor / entre.length)}` : "Elige al menos una persona"}>
            <div className="flex flex-wrap gap-3">{group.personas.map((p) => <label key={p} className="flex items-center gap-2 text-sm"><Checkbox checked={entre.includes(p)} onCheckedChange={(c) => setEntre((e) => (c === true ? [...e, p] : e.filter((x) => x !== p)))} />{p}</label>)}</div>
          </FormField>
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={miGasto} onCheckedChange={(c) => setMiGasto(c === true)} className="mt-0.5" /><span><b>Registrar mi parte en mis gastos</b><br /><span className="text-muted-foreground">Si después borras este gasto del grupo, también sale de tus gastos.</span></span></label>
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  )
}

const SORTS: ListSort<GroupExpense>[] = [
  { value: "recientes", label: "Más recientes", by: (a, b) => b.fecha.localeCompare(a.fecha) },
  { value: "mayor", label: "Mayor valor", by: (a, b) => Number(b.valor) - Number(a.valor) },
  { value: "menor", label: "Menor valor", by: (a, b) => Number(a.valor) - Number(b.valor) },
]

/** "Rosa le pagó a Juan": todo lo que debe o un abono. No es gasto del grupo, solo salda (tipo "pago"). */
function SettleDialog({ pago, onOpenChange }: { pago: { group: Group; de: string; a: string; v: number } | null; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveDialog open={!!pago} onOpenChange={onOpenChange} title={pago ? `${pago.de} le paga a ${pago.a}` : ""} description="Registra lo que se pagaron para saldar. Puede ser todo o una parte (un abono).">
      {pago && <SettleBody key={`${pago.de}>${pago.a}`} pago={pago} onOpenChange={onOpenChange} />}
    </ResponsiveDialog>
  )
}

function SettleBody({ pago, onOpenChange }: { pago: { group: Group; de: string; a: string; v: number }; onOpenChange: (o: boolean) => void }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const today = todayISO()
  const [valor, setValor] = useState(Math.round(pago.v))
  const [fecha, setFecha] = useState(today)
  const [busy, setBusy] = useState(false)
  const abono = valor > 0 && valor < pago.v - 1
  const submit = async () => {
    if (!(valor > 0) || busy) return
    setBusy(true)
    const fila = { group_id: pago.group.id, descripcion: `Pago de ${pago.de} a ${pago.a}`, valor, paga: pago.de, entre: [pago.a], fecha, tipo: "pago" as const }
    const { error } = await apiInsertRow(bookId, "shared_group_expenses", fila)
    setBusy(false)
    if (error) return toast.error("No se pudo registrar el pago", { description: error.message })
    toast.success(abono ? "Abono registrado" : "Pago registrado", { description: abono ? `${pago.de} todavía le debe ${fmtMoney(pago.v - valor)} a ${pago.a}.` : `${pago.de} y ${pago.a} quedaron a paz y salvo.` })
    invalidateBook(qc, bookId, "shared_group_expenses")
    onOpenChange(false)
  }
  return (
    <FieldGroup className="pb-2">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="¿Cuánto pagó?" htmlFor="st-v" required hint={abono ? `Es un abono: le quedará debiendo ${fmtMoney(pago.v - valor)}.` : `Debe ${fmtMoney(pago.v)} en total.`}>
          <MoneyInput id="st-v" value={valor} onChange={setValor} />
        </FormField>
        <FormField label="Fecha" htmlFor="st-f"><DatePicker id="st-f" value={fecha} onChange={(v) => setFecha(v ?? today)} /></FormField>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <SubmitButton disabled={!(valor > 0)} loading={busy} onClick={submit}>{abono ? "Registrar abono" : "Registrar pago"}</SubmitButton>
      </div>
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
  const [adding, setAdding] = useState<Group | null>(null)
  const [pagando, setPagando] = useState<{ group: Group; de: string; a: string; v: number } | null>(null)
  const [persona, setPersona] = useState("")
  const g = groups.find((x) => x.id === sel) ?? groups[0]
  const gg = g ? gastos.filter((x) => x.group_id === g.id) : []
  const c = useListControls(gg, { text: (x) => `${x.descripcion} ${x.paga}`, sorts: SORTS })
  if (isPending) return <PageSkeleton kpis={3} />
  const B = g ? balancesGrupo(g.personas, gg.map((x) => ({ valor: Number(x.valor), paga: x.paga, entre: x.entre }))) : null
  // Los pagos entre personas (saldar) mueven quién debe, pero no son gasto del grupo.
  const soloGastos = gg.filter((x) => x.tipo !== "pago")
  const total = soloGastos.reduce((a, x) => a + Number(x.valor), 0)
  const nueva = persona.trim()
  const puedeAgregar = !!g && !!nueva && !g.personas.some((p) => p.toLowerCase() === nueva.toLowerCase())
  const addPersona = async () => {
    if (!g || !puedeAgregar) return
    const personas = [...g.personas, nueva]
    const { error } = await apiUpdateRow(bookId, "shared_groups", g.id, { personas })
    if (error) return toast.error("No se pudo agregar", { description: error.message })
    setPersona(""); invalidateBook(qc, bookId, "shared_groups"); toast.success(`${nueva} se unió al grupo`)
  }
  return (
    <div className="grid gap-6">
      <PageHeader id="compartidos" actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Nuevo grupo</Button>} />
      {!g || !B ? (
        <Card className="shadow-card ring-0"><EmptyState iso="compartidos" title="Aún no tienes grupos" description="Crea un grupo para un viaje, la casa con roomies o un regalo entre amigos. Anotan quién pagó qué y te decimos quién le debe a quién." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Crear grupo</Button>} /></Card>
      ) : (
        <>
          {groups.length > 1 && <Segmented value={g.id} onChange={setSel} items={groups.map((x) => ({ value: x.id, label: x.nombre, icon: "split" }))} />}
          <KpiGrid className="xl:grid-cols-3">
            <Kpi icon="receipt" tone="red" label="Gastado en total" value={<Money value={total} />} sub={`${soloGastos.length} ${soloGastos.length === 1 ? "gasto" : "gastos"} en ${g.nombre}`} />
            <Kpi icon="split" tone="blue" label="Le toca a cada uno" value={<Money value={total / (g.personas.length || 1)} />} sub="Si se divide parejo" />
            <Kpi icon="users" tone="violet" label="Personas" value={g.personas.length} sub={g.personas.slice(0, 3).join(", ") + (g.personas.length > 3 ? "…" : "")} />
          </KpiGrid>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Para quedar a paz y salvo" icon="handshake" description="Los pagos mínimos para que nadie le deba a nadie.">
              {!B.tr.length ? <p className="text-sm text-muted-foreground">Todos están a paz y salvo.</p> : (
                <ul className="grid gap-2">
                  {B.tr.map((t, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3 text-sm">
                      <b>{t.de}</b><ArrowRight className="size-4" aria-label="le paga a" /><b>{t.a}</b><Money value={t.v} className="ml-auto font-bold" />
                      {canEdit && <Button size="sm" variant="outline" onClick={() => setPagando({ group: g, ...t })}>Registrar pago</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Cómo va cada uno" icon="users">
              <ul className="grid gap-2">
                {g.personas.map((p) => {
                  const v = B.b[p] ?? 0
                  return (
                    <li key={p} className="flex items-center gap-3 text-sm">
                      <UserAvatar name={p} className="size-8" fallbackClassName="text-xs" />
                      <span className="min-w-0 flex-1 truncate">{p}</span>
                      {Math.abs(v) <= 1 ? <StatusPill tone="pagado" check>A paz y salvo</StatusPill>
                        : v > 0 ? <StatusPill tone="pagado">Le deben <Money value={v} /></StatusPill>
                          : <StatusPill tone="vencido">Debe <Money value={-v} /></StatusPill>}
                    </li>
                  )
                })}
              </ul>
              {canEdit && (
                <form className="mt-auto flex gap-2 pt-2" onSubmit={(e) => { e.preventDefault(); void addPersona() }}>
                  <Input className="h-10" aria-label="Nombre de la persona" placeholder="Agregar persona" value={persona} onChange={(e) => setPersona(e.target.value)} />
                  <Button type="submit" variant="outline" disabled={!puedeAgregar}><UserPlus /> Agregar</Button>
                </form>
              )}
            </Panel>
          </div>
          <Panel title="Gastos" icon="receipt" action={canEdit && <><Button onClick={() => setAdding(g)}><Plus /> Anotar gasto</Button><IconButton icon="trash-2" destructive label="Eliminar grupo" onClick={() => delG.mutate(g, { onSuccess: () => invalidateBook(qc, bookId, "expenses") })} /></>}>
            {!gg.length ? <p className="text-sm text-muted-foreground">Aún no hay gastos en este grupo.</p> : (
              <>
                {gg.length > 4 && <ListToolbar c={c} placeholder="Buscar un gasto o quién pagó" sorts={SORTS} />}
                {!c.rows.length ? <NoResults c={c} /> : (
                  <ul className="grid divide-y">{c.rows.map((x) => (
                    <li key={x.id} className="flex items-center gap-3 py-3 text-sm">
                      {x.tipo === "pago"
                        ? <><ToneIcon icon="hand-coins" tone="green" size="sm" /><span className="grid min-w-0 flex-1"><b className="truncate">{x.paga} le pagó a {x.entre[0]}</b><span className="text-muted-foreground">Pago para saldar · {fmtDate(x.fecha)}</span></span></>
                        : <><ToneIcon icon="receipt" tone="blue" size="sm" /><span className="grid min-w-0 flex-1"><b className="truncate">{x.descripcion || "Gasto"}</b><span className="text-muted-foreground">Pagó {x.paga} · entre {x.entre.length} · {fmtDate(x.fecha)}</span></span></>}
                      <Money value={Number(x.valor)} className="font-bold" />
                      {canEdit && <IconButton icon="trash-2" destructive label={`Eliminar gasto ${x.descripcion || ""}`.trim()} onClick={() => delE.mutate(x, { onSuccess: () => invalidateBook(qc, bookId, "expenses") })} />}
                    </li>))}</ul>
                )}
              </>
            )}
          </Panel>
        </>
      )}
      <GroupDialog open={nuevo} onOpenChange={(o) => !o && setNuevo(false)} onCreated={setSel} />
      <SharedExpenseDialog group={adding} onOpenChange={(o) => !o && setAdding(null)} />
      <SettleDialog pago={pagando} onOpenChange={(o) => !o && setPagando(null)} />
    </div>
  )
}
