"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { SubmitButton } from "@/components/mirai/submit-button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { Money } from "@/components/mirai/money"
import { Combobox } from "@/components/mirai/combobox"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { useBookId } from "@/components/app/app-context"
import { invalidateBook, useSave } from "@/hooks/use-book-data"
import { apiInsertRow, apiUpdateRow } from "@/lib/api/book-rows"
import { assetCuadrar, assetDescuadrar } from "./commands"
import { esCuentaDinero, type SaldoCuenta } from "@/lib/domain/cuentas"
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import PUC_A from "@/lib/data/legacy-puc_a.json"
import PUC_P from "@/lib/data/legacy-puc_p.json"
import { CURRENCY_OPTIONS, usePaymentMethods } from "@/features/catalogs/hooks"

export const PUC: Record<string, [string, string]> = Object.fromEntries([...PUC_A, ...PUC_P].map(([c, l, i]) => [c, [l, i]]))

/** Cuenta, bien o deuda que se edita (fila de `assets` o `liabilities`). `cuenta`: el saldo calculado, si lo lleva solo. */
export type AssetEdit = {
  table: "assets" | "liabilities"
  row: { id: string; cod: string; nombre: string; valor: number | string; currency: string; saldo_base?: number | string | null; cuenta?: SaldoCuenta }
}

const normName = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()

export function AssetForm({ open, onOpenChange, side: initialSide = "activos", edit }: { open: boolean; onOpenChange: (o: boolean) => void; side?: "activos" | "pasivos"; edit?: AssetEdit | null }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} mdesc="activo" title={edit ? `Actualizar ${edit.row.nombre}` : "Agregar cuenta, bien o deuda"}>
      {open && <Body key={edit?.row.id ?? "nuevo"} onOpenChange={onOpenChange} initialSide={edit ? (edit.table === "assets" ? "activos" : "pasivos") : initialSide} edit={edit} />}
    </ResponsiveDialog>
  )
}

function Body({ onOpenChange, initialSide, edit }: { onOpenChange: (o: boolean) => void; initialSide: "activos" | "pasivos"; edit?: AssetEdit | null }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const { data: methods = [] } = usePaymentMethods()
  const [side, setSide] = useState(initialSide)
  const [cod, setCod] = useState(edit?.row.cod ?? (initialSide === "activos" ? "1110" : "2380"))
  const [nombre, setNombre] = useState(edit?.row.nombre ?? "")
  const [currency, setCurrency] = useState(edit?.row.currency ?? "COP")
  const [valor, setValor] = useState(edit ? Number(edit.row.valor) : 0)
  // Cuentas de dinero nuevas llevan el saldo solas; las que ya existían, solo si ya lo hacían.
  const [auto, setAuto] = useState(edit ? edit.row.saldo_base != null : true)
  const [sel, setSel] = useState<Set<string> | null>(null)
  const [crearMedio, setCrearMedio] = useState(false)
  const [busy, setBusy] = useState(false)
  const saveA = useSave("assets"), saveP = useSave("liabilities")
  const list = side === "activos" ? PUC_A : PUC_P
  const dinero = side === "activos" && esCuentaDinero({ cod })
  const ligados = new Set(methods.filter((m) => edit && m.asset_id === edit.row.id).map((m) => m.id))
  const elegidos = sel ?? ligados
  const toggle = (id: string, on: boolean) => { const n = new Set(elegidos); if (on) n.add(id); else n.delete(id); setSel(n) }
  const nombreLibre = !!nombre.trim() && !methods.some((m) => normName(m.nombre) === normName(nombre))
  const cuenta = edit?.row.cuenta

  const submit = async () => {
    if (!nombre.trim()) return toast.error("Escribe el nombre")
    if (!(valor > 0) && !(dinero && auto && edit)) return toast.error("Escribe el valor")
    setBusy(true)
    try {
      const id = edit?.row.id ?? crypto.randomUUID()
      await (side === "activos" ? saveA : saveP).mutateAsync({ id, cod, nombre: nombre.trim(), valor, currency } as never)
      if (side === "activos") {
        if (dinero && auto) {
          const { error } = await assetCuadrar({ p_asset: id, p_saldo: valor })
          if (error) throw new Error(error.message)
        } else if (edit?.row.saldo_base != null) {
          await assetDescuadrar(id)
        }
        const quiere = (mid: string) => dinero && auto && elegidos.has(mid)
        const cambios = methods.filter((m) => quiere(m.id) !== (m.asset_id === id))
        const medio = { nombre: nombre.trim(), icon: "wallet", sort: methods.length + 1, asset_id: id }
        await Promise.all(cambios.map((m) => apiUpdateRow(bookId, "payment_methods", m.id, { asset_id: quiere(m.id) ? id : null })))
        if (dinero && auto && crearMedio && nombreLibre) await apiInsertRow(bookId, "payment_methods", medio)
        for (const t of ["assets", "payment_methods"]) invalidateBook(qc, bookId, t)
      }
      const txtAuto = dinero && auto ? "Desde ahora el saldo sube y baja solo con tus gastos e ingresos." : undefined
      if (edit) toast.success("Valor actualizado", { description: txtAuto })
      else toast.success("Guardado", { description: txtAuto })
      onOpenChange(false)
    } catch (e) {
      toast.error("No se pudo guardar", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }
  return (
    <FieldGroup className="pb-2">
      {!edit && <ChoiceCards value={side} onChange={(v) => { setSide(v as typeof side); setCod(v === "activos" ? "1110" : "2380") }} items={[
        { value: "activos", label: "Algo que tengo", desc: "Cuentas, efectivo, casa, carro", icon: "wallet" },
        { value: "pasivos", label: "Algo que debo", desc: "Tarjeta, deuda informal, impuestos", icon: "hand-coins" },
      ]} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="¿Qué es?" htmlFor="a-cod"><Combobox id="a-cod" value={cod} onChange={setCod} options={list.map(([c, l, i]) => ({ value: c, label: l, icon: i, hint: `PUC ${c}` }))} /></FormField>
        <FormField label="Nombre" htmlFor="a-nombre" required><Input id="a-nombre" className="h-11" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={side === "activos" ? "Ej. Cuenta de ahorros Bancolombia" : "Ej. Tarjeta Visa"} /></FormField>
        <FormField label="Moneda" htmlFor="a-moneda"><Combobox id="a-moneda" value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} /></FormField>
        <FormField label="Valor hoy" htmlFor="a-valor" required
          tip={dinero && auto ? "El saldo que ves hoy en la app de tu banco. Desde aquí Mirai suma lo que te entra y resta lo que pagas con esta cuenta." : side === "activos" ? "Lo que hay hoy en la cuenta o lo que vale hoy el bien." : "Lo que debes hoy."}>
          <MoneyInput id="a-valor" value={valor} onChange={setValor} currency={currency} decimals />
        </FormField>
      </div>

      {dinero && (
        <div className="grid gap-3 rounded-lg border p-4">
          <label className="flex items-start justify-between gap-3">
            <span className="grid gap-0.5">
              <span className="font-semibold">Que el saldo se actualice solo</span>
              <span className="text-sm text-muted-foreground">Los gastos, ingresos y pagos que registres con los medios de esta cuenta suben o bajan su saldo. Cuando quieras, lo cuadras con tu banco.</span>
            </span>
            <Switch checked={auto} onCheckedChange={setAuto} aria-label="Que el saldo se actualice solo" />
          </label>
          {auto && (
            <div className="grid gap-2">
              <p className="text-sm font-medium">¿Con qué medios de pago usas esta cuenta?</p>
              <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Medios de pago de esta cuenta">
                {methods.map((m) => {
                  const otra = m.asset_id && m.asset_id !== edit?.row.id
                  return (
                    <li key={m.id}>
                      <label className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover", elegidos.has(m.id) && "bg-brand-soft")}>
                        <Checkbox checked={elegidos.has(m.id)} onCheckedChange={(v) => toggle(m.id, v === true)} aria-label={m.nombre} />
                        <span className="min-w-0 flex-1 truncate">{m.nombre}</span>
                        {otra && <span className="shrink-0 text-xs text-muted-foreground">en otra cuenta</span>}
                      </label>
                    </li>
                  )
                })}
              </ul>
              {nombreLibre && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={crearMedio} onCheckedChange={(v) => setCrearMedio(v === true)} aria-label={`Crear el medio de pago ${nombre.trim()}`} />
                  Crear también el medio de pago «{nombre.trim()}» para elegirlo al registrar gastos
                </label>
              )}
              <p className="text-xs text-muted-foreground">Las compras con tarjeta de crédito no bajan la cuenta: la plata sale cuando pagas la tarjeta.</p>
            </div>
          )}
        </div>
      )}

      {cuenta?.vivo && (
        <div className="grid gap-2 rounded-lg bg-muted p-3 text-sm" data-money>
          <p className="font-semibold">Cómo va el saldo</p>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
            <span className="text-muted-foreground">Cuadraste {cuenta.desde ? `el ${fmtDate(cuenta.desde)}` : "la cuenta"}</span><Money value={cuenta.base} />
            <span className="text-muted-foreground">Te entró</span><Money value={cuenta.entra} sign className="text-success" />
            <span className="text-muted-foreground">Salió</span><Money value={-cuenta.sale} sign className="text-danger" />
            <span className="font-semibold">Saldo de hoy</span><Money value={cuenta.saldo} className="font-semibold" />
          </div>
          {cuenta.movs.length > 0 && (
            <ul className="grid divide-y border-t pt-1" aria-label="Movimientos de la cuenta">
              {cuenta.movs.slice(0, 8).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="grid min-w-0"><span className="truncate">{m.n}</span><span className="text-xs text-muted-foreground">{fmtDate(m.fecha)} · {m.s}</span></span>
                  <Money value={m.v} sign className={cn("shrink-0 font-semibold", m.v > 0 ? "text-success" : "text-danger")} />
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Si no coincide con tu banco, escribe arriba el saldo que ves y guarda: la cuenta queda cuadrada desde hoy.</p>
        </div>
      )}

      {edit ? <p className="text-sm text-muted-foreground">Mira el saldo en la app de tu banco y escríbelo aquí. Así tu patrimonio queda al día.</p> : <p className="text-sm text-muted-foreground">Los préstamos con cuotas regístralos en Préstamos y deudas para llevar su plan de pagos.</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!nombre.trim() || !(valor > 0 || (dinero && auto && valor >= 0 && !!edit))} loading={busy || saveA.isPending || saveP.isPending} onClick={submit} /></div>
    </FieldGroup>
  )
}
