"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { SubmitButton } from "@/components/mirai/submit-button"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { Segmented } from "@/components/mirai/choice-cards"
import { useBookId } from "@/components/app/app-context"
import { invalidateBook, useSave } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { fundSave, fundUse } from "./commands"
import { aporteSugerido, fijoProxIso, type PayDays } from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { methodOptions, useCategories, usePaymentMethods } from "@/features/catalogs/hooks"
import { ICON_OPTIONS } from "@/features/catalogs/category-dialog"

const plus12 = () => { const d = new Date(todayISO() + "T12:00:00"); d.setMonth(d.getMonth() + 12); return d.toISOString().slice(0, 10) }
const refresh = (qc: ReturnType<typeof useQueryClient>, bookId: string) => ["goals", "emergency_funds", "fund_movements", "expenses", "fixed_expenses"].forEach((t) => invalidateBook(qc, bookId, t))

type CuentaOpt = { value: string; label: string; icon?: string }

/** `cuentas`: tus cuentas de dinero, para decir dónde está la plata de la meta (y no contarla dos veces). */
export function GoalDialog({ open, onOpenChange, goal, cuentas = [] }: { open: boolean; onOpenChange: (o: boolean) => void; goal?: Row<"goals"> | null; cuentas?: CuentaOpt[] }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} mdesc="meta" title={goal ? "Editar meta" : "Nueva meta"}>
      {open && <GoalBody goal={goal} onOpenChange={onOpenChange} cuentas={cuentas} />}
    </ResponsiveDialog>
  )
}
function GoalBody({ goal, onOpenChange, cuentas }: { goal?: Row<"goals"> | null; onOpenChange: (o: boolean) => void; cuentas: CuentaOpt[] }) {
  const save = useSave("goals")
  const [nombre, setNombre] = useState(goal?.nombre ?? "")
  const [icon, setIcon] = useState(goal?.icon ?? "target")
  const [objetivo, setObjetivo] = useState(Number(goal?.objetivo ?? 0))
  const [ahorrado, setAhorrado] = useState(Number(goal?.ahorrado ?? 0))
  const [fecha, setFecha] = useState<string | null>(goal?.fecha ?? plus12())
  const [donde, setDonde] = useState(goal?.asset_id ?? "")
  const submit = async () => {
    if (!nombre.trim()) return toast.error("Escribe el nombre de la meta")
    if (!objetivo) return toast.error("Escribe cuánto necesitas")
    await save.mutateAsync({ ...(goal ? { id: goal.id } : {}), nombre: nombre.trim(), icon, objetivo, ahorrado, fecha, asset_id: donde || null } as never)
    toast.success(goal ? "Meta actualizada" : "Meta creada")
    onOpenChange(false)
  }
  return (
    <FieldGroup className="pb-2">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="¿Qué quieres lograr?" htmlFor="m-n" required><Input id="m-n" className="h-11" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Viaje a Cartagena" /></FormField>
        <FormField label="Ícono" htmlFor="m-i"><Combobox id="m-i" value={icon} onChange={setIcon} options={[{ value: "target", label: "Meta", icon: "target" }, ...ICON_OPTIONS]} /></FormField>
        <FormField label="¿Cuánto necesitas?" htmlFor="m-o" required><MoneyInput id="m-o" value={objetivo} onChange={setObjetivo} /></FormField>
        <FormField label="¿Cuánto llevas ahorrado?" htmlFor="m-a"><MoneyInput id="m-a" value={ahorrado} onChange={setAhorrado} /></FormField>
        <FormField label="¿Para cuándo?" htmlFor="m-f"><DatePicker id="m-f" value={fecha} onChange={setFecha} quick="futuro" /></FormField>
        <FormField label="¿Dónde tienes esta plata?" htmlFor="m-d" tip="Si la plata de la meta está dentro de una de tus cuentas, elígela: ya suma en el saldo de esa cuenta y no se cuenta dos veces en tu patrimonio. Si la guardas aparte (alcancía, bolsillo, CDT que no registraste), suma como ahorro apartado.">
          <Combobox id="m-d" value={donde} onChange={setDonde} options={[{ value: "", label: "Aparte (no está en mis cuentas)", icon: "piggy-bank" }, ...cuentas]} />
        </FormField>
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!nombre.trim() || !(objetivo > 0)} loading={save.isPending} onClick={submit}>Guardar meta</SubmitButton></div>
    </FieldGroup>
  )
}

export function FundDialog({ tipo, onOpenChange, saldo, metaTxt }: { tipo: "guardar" | "usar" | null; onOpenChange: (o: boolean) => void; saldo: number; metaTxt: string }) {
  return (
    <ResponsiveDialog open={!!tipo} onOpenChange={onOpenChange} mdesc="fondo"
      title={tipo === "usar" ? "Usar el fondo para un imprevisto" : "Guardar en el fondo de emergencia"}
      description={tipo === "usar" ? "Registra en qué usaste el fondo. Queda como gasto en la categoría Imprevistos y se descuenta del fondo." : "Anota el dinero que separas para emergencias (por ejemplo, lo que pasas a un bolsillo de Nequi o a una cuenta de ahorros aparte)."}>
      {tipo && <FundBody tipo={tipo} onOpenChange={onOpenChange} saldo={saldo} metaTxt={metaTxt} />}
    </ResponsiveDialog>
  )
}
function FundBody({ tipo, onOpenChange, saldo, metaTxt }: { tipo: "guardar" | "usar"; onOpenChange: (o: boolean) => void; saldo: number; metaTxt: string }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const today = todayISO()
  const { data: methods = [] } = usePaymentMethods()
  const [valor, setValor] = useState(0)
  const [fecha, setFecha] = useState(today)
  const [nota, setNota] = useState("")
  const [medio, setMedio] = useState<string | null>(methods[0]?.id ?? null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!valor) return toast.error("Escribe el valor")
    if (tipo === "usar" && !nota.trim()) return toast.error("Cuéntanos qué pasó")
    setBusy(true)
    if (tipo === "guardar") {
      const { data, error } = await fundSave({ p_book: bookId, p_valor: valor, p_fecha: fecha, p_nota: nota })
      setBusy(false)
      if (error) return toast.error("No se pudo guardar", { description: error.message })
      toast.success("Fondo de emergencia", { description: `Guardaste ${fmtMoney(valor)}. Tu fondo tiene ${fmtMoney(Number(data))}.` })
    } else {
      const { data, error } = await fundUse({ p_book: bookId, p_desc: nota, p_valor: valor, p_fecha: fecha, p_medio: medio ?? undefined })
      setBusy(false)
      if (error) return toast.error("No se pudo registrar", { description: error.message })
      const r = data as { cubre: number; resto: number; saldo: number }
      if (r.resto > 0) toast.warning("Imprevisto registrado", { description: `El fondo cubrió ${fmtMoney(r.cubre)}; los otros ${fmtMoney(r.resto)} salieron de tu dinero del día a día.` })
      else toast.success("Imprevisto registrado", { description: `Pagado con el fondo. Te quedan ${fmtMoney(r.saldo)}.` })
    }
    refresh(qc, bookId)
    onOpenChange(false)
  }
  return (
    <FieldGroup className="pb-2">
      <div className="grid gap-5 sm:grid-cols-2">
        {tipo === "usar" && <FormField label="¿Qué pasó?" htmlFor="fd-n" required className="sm:col-span-2"><Input id="fd-n" className="h-11" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Se dañó la nevera" /></FormField>}
        <FormField label={tipo === "usar" ? "¿Cuánto costó?" : "¿Cuánto guardas?"} htmlFor="fd-v" required hint={tipo === "usar" ? `Tienes ${fmtMoney(saldo)} en el fondo.` : undefined}><MoneyInput id="fd-v" value={valor} onChange={setValor} /></FormField>
        <FormField label="Fecha" htmlFor="fd-f"><DatePicker id="fd-f" value={fecha} onChange={(v) => setFecha(v ?? today)} /></FormField>
        {tipo === "guardar" ? <FormField label="¿Dónde lo guardas?" htmlFor="fd-d" className="sm:col-span-2"><Input id="fd-d" className="h-11" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Bolsillo de Nequi" /></FormField>
          : <FormField label="¿Cómo lo pagaste?" htmlFor="fd-m"><Combobox id="fd-m" value={medio} onChange={setMedio} options={methodOptions(methods)} /></FormField>}
      </div>
      {tipo === "guardar" && <p className="text-sm text-muted-foreground">{metaTxt}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!(valor > 0) || (tipo === "usar" && !nota.trim())} loading={busy} onClick={submit}>{tipo === "usar" ? "Registrar imprevisto" : "Guardar"}</SubmitButton></div>
    </FieldGroup>
  )
}

export type AporteTarget = { t: "fondo" } | { t: "meta"; id: string; nombre: string; mensual: number }

/** Programar aporte fijo (modal "aporte" de la v4): queda como gasto fijo ligado a la meta o al fondo. */
export function AporteDialog({ target, existing, payDays, sugerencia, onOpenChange }: { target: AporteTarget | null; existing: Row<"fixed_expenses"> | null; payDays: PayDays; sugerencia: number; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveDialog open={!!target} onOpenChange={onOpenChange} mdesc="aporte" title={existing ? "Editar aporte programado" : "Programar aporte fijo"}
      description={target ? `Define cuánto vas a guardar en tu ${target.t === "fondo" ? "fondo de emergencia" : `meta “${target.nombre}”`} cada vez que recibas dinero. Queda como gasto fijo: te recordamos la fecha y, al marcarlo como hecho, se suma solo.` : ""}>
      {target && <AporteBody target={target} existing={existing} payDays={payDays} sugerencia={sugerencia} onOpenChange={onOpenChange} />}
    </ResponsiveDialog>
  )
}
function AporteBody({ target, existing, payDays, sugerencia, onOpenChange }: { target: AporteTarget; existing: Row<"fixed_expenses"> | null; payDays: PayDays; sugerencia: number; onOpenChange: (o: boolean) => void }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const today = todayISO()
  const { data: cats = [] } = useCategories()
  const { data: methods = [] } = usePaymentMethods()
  const [frec, setFrec] = useState<"quincenal" | "mensual">((existing?.frec as "quincenal" | "mensual") ?? payDays.frec)
  const [valor, setValor] = useState(Number(existing?.valor ?? aporteSugerido(sugerencia, payDays.frec)))
  const [d1, setD1] = useState(String(existing?.dia ?? (payDays.frec === "quincenal" ? payDays.dia : 15)))
  const [d2, setD2] = useState(String(existing?.dia2 ?? payDays.dia2 ?? 30))
  const [dm, setDm] = useState(String(existing?.frec === "mensual" ? existing.dia : payDays.frec === "mensual" ? payDays.dia : 30))
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!valor) return toast.error("Escribe cuánto vas a guardar")
    setBusy(true)
    const sb = createClient()
    const row = {
      nombre: target.t === "fondo" ? "Aporte a fondo de emergencia" : `Aporte a meta: ${target.nombre}`, category_id: cats.find((c) => c.nombre === "Ahorro")?.id ?? null,
      valor, frec, dia: frec === "quincenal" ? Math.min(15, Math.max(1, +d1 || 15)) : Math.min(31, Math.max(1, +dm || 30)),
      dia2: frec === "quincenal" ? Math.min(31, Math.max(16, +d2 || 30)) : null, variable: false, proveedor: "Yo mismo",
      payment_method_id: methods.find((m) => /transfer/i.test(m.nombre))?.id ?? null, link_type: target.t, link_id: target.t === "meta" ? target.id : null,
    }
    const changed = existing && (existing.frec !== row.frec || existing.dia !== row.dia || existing.dia2 !== row.dia2)
    const { data, error } = existing
      ? await sb.from("fixed_expenses").update({ ...row, ...(changed ? { desde: today.slice(0, 7), inicio: today } : {}) }).eq("id", existing.id).select().single()
      : await sb.from("fixed_expenses").insert({ ...row, book_id: bookId, desde: today.slice(0, 7), inicio: today }).select().single()
    if (!error && target.t === "fondo") await sb.from("emergency_funds").update({ activo: true }).eq("book_id", bookId)
    setBusy(false)
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    const prox = fijoProxIso({ ...data, valor: Number(data.valor), payments: [] } as never, today)
    toast.success(existing ? "Aporte actualizado" : "Aporte programado", { description: `Guardarás ${fmtMoney(valor)} ${frec === "quincenal" ? "cada quincena" : "cada mes"} en tu ${target.t === "fondo" ? "fondo de emergencia" : `meta “${target.nombre}”`}. Primer recordatorio: ${fmtDate(prox)}. También lo verás en Gastos fijos.` })
    refresh(qc, bookId)
    onOpenChange(false)
  }
  const quitar = async () => {
    if (!existing) return
    await createClient().from("fixed_expenses").update({ deleted_at: new Date().toISOString() }).eq("id", existing.id)
    toast("El aporte programado se quitó", { description: "Lo que ya ahorraste se mantiene.", action: { label: "Deshacer", onClick: () => createClient().from("fixed_expenses").update({ deleted_at: null }).eq("id", existing.id).then(() => refresh(qc, bookId)) } })
    refresh(qc, bookId); onOpenChange(false)
  }
  return (
    <FieldGroup className="pb-2">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="¿Cuánto vas a guardar cada vez?" htmlFor="ap-v" required><MoneyInput id="ap-v" value={valor} onChange={setValor} /></FormField>
        <FormField label="¿Cada cuánto?"><Segmented value={frec} onChange={(v) => setFrec(v as typeof frec)} items={[{ value: "quincenal", label: "Cada quincena" }, { value: "mensual", label: "Cada mes" }]} /></FormField>
        {frec === "quincenal" ? (<>
          <FormField label="Día de la 1ª quincena" htmlFor="ap-d1"><Input id="ap-d1" className="h-11" type="number" min={1} max={15} value={d1} onChange={(e) => setD1(e.target.value)} /></FormField>
          <FormField label="Día de la 2ª quincena" htmlFor="ap-d2"><Input id="ap-d2" className="h-11" type="number" min={16} max={31} value={d2} onChange={(e) => setD2(e.target.value)} /></FormField>
        </>) : <FormField label="Día del mes" htmlFor="ap-dm"><Input id="ap-dm" className="h-11" type="number" min={1} max={31} value={dm} onChange={(e) => setDm(e.target.value)} /></FormField>}
      </div>
      <p className="text-sm text-muted-foreground">Pusimos los días en que recibes tu ingreso ({payDays.txt}). Lo ideal es apartarlo apenas te paguen, antes de gastar.
        {target.t === "meta" && target.mensual > 0 && ` Para llegar a tiempo a tu meta necesitas guardar unos ${fmtMoney(Math.ceil(target.mensual / 1000) * 1000)} al mes (${fmtMoney(Math.ceil(target.mensual / 2000) * 1000)} por quincena).`}</p>
      <div className="flex flex-wrap justify-end gap-2">
        {existing && <Button variant="ghost" className="mr-auto text-danger" onClick={quitar}>Quitar aporte</Button>}
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <SubmitButton disabled={!(valor > 0)} loading={busy} onClick={submit}>{existing ? "Guardar cambios" : "Programar aporte"}</SubmitButton>
      </div>
    </FieldGroup>
  )
}
