"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "@/components/mirai/toast"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { SubmitButton, useSubmitState } from "@/components/mirai/submit-button"
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
import { payFixedExpense } from "./commands"
import { FFREC, FSTEP, categoriaSugerida, fijoPeriods, fijoProxIso, fijoValor, fixedReparto, localCat, type FixedExpenseIn } from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { categoryOptions, methodOptions, useCategories, useKeywordRules, useMembers, usePaymentMethods } from "@/features/catalogs/hooks"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { Check, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useList, invalidateBook } from "@/hooks/use-book-data"
import { CategoryDialog } from "@/features/catalogs/category-dialog"
import { ProviderSelect } from "@/features/providers/provider-select"
import { useAICategory } from "@/features/expenses/use-ai-category"

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
  provider_id: z.string().nullable(),
  /** Para quién es el gasto: vacío = toda la familia (general); una o varias personas (se reparte en partes iguales). */
  personas: z.array(z.string()),
  yaPagoQ: z.enum(["no", "q1", "q2", "ambas"]), yaPagoM: z.enum(["no", "si"]),
  fpag: z.string(), vpag: z.number(),
  repQ: z.enum(["igual", "distinto"]), q1: z.number(), q2: z.number(),
})
type Values = z.infer<typeof schema>
/** `preset`: valores iniciales al crear (p. ej. desde Proveedores › "Agregar recordatorio de pago"). */
type Preset = { nombre?: string; provider_id?: string | null; proveedor?: string; payment_method_id?: string | null; category_id?: string | null }
type Props = { open: boolean; onOpenChange: (o: boolean) => void; fixed?: FixedRow | null; preset?: Preset | null }

export function FixedForm(props: Props) {
  const [formId] = useState(() => `fijo-${Math.random().toString(36).slice(2)}`)
  return (
    <ResponsiveDialog open={props.open} onOpenChange={props.onOpenChange} title={props.fixed ? "Editar gasto fijo" : "Agregar gasto fijo"} mdesc="fijo"
      description="Los pagos que se repiten (arriendo, servicios, colegio, planes de celular). Te recordamos antes de cada fecha y los restamos de tu dinero disponible."
      footer={<><Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancelar</Button><SubmitButton form={formId} /></>}>
      <ReadyGate><FixedFormBody {...props} formId={formId} /></ReadyGate>
    </ResponsiveDialog>
  )
}

const toIn = (f: FixedRow): FixedExpenseIn => ({ ...f, valor: Number(f.valor), payments: f.payments.map((p) => ({ ...p, valor: Number(p.valor) })) })

function FixedFormBody({ onOpenChange, fixed, formId, preset }: Props & { formId: string }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const today = todayISO()
  const { data: cats = [] } = useCategories()
  const { data: methods = [] } = usePaymentMethods()
  const { data: members = [] } = useMembers()
  const { data: rules = [] } = useKeywordRules()
  const { data: history = [] } = useList("expenses", { order: { column: "created_at" } })
  const [catManual, setCatManual] = useState(!!fixed || !!preset?.category_id)
  const [newCat, setNewCat] = useState<string | null>(null)
  const ai = useAICategory({ manual: catManual, onCategory: (id) => form.setValue("category_id", id) })
  const plus7 = new Date(new Date(today + "T12:00:00").getTime() + 7 * 864e5).toISOString().slice(0, 10)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: fixed?.nombre ?? preset?.nombre ?? "", category_id: fixed?.category_id ?? preset?.category_id ?? cats.find((c) => c.nombre === "Vivienda")?.id ?? null,
      tipoValor: fixed?.variable ? "rango" : "fijo", valor: Number(fixed?.valor ?? 0), vmin: Number(fixed?.vmin ?? 0), vmax: Number(fixed?.vmax ?? 0),
      frec: fixed?.frec ?? "mensual", prox: fixed ? fijoProxIso(toIn(fixed), today) : fijoProxIso(null, today),
      diaQ1: fixed?.frec === "quincenal" ? Math.min(15, fixed.dia) : 15, dia2: fixed?.dia2 ?? 30,
      fecha: fixed?.fecha_unica ?? plus7, medio: fixed?.payment_method_id ?? preset?.payment_method_id ?? methods[0]?.id ?? null, proveedor: fixed?.proveedor ?? preset?.proveedor ?? "", provider_id: fixed?.provider_id ?? preset?.provider_id ?? null,
      personas: personasDe(fixed),
      yaPagoQ: "no", yaPagoM: "no", fpag: today, vpag: 0,
      repQ: fixedReparto(fixed ?? {}).modo === "distinto" ? "distinto" : "igual", q1: Number(fixedReparto(fixed ?? {}).q1 ?? fixed?.valor ?? 0), q2: Number(fixedReparto(fixed ?? {}).q2 ?? fixed?.valor ?? 0),
    },
  })
  const { errors, isSubmitting } = form.formState
  useSubmitState(formId, form)
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
      payment_method_id: v.medio, proveedor: (v.proveedor ?? "").trim(), provider_id: v.provider_id, reparto,
      // La base sincroniza member_id (la persona si es una sola) para lo que solo conoce una persona.
      member_ids: v.personas.length ? v.personas : null, member_id: v.personas.length === 1 ? v.personas[0] : null,
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
        await payFixedExpense({ p_fixed: nf.id, p_periodo: p.per, p_fecha: v.frec === "quincenal" ? p.due : v.fpag, p_valor: v.vpag || fijoValor({ frec: v.frec, valor, reparto }, p.per), p_medio: v.medio ?? undefined, p_desc_suffix: suf })
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
                // Categoría local al instante (reglas, historial, palabras) y luego la de la IA.
                onChange: (e) => { if (catManual) return; const hit = localCat(e.target.value, { rules, expenses: history, categories: cats }); if (hit) form.setValue("category_id", hit.category_id); ai.ask(e.target.value, form.getValues("valor") || form.getValues("vmax")) },
              })} />
            </FormField>
            <FormField label="Categoría" htmlFor="f-cat" hint={ai.hint}>
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
            <FormField label="¿Para quién es este gasto?" tip="Escoge una o varias personas si el gasto es solo de ellas (el colegio de un hijo, el celular de tu pareja). Si es de toda la casa, deja «Toda la familia». Cuando lo pagues, el gasto queda a su nombre y lo ves en Por miembro; si son varias, se reparte en partes iguales."
              hint={w.personas.length > 1 && (w.valor || w.vmax) ? `Se reparte entre ${w.personas.length}: ${fmtMoney(Math.round((w.tipoValor === "rango" ? (w.vmin + w.vmax) / 2 : w.valor) / w.personas.length))} para cada una.` : undefined}>
              <Controller control={form.control} name="personas" render={({ field }) => (
                <div role="group" aria-label="Personas del gasto" className="flex flex-wrap gap-1.5">
                  <PersonaChip on={!field.value.length} onClick={() => field.onChange([])} label="Toda la familia" icon={<Users className="size-4" />} />
                  {members.map((m) => (
                    <PersonaChip key={m.id} on={field.value.includes(m.id)} label={m.nombre}
                      icon={<UserAvatar src={m.avatar} name={m.nombre} className="size-5" fallbackClassName="text-[9px]" />}
                      onClick={() => field.onChange(field.value.includes(m.id) ? field.value.filter((x) => x !== m.id) : [...field.value, m.id])} />
                  ))}
                </div>
              )} />
            </FormField>
            <FormField label="Medio de pago" htmlFor="f-medio"><Controller control={form.control} name="medio" render={({ field }) => <Combobox id="f-medio" value={field.value} onChange={field.onChange} options={methodOptions(methods)} />} /></FormField>
            <FormField label="Proveedor" htmlFor="f-prov" tip="A quién le pagas: la inmobiliaria, Enel, el colegio… Elígelo de tu lista o escribe el nombre para agregarlo.">
              <Controller control={form.control} name="provider_id" render={({ field }) => (
                <ProviderSelect id="f-prov" value={field.value} fallbackName={w.proveedor} onChange={(id, p) => {
                  field.onChange(id)
                  form.setValue("proveedor", p?.nombre ?? "")
                  // Medio de pago preferido del proveedor (solo al crear).
                  if (!fixed && p?.payment_method_id) form.setValue("medio", p.payment_method_id)
                  if (p && !form.getValues("nombre").trim()) form.setValue("nombre", p.nombre, { shouldValidate: true })
                  // Categoría por defecto del proveedor si aún no la escogió a mano.
                  const c = categoriaSugerida(p, cats)
                  if (c && (!catManual || !form.getValues("category_id"))) form.setValue("category_id", c)
                }} />
              )} />
            </FormField>
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

/** Personas guardadas en un gasto fijo (lista nueva o la persona única de antes). */
function personasDe(f: FixedRow | null | undefined): string[] {
  const x = f as { member_ids?: string[] | null; member_id?: string | null } | null | undefined
  return x?.member_ids?.length ? x.member_ids : x?.member_id ? [x.member_id] : []
}

/** Ficha para marcar una persona (o toda la familia) en "¿Para quién es este gasto?". */
function PersonaChip({ on, onClick, label, icon }: { on: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn("flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors", on ? "bg-brand-soft text-foreground ring-2 ring-brand/50" : "bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground")}>
      {icon}{label}{on && <Check className="size-3.5 text-brand" aria-hidden />}
    </button>
  )
}
