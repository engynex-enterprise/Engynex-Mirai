"use client"

import { useState } from "react"
import Link from "next/link"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "@/components/mirai/toast"
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
import { Combobox } from "@/components/mirai/combobox"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { Money } from "@/components/mirai/money"
import { Icon } from "@/components/mirai/icon"
import { Notice } from "@/components/mirai/notice"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { Barcode, ReceiptArt } from "@/components/mirai/receipt"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSave } from "@/hooks/use-book-data"
import {
  DED_EN, DIAS_SEMANA, FSP_LEY797, GRUPOS_INGRESO, MESES_LARGOS, TIPOS_INGRESO, dedAMes, incomePagos, incomeReparto, planIngreso, quincenaDeDia, smmlvFor, tipoIngreso, uvtFor,
  type Deducciones, type IncomeReparto, type NominaCfg, type PlanIngreso, type TipoIngreso,
} from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { CURRENCY_OPTIONS, memberOptions, useIncomeCategories, useMembers, useSettings } from "@/features/catalogs/hooks"
import { DeductionsEditor, defaultDed } from "./deductions-editor"

/** Auxilio de transporte 2026 (Decreto 1470 de 2025): lo paga la empresa a quien gana hasta 2 salarios mínimos. */
const AUX_TRANSPORTE_2026 = 249_095

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
  /** Del valor del mes, cuánto es auxilio de transporte (no paga salud ni pensión, sí cuenta para la retención). */
  aux: z.number(),
})
type Values = z.infer<typeof schema>
type Props = { open: boolean; onOpenChange: (o: boolean) => void; income?: Row<"incomes"> | null }

/** Quién recibe un ingreso nuevo (Ajustes › Valores por defecto), si esa persona sigue en el hogar. */
const defQuien = (defaults: unknown, members: { id: string }[]) => {
  const q = ((defaults ?? {}) as { ing_quien?: string }).ing_quien
  return q && members.some((m) => m.id === q) ? q : "familia"
}

const tipoDef = (t: TipoIngreso) => TIPOS_INGRESO.find((x) => x.value === t) ?? TIPOS_INGRESO[TIPOS_INGRESO.length - 1]
/** Pagos por mes de la frecuencia (anual: el valor ya es el del pago). */
const veces = (frec: string, dias: number) => (frec === "diario" ? Math.max(1, dias || 30) : frec === "semanal" ? 52 / 12 : frec === "quincenal" ? 2 : 1)

export function IncomeForm(props: Props) {
  const [formId] = useState(() => `ingreso-${Math.random().toString(36).slice(2)}`)
  // Vista de detalle dentro de la misma ventana (como los modales de Facebook): oculta el formulario sin desmontarlo.
  const [detalle, setDetalle] = useState(false)
  // Primer paso: solo "¿qué tipo de ingreso es?". Al escoger, aparecen los campos de ESE tipo y el recibo.
  // Al editar un ingreso que ya existe se entra directo al formulario.
  const [conTipo, setConTipo] = useState(!!props.income)
  const [abierto, setAbierto] = useState(props.open)
  if (props.open !== abierto) { setAbierto(props.open); if (props.open) setConTipo(!!props.income) }
  const close = (o: boolean) => { if (!o) { setDetalle(false); setConTipo(!!props.income) } props.onOpenChange(o) }
  const paso1 = !conTipo && !detalle
  return (
    <ResponsiveDialog open={props.open} onOpenChange={close} wide="xl" split={!paso1}
      title={detalle ? "Detalle del ingreso" : paso1 ? "¿Qué tipo de ingreso es?" : props.income ? "Editar ingreso" : "Agregar ingreso"}
      description={detalle ? "Todo el cálculo de tu ingreso: descuentos, cada pago, próximas fechas y el año completo."
        : paso1 ? "Escoge el que más se parezca. Según el tipo te preguntamos solo lo que aplica y calculamos los descuentos que correspondan."
        : "A la izquierda nos cuentas cómo es tu ingreso; a la derecha ves el recibo de lo que te llega."}
      onBack={detalle ? () => setDetalle(false) : !paso1 && !props.income ? () => setConTipo(false) : undefined}
      footer={detalle
        ? <><Button variant="outline" onClick={() => setDetalle(false)}><ArrowLeft /> Volver</Button><SubmitButton form={formId} /></>
        : paso1
          ? <><Button variant="outline" onClick={() => close(false)}>Cancelar</Button><span className="self-center text-[13px] text-muted-foreground">Toca el que recibes</span></>
          : <><Button variant="outline" onClick={() => close(false)}>Cancelar</Button><SubmitButton form={formId} /></>}>
      <ReadyGate><IncomeFormBody {...props} onOpenChange={close} formId={formId} detalle={detalle} onDetalle={() => setDetalle(true)}
        conTipo={conTipo} onConTipo={setConTipo} /></ReadyGate>
    </ResponsiveDialog>
  )
}

/** Tarjeta de un tipo de ingreso en el primer paso: ícono de color, nombre y un ejemplo corto. */
function TipoCard({ t, selected, onClick }: { t: (typeof TIPOS_INGRESO)[number]; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={t.label} onClick={onClick}
      className={cn("group grid gap-2 rounded-2xl border p-4 text-left transition-all outline-none hover:-translate-y-0.5 hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-brand-soft/50 ring-2 ring-primary" : "bg-card hover:border-foreground/20")}>
      <ToneIcon icon={t.icon} tone={t.tone} size="lg" className="transition-transform group-hover:scale-105" />
      <span className="grid gap-0.5">
        <span className="text-[15px] leading-5 font-semibold">{t.label}</span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">{t.desc}</span>
      </span>
    </button>
  )
}

function IncomeFormBody({ onOpenChange, income, formId, detalle, onDetalle, conTipo, onConTipo }: Props & {
  formId: string; detalle: boolean; onDetalle: () => void; conTipo: boolean; onConTipo: (v: boolean) => void
}) {
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
      quien: income ? (income.member_id ?? "familia") : defQuien(cfg?.defaults, members),
      aux: Number((income?.deducciones as Deducciones | null)?.noIbc ?? 0) || 0,
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
  const dedConAux = conDesc ? { ...ded, ...(w.aux > 0 && td?.ded === "empleado" ? { noIbc: w.aux } : {}) } : null
  const plan = planIngreso({ frec: w.frec ?? "mensual", mensual: w.mensual, b1: w.b1, b2: w.b2, dias: w.dias, D: dedConAux, ref, ded: w.ded, x1: w.ded === "pers" ? w.x1 : undefined })
  // Guardar se activa cuando el formulario está completo y hay un valor del mes.
  useSubmitState(formId, form, { valid: plan.mensual > 0 })

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
    // Cada tipo propone cómo suele pagarse (el salario por quincenas, los honorarios al mes, la prima una vez al año).
    if (!income && !form.getValues("frec")) set("frec", nt.frec)
    // Los ingresos sin descuentos de ley (ventas, regalos, subsidios) no preguntan por descuentos.
    if (!nt.ibc && nt.ded === "otro" && nt.ret === "no") set("desc", "no")
    onConTipo(true)
  }
  const setDedEn = (v: string) => { set("ded", v); if (v === "pers" && !form.getValues("x1")) set("x1", Math.round(plan.desc / 2)) }

  async function onSubmit(v: Values) {
    const conD = v.desc === "si" && v.currency === "COP"
    const t0d = tipoDef(v.tipo)
    const dedFinal = conD ? { ...ded, ...(v.aux > 0 && t0d.ded === "empleado" ? { noIbc: v.aux } : {}) } : null
    const p = planIngreso({ frec: v.frec, mensual: v.mensual, b1: v.b1, b2: v.b2, dias: v.dias, D: dedFinal, ref, ded: v.ded, x1: v.ded === "pers" ? v.x1 : undefined })
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
      valor: p.valor, bruto: conD ? p.bruto : null, deducciones: conD ? ({ ...(dedFinal ?? ded), mes: true } as never) : null, reparto: reparto as never,
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

  if (!conTipo && !detalle) return (
    <div className="grid gap-6 pb-4 md:px-6 md:pt-5">
      {GRUPOS_INGRESO.map((g) => {
        const list = TIPOS_INGRESO.filter((t) => t.grupo === g.id)
        if (!list.length) return null
        return (
          <section key={g.id} className="grid gap-3">
            <div>
              <h3 className="text-[15px] font-semibold">{g.label}</h3>
              <p className="text-[13px] text-muted-foreground">{g.desc}</p>
            </div>
            <div role="radiogroup" aria-label={g.label} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((t) => <TipoCard key={t.value} t={t} selected={w.tipo === t.value} onClick={() => setTipo(t.value)} />)}
            </div>
          </section>
        )
      })}
    </div>
  )

  return (
    <>
    <form id={formId} onSubmit={form.handleSubmit(onSubmit)} noValidate aria-busy={isSubmitting} className={cn("grid lg:h-full lg:grid-cols-[minmax(0,1fr)_400px]", detalle && "hidden")}>
      <div className="pb-6 md:px-6 md:pt-5 lg:min-h-0 lg:overflow-y-auto">
      <FieldGroup>
        {td && (
          <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
            <ToneIcon icon={td.icon} tone={td.tone} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{td.label}</p>
              <p className="text-[13px] text-muted-foreground">{td.desc}</p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => onConTipo(false)}>Cambiar</Button>
          </div>
        )}
        {td?.nota && <Notice tone={td.value === "prima" ? "warn" : "info"} title={td.value === "prima" ? "Ojo con la prima legal" : "Cómo lo calculamos"}
          action={td.value === "prima" ? <Button type="button" size="sm" variant="outline" asChild><Link href="/primas">Ver Primas</Link></Button> : undefined}>{td.nota}</Notice>}

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

        {verMonto && conDesc && td?.ded === "empleado" && (
          <FormField label="¿Cuánto de eso es auxilio de transporte?" htmlFor="i-aux" hint={<>Lo paga la empresa si ganas hasta 2 salarios mínimos. En 2026 es <Money value={AUX_TRANSPORTE_2026} /> al mes. Déjalo en cero si no lo recibes.</>}
            tip="El auxilio de transporte no paga salud ni pensión, pero sí cuenta para la retención en la fuente. Si lo separas aquí, tus descuentos quedan bien calculados.">
            <Controller control={form.control} name="aux" render={({ field }) => (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                <MoneyInput id="i-aux" value={field.value} onChange={(v) => set("aux", v)} currency={w.currency} />
                {field.value === 0 && w.mensual > 0 && w.mensual <= 2 * ref.smmlv + AUX_TRANSPORTE_2026 && (
                  <Button type="button" size="sm" variant="outline" onClick={() => set("aux", AUX_TRANSPORTE_2026)}>Usar el de 2026</Button>
                )}
              </div>
            )} />
          </FormField>
        )}

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
      </div>
      {/* Recibo fijo: en escritorio no se desplaza con el formulario. */}
      <div className="border-t py-6 md:px-6 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l lg:bg-secondary/40 lg:py-6">
        <Resumen plan={plan} tipo={td} concepto={w.concepto} currency={w.currency} conDesc={conDesc}
          cuando={w.frec ? cuandoTxt(w) : undefined} anual={anual} onDetalle={onDetalle} />
      </div>
    </form>
    {detalle && (
      <div className="pb-6 md:px-6 md:pt-5 lg:h-full lg:overflow-y-auto">
        <DetalleIngreso plan={plan} tipo={td} w={w} ded={conDesc ? ded : null} ref_={ref} currency={w.currency}
          cuando={w.frec ? cuandoTxt(w) : undefined} reparto={q && conDesc && plan.desc > 0 ? DED_EN.find((d) => d.value === w.ded)?.label : undefined}
          etiquetas={q ? [diaQ(1), diaQ(2)] : undefined} anual={anual} />
      </div>
    )}
    </>
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

/** Nombres cortos para que cada línea del recibo quepa en una fila. */
const corto = (n: string) => n.replace("Fondo de solidaridad pensional", "Fondo de solidaridad").replace("Retención en la fuente", "Retención")

/**
 * Recibo fijo a la derecha: encabezado con figuras, el mes (bruto, descuentos y lo que llega) y "Más detalle", que abre
 * la vista completa en la misma ventana. El zigzag es una máscara (`receipt-edge`); la sombra va en el contenedor.
 */
function Resumen({ plan, tipo, concepto, currency, conDesc, cuando, anual, onDetalle }: {
  plan: PlanIngreso; tipo: (typeof TIPOS_INGRESO)[number] | null; concepto: string; currency: string; conDesc: boolean
  cuando?: string; anual: boolean; onDetalle: () => void
}) {
  const fila = (label: string, v: number, cls?: string) => (
    <div className={cn("flex items-baseline gap-1", cls)}>
      <span className="shrink-0">{label}</span>
      <span className="mb-1 min-w-3 flex-1 border-b border-dotted border-foreground/30" aria-hidden />
      <Money value={v} currency={currency} className="shrink-0" />
    </div>
  )
  return (
    <div className="receipt-shadow mx-auto w-full max-w-[360px]">
      <aside className="receipt-edge grid bg-receipt font-receipt text-[13px] leading-5" aria-live="polite" data-testid="ingreso-resumen" aria-label="Recibo de pago">
        <div className="relative isolate overflow-hidden px-5 pt-9 pb-5 text-center">
          <ReceiptArt />
          <span className="mx-auto grid size-12 -rotate-6 place-items-center rounded-2xl bg-navy text-lime shadow-card"><Icon name={tipo?.icon ?? "receipt"} className="size-6" /></span>
          <p className="mt-3 text-[10.5px] font-bold tracking-[.32em] text-muted-foreground uppercase">Recibo de pago</p>
          <p className="mt-0.5 truncate text-[17px] font-bold text-foreground">{concepto.trim() || tipo?.label || "Tu ingreso"}</p>
          <p className="text-[11.5px] leading-4 text-muted-foreground">{[tipo?.label, cuando].filter(Boolean).join(" · ") || "Aquí verás cómo va quedando"}</p>
        </div>
        <div className="grid gap-3 px-5 pb-10">
          <hr className="border-0 border-t border-dashed border-foreground/30" />
          {!(plan.mensual > 0) ? (
            <p className="py-3 text-center text-muted-foreground">{tipo ? "Escribe cuánto recibes y aquí verás tu recibo." : "Escoge el tipo de ingreso para empezar."}</p>
          ) : (
            <>
              <p className="text-[10.5px] font-bold tracking-[.25em] text-muted-foreground uppercase">{anual ? "El pago" : "En el mes"}</p>
              <div className="num grid gap-1">
                {fila(conDesc ? "Valor bruto" : anual ? "Valor del pago" : "Valor del mes", plan.mensual, "font-bold")}
                {plan.items.map((x) => <div key={x.n}>{fila(`− ${corto(x.n)}`, x.v, "text-danger")}</div>)}
                {plan.desc > 0 && fila("Total descuentos", plan.desc, "font-bold text-danger")}
              </div>
              <div className="num flex items-baseline justify-between gap-2 border-y-[3px] border-double border-foreground/40 py-2 text-[15px] font-bold">
                <span>{anual ? "TE LLEGA EN EL PAGO" : "TE LLEGA AL MES"}</span>
                <Money value={plan.neto} currency={currency} className="text-success" />
              </div>
              <Barcode seed={concepto + plan.mensual} />
              <Button type="button" variant="outline" className="font-receipt" onClick={onDetalle}>Más detalle <ArrowRight /></Button>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

/** Tarjeta de la vista de detalle. */
function Card({ title, icon, children, className }: { title: string; icon: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("grid content-start gap-3 rounded-xl border bg-card p-4 shadow-card", className)}>
      <h3 className="flex items-center gap-2 font-semibold"><Icon name={icon} className="size-[18px] text-brand" />{title}</h3>
      {children}
    </section>
  )
}

/** Vista completa del ingreso (se abre con "Más detalle" y vuelve con Atrás). */
function DetalleIngreso({ plan, tipo, w, ded, ref_, currency, cuando, reparto, etiquetas, anual }: {
  plan: PlanIngreso; tipo: (typeof TIPOS_INGRESO)[number] | null; w: Values; ded: Deducciones | null
  ref_: { smmlv: number; uvt: number; fsp?: [number, number][] | null }; currency: string; cuando?: string; reparto?: string; etiquetas?: string[]; anual: boolean
}) {
  const M = (v: number, cls?: string) => <Money value={v} currency={currency} className={cls} />
  const pct = (v: number) => (plan.mensual ? `${((v / plan.mensual) * 100).toFixed(1).replace(".", ",")} %` : "")
  // Próximas fechas: el mismo cálculo que usa la agenda con lo que está escrito en el formulario.
  const hoy = todayISO()
  const [y, m] = hoy.split("-").map(Number)
  const x = {
    frec: w.frec ?? "mensual", valor: plan.valor, dia: w.dia || 30,
    reparto: { n1: plan.pagos[0]?.neto, n2: plan.pagos[1]?.neto, d1: w.d1, d2: w.d2, dow: +w.dow, mes: +w.mes, dias: w.dias },
  }
  const prox = [0, 1, 2, 3].flatMap((k) => incomePagos(x, y + Math.floor((m - 1 + k) / 12), (m - 1 + k) % 12)).filter((p) => p.fecha >= hoy).slice(0, 6)
  const tabla = ref_.fsp?.length ? ref_.fsp : FSP_LEY797
  const proc = ded?.ret === false ? "no se calcula" : ded?.retModo === "proc2" ? `procedimiento 2 (${String(ded.retV ?? 0).replace(".", ",")} % fijo sobre la base, art. 386 E.T.)` : ded?.retModo === "manual" ? "valor fijo que escribiste" : ded?.retModo === "pct" ? `${String(ded.retV ?? 0).replace(".", ",")} % del pago` : "procedimiento 1 (tabla del art. 383 E.T.)"
  return (
    <div className="grid gap-4" data-testid="ingreso-detalle">
      <div className="relative isolate overflow-hidden rounded-xl border bg-receipt p-5">
        {/* Las figuras solo a la derecha para no pasar por encima del texto. */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-[420px] max-w-[60%]"><ReceiptArt /></div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-navy text-lime"><Icon name={tipo?.icon ?? "receipt"} className="size-6" /></span>
          <div className="grid flex-1 gap-0.5">
            <p className="text-lg font-bold">{(w.concepto ?? "").trim() || tipo?.label || "Tu ingreso"}</p>
            <p className="text-sm text-muted-foreground">{[tipo?.label, cuando].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="grid text-right">
            <span className="text-xs text-muted-foreground">Te llega {anual ? "en el pago" : "al mes"}</span>
            {M(plan.neto, "text-[26px] font-extrabold text-success")}
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={anual ? "El pago" : "Del mes"} icon="receipt">
          <table className="num w-full text-sm">
            <tbody>
              <tr><td className="py-1.5">{ded ? "Valor antes de descuentos" : "Valor"}</td><td className="py-1.5 text-right font-medium">{M(plan.mensual)}</td></tr>
              {plan.items.map((i) => (
                <tr key={i.n} className="border-t">
                  <td className="py-1.5">− {i.n}<span className="block text-xs text-muted-foreground">{i.h}</span></td>
                  <td className="py-1.5 text-right align-top text-danger">{M(i.v)}<span className="block text-xs text-muted-foreground">{pct(i.v)}</span></td>
                </tr>
              ))}
              {plan.desc > 0 && <tr className="border-t font-medium"><td className="py-1.5">Total descuentos</td><td className="py-1.5 text-right text-danger">{M(plan.desc)} <span className="text-xs text-muted-foreground">({pct(plan.desc)})</span></td></tr>}
              <tr className="border-t-2 font-bold"><td className="py-2">Te llega {anual ? "en el pago" : "al mes"}</td><td className="py-2 text-right text-success">{M(plan.neto)}</td></tr>
            </tbody>
          </table>
        </Card>
        <Card title="Lo que te llega a la cuenta" icon="wallet">
          {reparto && <p className="-mt-1 text-sm text-muted-foreground">Descuentos: {reparto.toLowerCase()}</p>}
          {w.frec ? (
            <div className={plan.pagos.length > 1 ? "grid grid-cols-2 items-start gap-3" : "grid"}>
              {plan.pagos.map((p, i) => (
                <div key={p.n} className="grid rounded-lg bg-brand-soft p-3">
                  <span className="text-xs text-muted-foreground">{etiquetas ? `${p.n} (${etiquetas[i]})` : p.n}</span>
                  {M(p.neto, "text-[20px] font-extrabold")}
                  {p.desc > 0 && <span className="text-xs text-muted-foreground">{M(p.bruto)} − {M(p.desc)}</span>}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">Escoge cada cuánto te pagan para ver cada pago.</p>}
        </Card>
        <Card title="Próximas fechas de pago" icon="calendar-days">
          {prox.length ? (
            <ul className="grid gap-1.5 text-sm">
              {prox.map((p) => (
                <li key={p.fecha + p.v} className="flex items-center justify-between gap-2 border-b pb-1.5 last:border-0">
                  <span>{fmtDate(p.fecha, { long: true })}{p.parte ? <span className="text-xs text-muted-foreground"> · {p.parte === "q1" ? "1ª" : "2ª"} quincena</span> : null}</span>
                  {M(p.v, "font-semibold")}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Escoge cada cuánto te pagan para ver las fechas.</p>}
        </Card>
        <Card title="En el año" icon="calendar-range">
          <table className="num w-full text-sm">
            <tbody>
              <tr><td className="py-1.5">Antes de descuentos</td><td className="py-1.5 text-right">{M(plan.mensual * (anual ? 1 : 12))}</td></tr>
              <tr className="border-t"><td className="py-1.5">Descuentos</td><td className="py-1.5 text-right text-danger">{M(plan.desc * (anual ? 1 : 12))}</td></tr>
              <tr className="border-t font-bold"><td className="py-1.5">Te llega</td><td className="py-1.5 text-right text-success">{M(plan.neto * (anual ? 1 : 12))}</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">Sin contar prima, cesantías ni bonos aparte: regístralos como otro ingreso.</p>
        </Card>
        {ded && (
          <Card title="Cómo lo calculamos" icon="calculator" className="md:col-span-2">
            <ul className="grid list-disc gap-1.5 pl-5 text-sm">
              <li>Salario mínimo {fmtMoney(ref_.smmlv)} y UVT {fmtMoney(ref_.uvt)}{plan.mensual ? ` · ganas ${(plan.mensual / ref_.smmlv).toFixed(1).replace(".", ",")} salarios mínimos.` : "."}</li>
              <li>Salud y pensión: 4 % cada una del salario (empleado). Los aportes se redondean a la centena de arriba, como la planilla PILA.</li>
              <li>Fondo de solidaridad pensional desde {tabla[0][0]} salarios mínimos: {tabla.map(([d, p]) => `${p.toString().replace(".", ",")} % desde ${d}`).join(" · ")}.{ref_.fsp?.length ? " (Tabla propia de Ajustes › Nómina.)" : " (Ley 797 de 2003.)"}</li>
              <li>Retención en la fuente: {proc}. La ley permite los dos procedimientos y tu empresa escoge uno; míralo en tu desprendible.</li>
              <li>Es un cálculo aproximado. Compáralo con tu desprendible de nómina: si no coincide, vuelve atrás y ajusta los descuentos.</li>
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}

/** Monta el formulario cuando los catálogos ya cargaron (skeleton mientras tanto). */
function ReadyGate({ children }: { children: React.ReactNode }) {
  return useCatalogsReady() ? <>{children}</> : <FormSkeleton />
}
