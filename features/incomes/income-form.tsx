"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { FormSkeleton } from "@/components/skeletons/form-skeleton"
import { useCatalogsReady } from "@/features/catalogs/hooks"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { Combobox } from "@/components/mirai/combobox"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { Money } from "@/components/mirai/money"
import { Icon } from "@/components/mirai/icon"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown } from "lucide-react"
import { useSave } from "@/hooks/use-book-data"
import {
  DED_EN, DIAS_SEMANA, MESES_LARGOS, TIPOS_INGRESO, dedAMes, incomeReparto, planIngreso, quincenaDeDia, smmlvFor, tipoIngreso, uvtFor,
  type Deducciones, type IncomeReparto, type NominaCfg, type PlanIngreso, type TipoIngreso,
} from "@/lib/domain"
import { fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { CURRENCY_OPTIONS, memberOptions, useIncomeCategories, useMembers, useSettings } from "@/features/catalogs/hooks"
import { DeductionsEditor, defaultDed } from "./deductions-editor"

const FRECS = [
  { value: "mensual", label: "Cada mes" },
  { value: "quincenal", label: "Cada quincena" },
  { value: "semanal", label: "Cada semana" },
  { value: "diario", label: "Cada día" },
  { value: "anual", label: "Una vez al año" },
]

/** La pregunta de descuentos según el tipo de trabajador que corresponde al tipo de ingreso. */
const PREGUNTA_DESC: Record<string, string> = {
  empleado: "¿Te descuentan salud, pensión, fondo de solidaridad o retención en la fuente?",
  independiente: "¿Pagas salud, pensión y ARL con este ingreso?",
  pensionado: "¿Te descuentan salud de la mesada?",
  otro: "¿Te descuentan algo de este ingreso?",
}

const TIPOS = TIPOS_INGRESO.map((t) => t.value) as [TipoIngreso, ...TipoIngreso[]]
const schema = z.object({
  tipo: z.enum(TIPOS, { error: "Escoge el tipo de ingreso" }),
  concepto: z.string().trim().min(1, "Escribe un nombre para este ingreso"),
  desc: z.enum(["si", "no"], { error: "Cuéntanos si te descuentan algo" }),
  /** Valor del mes (antes de descuentos si los hay; el del pago si es anual). */
  mensual: z.number(),
  currency: z.string(),
  frec: z.enum(["mensual", "quincenal", "semanal", "diario", "anual"], { error: "Escoge cada cuánto te pagan" }),
  // Quincenal: lo de cada quincena (por defecto la mitad del mes), en cuál se descuenta y cuánto en la 1ª si es "pers".
  b1: z.number(), b2: z.number(),
  ded: z.enum(["mitad", "q1", "q2", "pers"]), x1: z.number(),
  dias: z.number().int().min(1, "Entre 1 y 31").max(31, "Entre 1 y 31"),
  dia: z.number().int().min(1).max(31),
  d1: z.number().int().min(1).max(15), d2: z.number().int().min(16).max(31),
  dow: z.string(), mes: z.string(), quien: z.string(),
})
type Values = z.infer<typeof schema>
type Props = { open: boolean; onOpenChange: (o: boolean) => void; income?: Row<"incomes"> | null }

const tipoDef = (t: TipoIngreso) => TIPOS_INGRESO.find((x) => x.value === t) ?? TIPOS_INGRESO[TIPOS_INGRESO.length - 1]
/** Pagos por mes de la frecuencia (anual: el valor ya es el del pago). */
const veces = (frec: string, dias: number) => (frec === "diario" ? Math.max(1, dias || 30) : frec === "semanal" ? 52 / 12 : frec === "quincenal" ? 2 : 1)

export function IncomeForm(props: Props) {
  const [formId] = useState(() => `ingreso-${Math.random().toString(36).slice(2)}`)
  return (
    <ResponsiveDialog open={props.open} onOpenChange={props.onOpenChange} wide="xl" title={props.income ? "Editar ingreso" : "Agregar ingreso"}
      description="A la izquierda nos cuentas cómo es tu ingreso; a la derecha ves cómo va quedando lo que te llega en cada pago."
      footer={<><Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancelar</Button><Button type="submit" form={formId}>Guardar</Button></>}>
      <ReadyGate><IncomeFormBody {...props} formId={formId} /></ReadyGate>
    </ResponsiveDialog>
  )
}

function IncomeFormBody({ onOpenChange, income, formId }: Props & { formId: string }) {
  const save = useSave("incomes")
  const saveCat = useSave("income_categories")
  const { data: cats = [] } = useIncomeCategories()
  const { data: members = [] } = useMembers()
  const { data: cfg } = useSettings()
  const year = Number(todayISO().slice(0, 4))
  const nomina = (cfg?.nomina ?? {}) as NominaCfg
  const ref = { smmlv: smmlvFor(year, cfg?.smmlv as Record<string, number>), uvt: uvtFor(year, cfg?.uvt as Record<string, number>), fsp: nomina.fsp }
  const corte = Number(cfg?.corte_q) || 15

  // Valores de un ingreso guardado (también los del formulario de antes, sin tipo ni valor del mes). En uno nuevo no se
  // marca nada: cada pregunta aparece cuando se responde la anterior.
  const R = incomeReparto(income ?? {})
  const tipo0 = income ? tipoIngreso(income, cats.find((c) => c.id === income.category_id)?.nombre ?? "") : undefined
  const frec0 = income?.frec as Values["frec"] | undefined
  const hasBruto = !!income?.bruto && Number(income.bruto) > 0
  const base = hasBruto ? Number(income!.bruto) : Number(income?.valor ?? 0)
  const b10 = R.b1 ?? base, b20 = R.b2 ?? base
  const mensual0 = R.mensual ?? (frec0 === "quincenal" ? b10 + b20 : Math.round(base * veces(frec0 ?? "mensual", R.dias ?? 30)))
  const [ded, setDed] = useState<Deducciones>(() => (income?.deducciones ? dedAMes(income.deducciones as Deducciones, income.frec) : defaultDed(tipo0 ? tipoDef(tipo0).ded : "empleado", nomina)))
  const [verDesc, setVerDesc] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo: tipo0 as TipoIngreso, concepto: income?.concepto ?? "", desc: (income ? (hasBruto ? "si" : "no") : undefined) as Values["desc"],
      mensual: mensual0, currency: income?.currency ?? "COP", frec: frec0 as Values["frec"],
      b1: frec0 === "quincenal" ? b10 : Math.round(mensual0 / 2), b2: frec0 === "quincenal" ? b20 : mensual0 - Math.round(mensual0 / 2),
      ded: R.ded ?? "mitad", x1: R.x1 ?? 0, dias: R.dias ?? 30,
      dia: income?.dia ?? 30, d1: R.d1 ?? 15, d2: R.d2 ?? (income ? 31 : 30), dow: String(R.dow ?? 5), mes: String(R.mes ?? 12),
      quien: income?.member_id ?? "familia",
    },
  })
  const { errors, isSubmitting } = form.formState
  const w = form.watch()
  const td = w.tipo ? tipoDef(w.tipo) : null
  const q = w.frec === "quincenal"
  const conDesc = w.desc === "si" && w.currency === "COP"
  // Qué se muestra: cada paso aparece cuando el anterior ya tiene respuesta.
  const verMonto = !!td && (!!w.desc || w.currency !== "COP")
  const verFrec = verMonto && w.mensual > 0
  const verPagos = verFrec && !!w.frec
  const plan = planIngreso({ frec: w.frec ?? "mensual", mensual: w.mensual, b1: w.b1, b2: w.b2, dias: w.dias, D: conDesc ? ded : null, ref, ded: w.ded, x1: w.ded === "pers" ? w.x1 : undefined })

  // El valor del mes y los de cada pago se mueven juntos: cambiar el mes reparte de nuevo y cambiar un pago suma el mes.
  const set = (k: keyof Values, v: unknown) => form.setValue(k, v as never, { shouldDirty: true, shouldValidate: !!errors[k] })
  const setMensual = (M: number) => { set("mensual", M); set("b1", Math.round(M / 2)); set("b2", M - Math.round(M / 2)) }
  const setQuincena = (k: "b1" | "b2", v: number) => { set(k, v); set("mensual", v + (form.getValues(k === "b1" ? "b2" : "b1") || 0)) }
  const setFrec = (f: string) => { set("frec", f); const M = form.getValues("mensual"); set("b1", Math.round(M / 2)); set("b2", M - Math.round(M / 2)) }
  const setTipo = (t: TipoIngreso) => {
    const t0 = form.getValues("tipo"), nt = tipoDef(t)
    set("tipo", t)
    const c = form.getValues("concepto").trim()
    if (!c || (t0 && c === tipoDef(t0).label)) set("concepto", nt.label)
    setDed({ ...defaultDed(nt.ded, nomina), otros: ded.otros })
  }
  const setDedEn = (v: string) => { set("ded", v); if (v === "pers" && !form.getValues("x1")) set("x1", Math.round(plan.desc / 2)) }

  async function onSubmit(v: Values) {
    const conD = v.desc === "si" && v.currency === "COP"
    const p = planIngreso({ frec: v.frec, mensual: v.mensual, b1: v.b1, b2: v.b2, dias: v.dias, D: conD ? ded : null, ref, ded: v.ded, x1: v.ded === "pers" ? v.x1 : undefined })
    if (!(p.mensual > 0)) return void form.setError("mensual", { message: "Escribe cuánto recibes" })
    const t = tipoDef(v.tipo)
    // Categoría: la del tipo de ingreso (se crea si el libro no la tiene); al editar sin cambiar el tipo se respeta la que tenía.
    let category_id = income?.category_id ?? null
    if (!(income && category_id && v.tipo === tipo0)) {
      const found = cats.find((c) => t.cat.some((n) => n.toLowerCase() === c.nombre.toLowerCase())) ?? (v.tipo !== "otro" ? cats.find((c) => t.re.test(c.nombre)) : undefined)
      category_id = found?.id ?? (await saveCat.mutateAsync({ nombre: t.cat[0], icon: t.icon, sort: cats.length + 1 } as never)).id
    }
    const quinc = v.frec === "quincenal"
    const reparto: IncomeReparto = {
      tipo: v.tipo, mensual: Math.round(p.mensual),
      ...(quinc ? {
        modo: Math.abs(v.b1 - v.b2) <= 1 ? "igual" as const : "distinto" as const, b1: v.b1, b2: v.b2, n1: p.pagos[0].neto, n2: p.pagos[1].neto,
        ...(conD ? { ded: v.ded, ...(v.ded === "pers" ? { x1: p.pagos[0].desc } : {}) } : {}), d1: Math.round(v.d1 || 15), d2: Math.round(v.d2 || 30),
      } : {}),
      ...(v.frec === "semanal" ? { dow: +v.dow } : {}),
      ...(v.frec === "diario" ? { dias: v.dias } : {}),
      ...(v.frec === "anual" ? { mes: +v.mes } : {}),
    }
    // `valor` y `bruto` guardan el promedio por pago: valor × pagos del mes da el total del mes en todo Mirai.
    await save.mutateAsync({
      ...(income ? { id: income.id } : {}),
      concepto: v.concepto.trim(), category_id, frec: v.frec, dia: Math.round(v.dia || 30), currency: v.currency,
      member_id: v.quien === "familia" ? null : v.quien,
      valor: p.valor, bruto: conD ? p.bruto : null, deducciones: conD ? ({ ...ded, mes: true } as never) : null, reparto: reparto as never,
    } as never)
    const msg = quinc
      ? `1ª quincena te llegan ${fmtMoney(p.pagos[0].neto)} y 2ª quincena ${fmtMoney(p.pagos[1].neto)}${conD ? ` (descuentos del mes: ${fmtMoney(p.desc)})` : ""}.`
      : `Te llegan ${fmtMoney(p.pagos[0].neto)} ${v.frec === "semanal" ? "cada semana" : v.frec === "diario" ? "cada día" : v.frec === "anual" ? "en el pago" : "al mes"}${conD ? ` después de ${fmtMoney(p.desc)} en descuentos` : ""}.`
    toast.success("Ingreso guardado", { description: msg + " Esos son los valores que usamos en tu presupuesto." })
    onOpenChange(false)
  }

  const money = (name: "mensual" | "b1" | "b2" | "x1", id: string, onChange: (v: number) => void) => (
    <Controller control={form.control} name={name} render={({ field }) => <MoneyInput id={id} value={field.value} onChange={onChange} currency={w.currency} invalid={!!errors[name]} />} />
  )
  const anual = w.frec === "anual"
  const labelMes = anual ? "¿Cuánto recibes en ese pago?" : conDesc ? (td?.ded === "empleado" ? "¿Cuánto ganas al mes? (sueldo antes de descuentos)" : "¿Cuánto recibes al mes? (antes de descuentos)") : "¿Cuánto recibes al mes?"
  const diaQ = (n: 1 | 2) => (n === 1 ? `día ${w.d1 || 15}` : (w.d2 || 30) >= 31 ? "fin de mes" : `día ${w.d2}`)

  return (
    <form id={formId} onSubmit={form.handleSubmit(onSubmit)} noValidate aria-busy={isSubmitting} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <FieldGroup>
        <FormField label="¿Qué tipo de ingreso es?" tip={false} hint={td?.desc} error={errors.tipo?.message}>
          <Controller control={form.control} name="tipo" render={({ field }) => (
            <ChoiceCards name="tipo" value={field.value} onChange={(v) => setTipo(v as TipoIngreso)} cols={4} items={TIPOS_INGRESO.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))} />
          )} />
        </FormField>

        {td && <FormField label="Concepto" htmlFor="i-concepto" error={errors.concepto?.message} required hint="El nombre con el que lo verás. Ej. Salario Altipal, Auxilio de conectividad.">
          <Input id="i-concepto" className="h-11" placeholder="Ej. Salario de Ana" {...form.register("concepto")} />
        </FormField>}

        {td && w.currency === "COP" && (
          <FormField label={PREGUNTA_DESC[td.ded]} error={errors.desc?.message} tip={td.ded === "empleado" ? "Como empleado te descuentan salud (4 %), pensión (4 %), fondo de solidaridad (si ganas 4 salarios mínimos o más) y, según lo que ganes, retención en la fuente." : false}>
            <Controller control={form.control} name="desc" render={({ field }) => (
              <ChoiceCards name="desc" value={field.value} onChange={field.onChange} items={[
                { value: "si", label: "Sí, me descuentan", desc: "Escribe el valor antes de descuentos y calculamos lo que te llega", icon: "calculator" },
                { value: "no", label: "No, me llega completo", desc: "Escribe lo que te llega a la cuenta", icon: "wallet" },
              ]} />
            )} />
          </FormField>
        )}

        {verMonto && <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
          <FormField label={labelMes} htmlFor="i-mensual" error={errors.mensual?.message} required
            hint={!anual && conDesc && td?.ded === "empleado" ? "Es el \"Sueldo\" de tu contrato o de tu desprendible de nómina, el del mes completo." : undefined}>
            {money("mensual", "i-mensual", setMensual)}
          </FormField>
          <FormField label="Moneda" htmlFor="i-moneda">
            <Controller control={form.control} name="currency" render={({ field }) => <Combobox id="i-moneda" value={field.value} onChange={field.onChange} options={CURRENCY_OPTIONS} />} />
          </FormField>
        </div>}

        {verFrec && conDesc && td && (
          <Collapsible open={verDesc} onOpenChange={setVerDesc} className="rounded-lg border">
            <CollapsibleTrigger className="flex w-full items-center gap-3 p-3 text-left">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-brand"><Icon name="sliders-horizontal" className="size-[18px]" /></span>
              <span className="grid flex-1 gap-0.5">
                <span className="text-sm font-semibold">Ajustar descuentos</span>
                <span className="text-xs text-muted-foreground">{plan.items.length ? `Calculamos ${plan.items.map((i) => i.n.toLowerCase()).join(", ")}. Ábrelo si tu desprendible dice otra cosa.` : "Con este valor no hay descuentos de ley. Ábrelo para agregar uno."}</span>
              </span>
              <ChevronDown className={`size-4 shrink-0 transition-transform ${verDesc ? "rotate-180" : ""}`} aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t p-3">
              <DeductionsEditor value={ded} onChange={setDed} bruto={w.mensual || 0} frec={anual ? "anual" : "mensual"} smmlv={ref.smmlv} uvt={ref.uvt} fsp={ref.fsp} tipoFijo={ded.tipo === td.ded} sinResumen />
            </CollapsibleContent>
          </Collapsible>
        )}

        {verFrec && <FormField label="¿Cada cuánto te pagan?" error={errors.frec?.message} tip={false} hint={!anual && w.mensual > 0 && w.frec !== "mensual" ? `Repartimos ${fmtMoney(w.mensual)} del mes en cada pago. Puedes cambiar cada valor.` : undefined}>
          <Controller control={form.control} name="frec" render={({ field }) => <Segmented value={field.value ?? ""} onChange={setFrec} items={FRECS} />} />
        </FormField>}

        {verPagos && q && (
          <>
            <div className="grid grid-cols-2 gap-5">
              <FormField label="1ª quincena" htmlFor="i-b1" hint={conDesc ? "Antes de descuentos" : undefined}>{money("b1", "i-b1", (v) => setQuincena("b1", v))}</FormField>
              <FormField label="2ª quincena" htmlFor="i-b2" hint={conDesc ? "Antes de descuentos" : undefined}>{money("b2", "i-b2", (v) => setQuincena("b2", v))}</FormField>
            </div>
            {conDesc && plan.desc > 0 && (
              <FormField label="¿En qué quincena te hacen los descuentos?" tip="Muchas empresas pagan la 1ª quincena completa y en la 2ª descuentan salud, pensión, fondo de solidaridad y retención de todo el mes. Míralo en tu desprendible.">
                <Controller control={form.control} name="ded" render={({ field }) => (
                  <ChoiceCards name="ded" value={field.value} onChange={setDedEn} items={DED_EN.map((d) => ({ value: d.value, label: d.label, desc: d.desc, icon: d.value === "mitad" || d.value === "pers" ? "split" : "calendar" }))} />
                )} />
              </FormField>
            )}
            {conDesc && plan.desc > 0 && w.ded === "pers" && (
              <FormField label="Descuentos en la 1ª quincena" htmlFor="i-x1" hint={<>En la 2ª quincena: <Money value={plan.pagos[1].desc} /> (de <Money value={plan.desc} /> del mes).</>}>
                {money("x1", "i-x1", (v) => set("x1", v))}
              </FormField>
            )}
            <div className="grid grid-cols-2 gap-5">
              <FormField label="Día de pago 1ª quincena" htmlFor="i-d1" error={errors.d1 ? "Entre 1 y 15" : undefined}><Input id="i-d1" className="h-11" type="number" min={1} max={15} {...form.register("d1", { valueAsNumber: true })} /></FormField>
              <FormField label="Día de pago 2ª quincena" htmlFor="i-d2" error={errors.d2 ? "Entre 16 y 31" : undefined} hint="31 = el último día de cada mes."><Input id="i-d2" className="h-11" type="number" min={16} max={31} {...form.register("d2", { valueAsNumber: true })} /></FormField>
            </div>
          </>
        )}
        {verPagos && w.frec === "semanal" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Cada semana" htmlFor="i-sem" hint={conDesc ? "Antes de descuentos. Un mes tiene en promedio 4,33 semanas." : "Un mes tiene en promedio 4,33 semanas."}>
              <MoneyInput id="i-sem" value={Math.round(((w.mensual || 0) * 12) / 52)} onChange={(v) => setMensual((v * 52) / 12)} currency={w.currency} />
            </FormField>
            <FormField label="¿Qué día de la semana?" htmlFor="i-dow">
              <Controller control={form.control} name="dow" render={({ field }) => <Combobox id="i-dow" value={field.value} onChange={(v) => field.onChange(v ?? "5")} options={DIAS_SEMANA.map((d, i) => ({ value: String(i), label: d }))} />} />
            </FormField>
          </div>
        )}
        {verPagos && w.frec === "diario" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="¿Cuántos días te pagan al mes?" htmlFor="i-dias" error={errors.dias?.message} hint="Los días que trabajas o que te pagan (30 si es todo el mes).">
              <Input id="i-dias" className="h-11" type="number" min={1} max={31} {...form.register("dias", { valueAsNumber: true })} />
            </FormField>
            <FormField label="Cada día" htmlFor="i-dv" hint={conDesc ? "Antes de descuentos" : undefined}>
              <MoneyInput id="i-dv" value={Math.round((w.mensual || 0) / Math.max(1, w.dias || 30))} onChange={(v) => setMensual(v * Math.max(1, w.dias || 30))} currency={w.currency} />
            </FormField>
          </div>
        )}
        {verPagos && w.frec === "mensual" && (
          <FormField label="Día de pago" htmlFor="i-dia" error={errors.dia ? "Entre 1 y 31" : undefined}
            hint={w.dia >= 1 && w.dia <= 31 ? `Cae en la ${quincenaDeDia(w.dia, corte) === "q1" ? "1ª" : "2ª"} quincena.` : undefined}>
            <Input id="i-dia" className="h-11 sm:w-40" type="number" min={1} max={31} {...form.register("dia", { valueAsNumber: true })} />
          </FormField>
        )}
        {verPagos && anual && (
          <div className="grid grid-cols-2 gap-5">
            <FormField label="Mes del pago" htmlFor="i-mes">
              <Controller control={form.control} name="mes" render={({ field }) => <Combobox id="i-mes" value={field.value} onChange={(v) => field.onChange(v ?? "12")} options={MESES_LARGOS.map((m, i) => ({ value: String(i + 1), label: m }))} />} />
            </FormField>
            <FormField label="Día" htmlFor="i-dia-a" error={errors.dia ? "Entre 1 y 31" : undefined}><Input id="i-dia-a" className="h-11" type="number" min={1} max={31} {...form.register("dia", { valueAsNumber: true })} /></FormField>
          </div>
        )}

        {verPagos && <FormField label="¿De quién es?" htmlFor="i-quien">
          <Controller control={form.control} name="quien" render={({ field }) => <Combobox id="i-quien" value={field.value} onChange={field.onChange} options={memberOptions(members)} />} />
        </FormField>}
        {isSubmitting && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Guardando…</p>}
      </FieldGroup>
      <Resumen plan={plan} tipo={td} concepto={w.concepto} currency={w.currency} conDesc={conDesc} ref_={ref}
        cuando={w.frec ? cuandoTxt(w) : undefined} reparto={q && conDesc && plan.desc > 0 ? DED_EN.find((d) => d.value === w.ded)?.label : undefined}
        etiquetas={q ? [diaQ(1), diaQ(2)] : undefined} anual={anual} />
    </form>
  )
}

/** Texto de cuándo llega el ingreso con lo escrito en el formulario. */
function cuandoTxt(w: Values): string {
  if (w.frec === "quincenal") return `Cada quincena · días ${w.d1 || 15} y ${(w.d2 || 30) >= 31 ? "fin de mes" : w.d2 || 30}`
  if (w.frec === "semanal") return `Cada ${DIAS_SEMANA[+w.dow || 0].toLowerCase()}`
  if (w.frec === "diario") return `Cada día · ${w.dias || 30} días al mes`
  if (w.frec === "anual") return `Una vez al año · ${w.dia || 1} de ${MESES_LARGOS[(+w.mes || 12) - 1].toLowerCase()}`
  return `Cada mes · día ${w.dia || 30}`
}

/**
 * Panel derecho con forma de tirilla de recibo: cómo va quedando el ingreso (del mes, descuentos y lo que llega en cada
 * pago). Fijo al desplazar. El zigzag de arriba y abajo es una máscara (`receipt-edge`); la sombra va en el contenedor.
 */
function Resumen({ plan, tipo, concepto, currency, conDesc, ref_, cuando, reparto, etiquetas, anual }: {
  plan: PlanIngreso; tipo: (typeof TIPOS_INGRESO)[number] | null; concepto: string; currency: string; conDesc: boolean
  ref_: { smmlv: number; uvt: number }; cuando?: string; reparto?: string; etiquetas?: string[]; anual: boolean
}) {
  const M = (v: number, cls?: string) => <Money value={v} currency={currency} className={cls} />
  const corte = <hr className="border-0 border-t border-dashed border-foreground/25" />
  return (
    <div className="receipt-shadow lg:sticky lg:top-0">
      <aside className="receipt-edge grid gap-4 bg-receipt px-5 pt-8 pb-9" aria-live="polite" data-testid="ingreso-resumen" aria-label="Resumen del ingreso">
        <div className="grid justify-items-center gap-1.5 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-card text-success shadow-card"><Icon name={tipo?.icon ?? "receipt"} className="size-5" /></span>
          <span className="text-[11px] font-semibold tracking-[.2em] text-muted-foreground uppercase">Recibo de pago</span>
          <span className="max-w-full truncate text-base font-bold">{concepto.trim() || tipo?.label || "Tu ingreso"}</span>
          <span className="text-xs text-muted-foreground">{[tipo?.label, cuando].filter(Boolean).join(" · ") || "Aquí verás cómo va quedando"}</span>
        </div>
        {corte}
        {!(plan.mensual > 0) ? (
          <p className="py-2 text-center text-sm text-muted-foreground">{tipo ? "Escribe cuánto recibes y aquí verás cuánto te llega en cada pago." : "Escoge el tipo de ingreso para empezar."}</p>
        ) : (
          <>
            <div className="grid gap-1.5">
              <p className="text-[11px] font-semibold tracking-[.15em] text-muted-foreground uppercase">{anual ? "El pago" : "En el mes"}</p>
              <table className="num w-full text-sm">
                <tbody>
                  <tr><td className="py-1">{conDesc ? (anual ? "Valor del pago" : "Valor antes de descuentos") : anual ? "Valor del pago" : "Valor del mes"}</td><td className="py-1 text-right font-medium">{M(plan.mensual)}</td></tr>
                  {plan.items.map((x) => (
                    <tr key={x.n}>
                      <td className="py-1">− {x.n} <span className="block text-xs text-muted-foreground">{x.h}</span></td>
                      <td className="py-1 text-right align-top text-danger">{M(x.v)}</td>
                    </tr>
                  ))}
                  {plan.desc > 0 && <tr className="border-t border-dashed border-foreground/25 font-medium"><td className="py-1.5">Total descuentos</td><td className="py-1.5 text-right text-danger">{M(plan.desc)}</td></tr>}
                  <tr className="border-t-2 border-double border-foreground/40 text-[15px] font-bold"><td className="py-2">Te llega {anual ? "en el pago" : "al mes"}</td><td className="py-2 text-right text-success">{M(plan.neto)}</td></tr>
                </tbody>
              </table>
            </div>
            {cuando && (
              <>
                {corte}
                <div className="grid gap-2">
                  <p className="text-sm font-semibold">Lo que te llega a la cuenta</p>
                  {reparto && <p className="-mt-1 text-xs text-muted-foreground">Descuentos: {reparto.toLowerCase()}</p>}
                  <div className={plan.pagos.length > 1 ? "grid grid-cols-2 items-start gap-2" : "grid"}>
                    {plan.pagos.map((p, i) => (
                      <div key={p.n} className="grid rounded-lg border border-dashed border-foreground/25 bg-card/70 p-2.5">
                        <span className="text-xs text-muted-foreground">{etiquetas ? `${p.n} (${etiquetas[i]})` : p.n}</span>
                        {M(p.neto, "text-[19px] font-extrabold text-success")}
                        {p.desc > 0 && <span className="text-[11px] text-muted-foreground">{M(p.bruto)} − {M(p.desc)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {conDesc && <>{corte}<p className="text-center text-[11px] leading-4 text-muted-foreground">Cálculo aproximado con salario mínimo {fmtMoney(ref_.smmlv)} y UVT {fmtMoney(ref_.uvt)}. Compáralo con tu desprendible: si no coincide, ajusta los descuentos a la izquierda.</p></>}
          </>
        )}
      </aside>
    </div>
  )
}

/** Monta el formulario cuando los catálogos ya cargaron (skeleton mientras tanto). */
function ReadyGate({ children }: { children: React.ReactNode }) {
  return useCatalogsReady() ? <>{children}</> : <FormSkeleton />
}
