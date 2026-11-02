"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "@/components/mirai/toast"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { FormSkeleton } from "@/components/skeletons/form-skeleton"
import { useCatalogsReady } from "@/features/catalogs/hooks"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { Segmented } from "@/components/mirai/choice-cards"
import { useBookId } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { FFREC, FSTEP, fijoPeriods, fijoProxIso, fijoValor, fixedReparto, localCat, type FixedExpenseIn } from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { categoryOptions, methodOptions, useCategories, useKeywordRules, usePaymentMethods } from "@/features/catalogs/hooks"
import { useList, invalidateBook } from "@/hooks/use-book-data"
import { CategoryDialog } from "@/features/catalogs/category-dialog"

export type FixedRow = Row<"fixed_expenses"> & { payments: Row<"fixed_expense_payments">[] }

const schema = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre"),
  category_id: z.string().nullable(),
  tipoValor: z.enum(["fijo", "rango"]),
  valor: z.number(), vmin: z.number(), vmax: z.number(),
  frec: z.string(),
  prox: z.string(),
  diaQ1: z.number().int().min(1).max(15), dia2: z.number().int().min(16).max(31),
  fecha: z.string(),
  medio: z.string().nullable(),
  proveedor: z.string(),
  yaPagoQ: z.enum(["no", "q1", "q2", "ambas"]), yaPagoM: z.enum(["no", "si"]),
  fpag: z.string(), vpag: z.number(),
  repQ: z.enum(["igual", "distinto"]), q1: z.number(), q2: z.number(),
})
type Values = z.infer<typeof schema>
type Props = { open: boolean; onOpenChange: (o: boolean) => void; fixed?: FixedRow | null }

export function FixedForm(props: Props) {
  const [formId] = useState(() => `fijo-${Math.random().toString(36).slice(2)}`)
  return (
    <ResponsiveDialog open={props.open} onOpenChange={props.onOpenChange} title={props.fixed ? "Editar gasto fijo" : "Agregar gasto fijo"} mdesc="fijo"
      description="Los pagos que se repiten (arriendo, servicios, colegio, planes de celular). Te recordamos antes de cada fecha y los restamos de tu dinero disponible."
      footer={<><Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancelar</Button><Button type="submit" form={formId}>Guardar</Button></>}>
      <ReadyGate><FixedFormBody {...props} formId={formId} /></ReadyGate>
    </ResponsiveDialog>
  )
}

const toIn = (f: FixedRow): FixedExpenseIn => ({ ...f, valor: Number(f.valor), payments: f.payments.map((p) => ({ ...p, valor: Number(p.valor) })) })

function FixedFormBody({ onOpenChange, fixed, formId }: Props & { formId: string }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const today = todayISO()
  const { data: cats = [] } = useCategories()
  const { data: methods = [] } = usePaymentMethods()
  const { data: rules = [] } = useKeywordRules()
  const { data: history = [] } = useList("expenses", { order: { column: "created_at" } })
  const [catManual, setCatManual] = useState(!!fixed)
  const [newCat, setNewCat] = useState<string | null>(null)
  const plus7 = new Date(new Date(today + "T12:00:00").getTime() + 7 * 864e5).toISOString().slice(0, 10)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: fixed?.nombre ?? "", category_id: fixed?.category_id ?? cats.find((c) => c.nombre === "Vivienda")?.id ?? null,
      tipoValor: fixed?.variable ? "rango" : "fijo", valor: Number(fixed?.valor ?? 0), vmin: Number(fixed?.vmin ?? 0), vmax: Number(fixed?.vmax ?? 0),
      frec: fixed?.frec ?? "mensual", prox: fixed ? fijoProxIso(toIn(fixed), today) : fijoProxIso(null, today),
      diaQ1: fixed?.frec === "quincenal" ? Math.min(15, fixed.dia) : 15, dia2: fixed?.dia2 ?? 30,
      fecha: fixed?.fecha_unica ?? plus7, medio: fixed?.payment_method_id ?? methods[0]?.id ?? null, proveedor: fixed?.proveedor ?? "",
      yaPagoQ: "no", yaPagoM: "no", fpag: today, vpag: 0,
      repQ: fixedReparto(fixed ?? {}).modo === "distinto" ? "distinto" : "igual", q1: Number(fixedReparto(fixed ?? {}).q1 ?? fixed?.valor ?? 0), q2: Number(fixedReparto(fixed ?? {}).q2 ?? fixed?.valor ?? 0),
    },
  })
  const { errors, isSubmitting } = form.formState
  const w = form.watch()
  const step = FSTEP[w.frec]

  async function onSubmit(v: Values) {
    const rg = v.tipoValor === "rango"
    let { vmin, vmax } = v
    if (rg) {
      if (!vmin && !vmax) return toast.error("Escribe el valor mínimo y máximo que sueles pagar")
      vmin ||= vmax; vmax ||= vmin
      if (vmin > vmax) [vmin, vmax] = [vmax, vmin]
    }
    // Quincenal con un valor distinto en cada quincena: `valor` guarda el promedio (el total del mes no cambia).
    const dist = !rg && v.frec === "quincenal" && v.repQ === "distinto"
    if (dist ? !v.q1 && !v.q2 : !rg && !v.valor) return toast.error(dist ? "Escribe el valor de al menos una quincena" : "Escribe el valor")
    const valor = rg ? Math.round((vmin + vmax) / 2) : dist ? Math.round((v.q1 + v.q2) / 2) : v.valor
    const reparto = dist ? { modo: "distinto", q1: v.q1, q2: v.q2 } : null
    const prox = new Date(v.prox + "T12:00:00")
    const o = {
      nombre: v.nombre.trim(), category_id: v.category_id ?? cats.find((c) => c.nombre === "Otros")?.id ?? null, valor,
      vmin: rg ? vmin : null, vmax: rg ? vmax : null, frec: v.frec, variable: rg,
      dia: v.frec === "quincenal" ? Math.min(15, Math.max(1, Math.round(v.diaQ1 || 15))) : step ? prox.getDate() : 1,
      dia2: v.frec === "quincenal" ? Math.min(31, Math.max(16, Math.round(v.dia2 || 30))) : null,
      mes: step ? prox.getMonth() + 1 : null, fecha_unica: v.frec === "unico" ? v.fecha : null,
      payment_method_id: v.medio, proveedor: v.proveedor.trim(), reparto,
    }
    const desde = step && v.prox ? v.prox.slice(0, 7) : today.slice(0, 7)
    const inicio = step && v.prox ? v.prox : today
    const sb = createClient()
    if (fixed) {
      const reanc = (step && v.prox && fijoProxIso(toIn(fixed), today) !== v.prox) || fixed.frec !== v.frec
      const { error } = await sb.from("fixed_expenses").update({ ...o, ...(reanc ? { desde, inicio } : {}) }).eq("id", fixed.id)
      if (error) return toast.error("No se pudo guardar", { description: error.message })
      toast.success("Gasto fijo actualizado", { description: `Cambios guardados en ${o.nombre}.` })
    } else {
      const { data: nf, error } = await sb.from("fixed_expenses").insert({ ...o, book_id: bookId, desde, inicio }).select().single()
      if (error) return toast.error("No se pudo guardar", { description: error.message })
      // ¿Ya lo pagó este mes?
      const [y, m] = today.split("-").map(Number)
      const pers = fijoPeriods({ ...nf, valor: Number(nf.valor) } as never, y, m - 1, today)
      const toPay = v.frec === "quincenal"
        ? pers.filter((p) => v.yaPagoQ === "ambas" || p.per.endsWith(v.yaPagoQ === "q1" ? "Q1" : v.yaPagoQ === "q2" ? "Q2" : "--"))
        : v.yaPagoM === "si" ? [{ per: `prev-${v.fpag.slice(0, 7)}`, due: v.fpag }] : []
      for (const p of toPay) {
        const suf = p.per.endsWith("Q1") ? " (1ª quincena)" : p.per.endsWith("Q2") ? " (2ª quincena)" : ""
        await sb.rpc("pay_fixed_expense", { p_fixed: nf.id, p_periodo: p.per, p_fecha: v.frec === "quincenal" ? p.due : v.fpag, p_valor: v.vpag || fijoValor({ frec: v.frec, valor, reparto }, p.per), p_medio: v.medio ?? undefined, p_desc_suffix: suf })
      }
      const st = fijoProxIso({ ...nf, valor: Number(nf.valor), payments: toPay.map((p) => ({ periodo: p.per, fecha: v.fpag, valor })) } as never, today)
      toast.success(`${o.nombre} guardado`, {
        description: (toPay.length ? `Pago registrado el ${fmtDate(v.frec === "quincenal" ? toPay[0].due : v.fpag)}${v.yaPagoQ === "ambas" ? " (las dos quincenas)" : ""}.` : "Te recordaremos antes de cada fecha.") + ` Próximo pago: ${fmtDate(st)}.`,
      })
    }
    invalidateBook(qc, bookId, "fixed_expenses")
    invalidateBook(qc, bookId, "expenses")
    onOpenChange(false)
  }

  return (
    <>
      <form id={formId} onSubmit={form.handleSubmit(onSubmit)} noValidate aria-busy={isSubmitting}>
        <FieldGroup>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Nombre" htmlFor="f-nombre" error={errors.nombre?.message} required>
              <Input id="f-nombre" className="h-11" autoFocus placeholder="Ej. Arriendo, Energía, Internet" {...form.register("nombre", {
                onChange: (e) => { if (catManual) return; const hit = localCat(e.target.value, { rules, expenses: history, categories: cats }); if (hit) form.setValue("category_id", hit.category_id) },
              })} />
            </FormField>
            <FormField label="Categoría" htmlFor="f-cat">
              <Controller control={form.control} name="category_id" render={({ field }) => (
                <Combobox id="f-cat" value={field.value} onChange={(v) => { setCatManual(true); field.onChange(v) }} options={categoryOptions(cats)} onCreate={(t) => setNewCat(t || " ")} />
              )} />
            </FormField>
          </div>
          <FormField label="¿El valor cambia cada mes?" hint={w.tipoValor === "rango" ? "Los servicios como agua, luz, gas, internet o planes móviles cambian según el consumo." : undefined}>
            <Controller control={form.control} name="tipoValor" render={({ field }) => (
              <Segmented value={field.value} onChange={field.onChange} items={[{ value: "fijo", label: "Siempre es igual" }, { value: "rango", label: "Varía según consumo", icon: "activity" }]} />
            )} />
          </FormField>
          {w.tipoValor === "fijo" && w.frec === "quincenal" && (
            <FormField label="¿Pagas lo mismo en las dos quincenas?" hint={w.repQ === "distinto" ? "Por ejemplo, el arriendo partido: una parte en la 1ª quincena y el resto en la 2ª." : undefined}>
              <Controller control={form.control} name="repQ" render={({ field }) => (
                <Segmented value={field.value} onChange={field.onChange} items={[{ value: "igual", label: "Sí, lo mismo" }, { value: "distinto", label: "No, cambia", icon: "split" }]} />
              )} />
            </FormField>
          )}
          {w.tipoValor === "fijo" && w.frec === "quincenal" && w.repQ === "distinto" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="1ª quincena" htmlFor="f-q1"><Controller control={form.control} name="q1" render={({ field }) => <MoneyInput id="f-q1" value={field.value} onChange={field.onChange} />} /></FormField>
              <FormField label="2ª quincena" htmlFor="f-q2" hint={w.q1 || w.q2 ? `Al mes: ${fmtMoney((w.q1 || 0) + (w.q2 || 0))}` : undefined}><Controller control={form.control} name="q2" render={({ field }) => <MoneyInput id="f-q2" value={field.value} onChange={field.onChange} />} /></FormField>
            </div>
          ) : w.tipoValor === "fijo" ? (
            <FormField label={w.frec === "quincenal" ? "Valor de cada quincena" : "Valor"} htmlFor="f-valor" required>
              <Controller control={form.control} name="valor" render={({ field }) => <MoneyInput id="f-valor" value={field.value} onChange={field.onChange} />} />
            </FormField>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Lo mínimo que pagas" htmlFor="f-vmin"><Controller control={form.control} name="vmin" render={({ field }) => <MoneyInput id="f-vmin" value={field.value} onChange={field.onChange} />} /></FormField>
              <FormField label="Lo máximo que pagas" htmlFor="f-vmax"><Controller control={form.control} name="vmax" render={({ field }) => <MoneyInput id="f-vmax" value={field.value} onChange={field.onChange} />} /></FormField>
            </div>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="¿Cada cuánto?" htmlFor="f-frec">
              <Controller control={form.control} name="frec" render={({ field }) => <Combobox id="f-frec" value={field.value} onChange={field.onChange} options={Object.entries(FFREC).map(([value, label]) => ({ value, label }))} />} />
            </FormField>
            {step ? (
              <FormField label="Próximo pago" htmlFor="f-prox" hint={w.frec === "anual" ? "Se repite cada año en esta fecha." : w.frec !== "mensual" ? "Desde esta fecha contamos cada cuántos meses toca." : undefined}>
                <Controller control={form.control} name="prox" render={({ field }) => <DatePicker id="f-prox" value={field.value} onChange={(v) => field.onChange(v ?? today)} quick="futuro" />} />
              </FormField>
            ) : w.frec === "unico" ? (
              <FormField label="Fecha del pago" htmlFor="f-fecha"><Controller control={form.control} name="fecha" render={({ field }) => <DatePicker id="f-fecha" value={field.value} onChange={(v) => field.onChange(v ?? today)} quick="futuro" />} /></FormField>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Día 1ª quincena" htmlFor="f-d1" error={errors.diaQ1 ? "Entre 1 y 15" : undefined}><Input id="f-d1" className="h-11" type="number" min={1} max={15} {...form.register("diaQ1", { valueAsNumber: true })} /></FormField>
                <FormField label="Día 2ª quincena" htmlFor="f-d2" error={errors.dia2 ? "Entre 16 y 31" : undefined}><Input id="f-d2" className="h-11" type="number" min={16} max={31} {...form.register("dia2", { valueAsNumber: true })} /></FormField>
              </div>
            )}
            <FormField label="Medio de pago" htmlFor="f-medio"><Controller control={form.control} name="medio" render={({ field }) => <Combobox id="f-medio" value={field.value} onChange={field.onChange} options={methodOptions(methods)} />} /></FormField>
            <FormField label="Proveedor" htmlFor="f-prov" tip="A quién le pagas: la inmobiliaria, Enel, el colegio…"><Input id="f-prov" className="h-11" {...form.register("proveedor")} /></FormField>
          </div>
          {!fixed && w.frec === "quincenal" && (
            <FormField label="¿Ya pagaste este mes?">
              <Controller control={form.control} name="yaPagoQ" render={({ field }) => (
                <Segmented value={field.value} onChange={field.onChange} items={[{ value: "no", label: "Todavía no" }, { value: "q1", label: "La 1ª quincena" }, { value: "q2", label: "La 2ª" }, { value: "ambas", label: "Las dos" }]} />
              )} />
            </FormField>
          )}
          {!fixed && w.frec !== "quincenal" && w.frec !== "unico" && (
            <FormField label="¿Ya lo pagaste este mes?">
              <Controller control={form.control} name="yaPagoM" render={({ field }) => (
                <Segmented value={field.value} onChange={field.onChange} items={[{ value: "no", label: "Todavía no" }, { value: "si", label: "Sí, ya lo pagué" }]} />
              )} />
            </FormField>
          )}
          {!fixed && (w.yaPagoM === "si" || w.yaPagoQ !== "no") && (
            <div className="grid gap-5 sm:grid-cols-2">
              {w.yaPagoM === "si" && <FormField label="¿Cuándo lo pagaste?" htmlFor="f-fpag"><Controller control={form.control} name="fpag" render={({ field }) => <DatePicker id="f-fpag" value={field.value} onChange={(v) => field.onChange(v ?? today)} />} /></FormField>}
              <FormField label="¿Cuánto pagaste?" htmlFor="f-vpag" hint="Si lo dejas vacío usamos el valor del gasto fijo."><Controller control={form.control} name="vpag" render={({ field }) => <MoneyInput id="f-vpag" value={field.value} onChange={field.onChange} />} /></FormField>
            </div>
          )}
          {isSubmitting && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Guardando…</p>}
        </FieldGroup>
      </form>
      <CategoryDialog open={newCat !== null} onOpenChange={(o) => !o && setNewCat(null)} initialName={newCat?.trim() ?? ""} onCreated={(id) => { setCatManual(true); form.setValue("category_id", id) }} />
    </>
  )
}

/** Monta el formulario cuando los catálogos ya cargaron (skeleton mientras tanto). */
function ReadyGate({ children }: { children: React.ReactNode }) {
  return useCatalogsReady() ? <>{children}</> : <FormSkeleton />
}
