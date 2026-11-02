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
import { useSave } from "@/hooks/use-book-data"
import { DED_EN, DIAS_SEMANA, MESES_LARGOS, dedCalc, incomeReparto, quincenaDeDia, quincenasNetas, smmlvFor, uvtFor, type Deducciones, type IncomeReparto } from "@/lib/domain"
import { fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { CURRENCY_OPTIONS, memberOptions, useIncomeCategories, useMembers, useSettings } from "@/features/catalogs/hooks"
import { DeductionsEditor, defaultDed } from "./deductions-editor"

export const FRECS = [
  { value: "mensual", label: "Cada mes" },
  { value: "quincenal", label: "Cada quincena" },
  { value: "semanal", label: "Cada semana" },
  { value: "anual", label: "Una vez al año" },
]

const schema = z.object({
  concepto: z.string().trim().min(1, "Escribe el concepto"),
  category_id: z.string().nullable(),
  valor: z.number(),
  currency: z.string(),
  frec: z.enum(["mensual", "quincenal", "semanal", "anual"]),
  dia: z.number().int().min(1).max(31),
  quien: z.string(),
  calc: z.enum(["neto", "bruto"]),
  // Quincenal flexible: mismo valor o uno distinto en cada quincena, días de pago y en qué quincena se descuenta.
  modo: z.enum(["igual", "distinto"]),
  b1: z.number(), b2: z.number(),
  ded: z.enum(["mitad", "q1", "q2"]),
  d1: z.number().int().min(1).max(15), d2: z.number().int().min(16).max(31),
  dow: z.string(), mes: z.string(),
})
type Values = z.infer<typeof schema>
type Props = { open: boolean; onOpenChange: (o: boolean) => void; income?: Row<"incomes"> | null }

export function IncomeForm(props: Props) {
  const [formId] = useState(() => `ingreso-${Math.random().toString(36).slice(2)}`)
  return (
    <ResponsiveDialog open={props.open} onOpenChange={props.onOpenChange} wide title={props.income ? "Editar ingreso" : "Agregar ingreso"}
      description="El dinero que recibes con regularidad. Si te pagan por quincena puedes poner un valor distinto en cada una y decir en cuál te descuentan salud, pensión y retención."
      footer={<><Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancelar</Button><Button type="submit" form={formId}>Guardar</Button></>}>
      <ReadyGate><IncomeFormBody {...props} formId={formId} /></ReadyGate>
    </ResponsiveDialog>
  )
}

function IncomeFormBody({ onOpenChange, income, formId }: Props & { formId: string }) {
  const save = useSave("incomes")
  const { data: cats = [] } = useIncomeCategories()
  const { data: members = [] } = useMembers()
  const { data: cfg } = useSettings()
  const year = Number(todayISO().slice(0, 4))
  const smmlv = smmlvFor(year, cfg?.smmlv as Record<string, number>)
  const uvt = uvtFor(year, cfg?.uvt as Record<string, number>)
  const corte = Number(cfg?.corte_q) || 15
  const hasBruto = !!income?.bruto && Number(income.bruto) > 0
  const R = incomeReparto(income ?? {})
  const [ded, setDed] = useState<Deducciones>((income?.deducciones as Deducciones) ?? defaultDed())
  const base = hasBruto ? Number(income!.bruto) : Number(income?.valor ?? 0)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      concepto: income?.concepto ?? "", category_id: income?.category_id ?? cats.find((c) => c.nombre === "Salario")?.id ?? null,
      valor: base, currency: income?.currency ?? "COP",
      frec: (income?.frec as Values["frec"]) ?? "mensual", dia: income?.dia ?? 30, quien: income?.member_id ?? "familia", calc: hasBruto ? "bruto" : "neto",
      modo: R.modo === "distinto" ? "distinto" : "igual", b1: R.b1 ?? base, b2: R.b2 ?? base, ded: R.ded ?? "mitad",
      d1: R.d1 ?? 15, d2: R.d2 ?? (income ? 31 : 30), dow: String(R.dow ?? 5), mes: String(R.mes ?? 12),
    },
  })
  const { errors, isSubmitting } = form.formState
  const w = form.watch()
  const q = w.frec === "quincenal"
  const bruto = w.calc === "bruto" && w.currency === "COP"
  const b1 = q && w.modo === "distinto" ? w.b1 || 0 : w.valor || 0
  const b2 = q && w.modo === "distinto" ? w.b2 || 0 : w.valor || 0
  const netas = q ? quincenasNetas(b1, b2, bruto ? ded : null, { smmlv, uvt }, bruto ? w.ded : "mitad") : null

  async function onSubmit(v: Values) {
    const dist = v.frec === "quincenal" && v.modo === "distinto"
    if (dist ? !v.b1 && !v.b2 : !(v.valor > 0)) return void form.setError(dist ? "b1" : "valor", { message: dist ? "Escribe el valor de al menos una quincena" : "Escribe el valor" })
    const conDesc = v.calc === "bruto" && v.currency === "COP"
    let valor: number, brutoV: number | null = null, reparto: IncomeReparto | null = null, msg = ""
    if (v.frec === "quincenal") {
      const x1 = dist ? v.b1 : v.valor, x2 = dist ? v.b2 : v.valor
      const n = quincenasNetas(x1, x2, conDesc ? ded : null, { smmlv, uvt }, conDesc ? v.ded : "mitad")
      // `valor` y `bruto` guardan el promedio por quincena: el total del mes (× 2) sigue igual para todo Mirai.
      valor = Math.round((n.n1 + n.n2) / 2)
      brutoV = conDesc ? Math.round((x1 + x2) / 2) : null
      reparto = { modo: v.modo, b1: x1, b2: x2, n1: n.n1, n2: n.n2, ...(conDesc ? { ded: v.ded } : {}), d1: Math.round(v.d1 || 15), d2: Math.round(v.d2 || 30) }
      if (conDesc || dist) msg = `1ª quincena te llegan ${fmtMoney(n.n1)} y 2ª quincena ${fmtMoney(n.n2)}${conDesc ? ` (descuentos del mes: ${fmtMoney(n.total)})` : ""}.`
    } else {
      const r = conDesc ? dedCalc(v.valor, v.frec, ded, { smmlv, uvt }) : null
      valor = r ? r.neto : v.valor
      brutoV = r ? v.valor : null
      if (v.frec === "semanal") reparto = { dow: +v.dow }
      if (v.frec === "anual") reparto = { mes: +v.mes }
      if (r) msg = `Te llegan ${fmtMoney(r.neto)} después de ${fmtMoney(r.total)} en descuentos.`
    }
    await save.mutateAsync({
      ...(income ? { id: income.id } : {}),
      concepto: v.concepto.trim(), category_id: v.category_id ?? cats.find((c) => c.nombre === "Salario")?.id ?? null, frec: v.frec, dia: Math.round(v.dia || 30), currency: v.currency,
      member_id: v.quien === "familia" ? null : v.quien,
      valor, bruto: brutoV, deducciones: brutoV ? (ded as never) : null, reparto: reparto as never,
    } as never)
    toast.success("Ingreso guardado", msg ? { description: msg + " Esos son los valores que usamos en tu presupuesto." } : undefined)
    onOpenChange(false)
  }

  const money = (name: "valor" | "b1" | "b2", id: string) => (
    <Controller control={form.control} name={name} render={({ field }) => <MoneyInput id={id} value={field.value} onChange={field.onChange} currency={w.currency} invalid={!!errors[name]} />} />
  )
  const resumenQ = netas && (
    <div className="grid gap-2">
      <p className="text-sm">Lo que te llega a la cuenta</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid"><span className="text-xs text-muted-foreground">1ª quincena (día {w.d1 || 15})</span><Money value={netas.n1} className="text-[20px] font-extrabold" /></div>
        <div className="grid"><span className="text-xs text-muted-foreground">2ª quincena ({(w.d2 || 30) >= 31 ? "fin de mes" : `día ${w.d2}`})</span><Money value={netas.n2} className="text-[20px] font-extrabold" /></div>
      </div>
      <p className="text-sm text-muted-foreground">Al mes: <Money value={netas.n1 + netas.n2} className="font-semibold text-foreground" />{netas.total ? <> · descuentos del mes <Money value={netas.total} /></> : null}</p>
    </div>
  )

  return (
    <form id={formId} onSubmit={form.handleSubmit(onSubmit)} noValidate aria-busy={isSubmitting}>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Concepto" htmlFor="i-concepto" error={errors.concepto?.message} required>
            <Input id="i-concepto" className="h-11" autoFocus placeholder="Ej. Salario de Ana, Bono de alimentación" {...form.register("concepto")} />
          </FormField>
          <FormField label="Tipo de ingreso" htmlFor="i-cat">
            <Controller control={form.control} name="category_id" render={({ field }) => <Combobox id="i-cat" value={field.value} onChange={field.onChange} options={cats.map((c) => ({ value: c.id, label: c.nombre, icon: c.icon }))} />} />
          </FormField>
          <FormField label="¿Cada cuánto te pagan?" htmlFor="i-frec">
            <Controller control={form.control} name="frec" render={({ field }) => <Combobox id="i-frec" value={field.value} onChange={field.onChange} options={FRECS} />} />
          </FormField>
          <FormField label="Moneda" htmlFor="i-moneda">
            <Controller control={form.control} name="currency" render={({ field }) => <Combobox id="i-moneda" value={field.value} onChange={field.onChange} options={CURRENCY_OPTIONS} />} />
          </FormField>
        </div>

        {q && (
          <FormField label="¿Te llega lo mismo en las dos quincenas?" hint={w.modo === "distinto" ? "Por ejemplo, un bono que llega solo en la 1ª quincena o una nómina que se paga en partes distintas." : undefined}>
            <Controller control={form.control} name="modo" render={({ field }) => (
              <Segmented value={field.value} onChange={field.onChange} items={[{ value: "igual", label: "Sí, lo mismo" }, { value: "distinto", label: "No, cambia", icon: "split" }]} />
            )} />
          </FormField>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          {q && w.modo === "distinto" ? (
            <>
              <FormField label="Valor de la 1ª quincena" htmlFor="i-b1" error={errors.b1?.message}>{money("b1", "i-b1")}</FormField>
              <FormField label="Valor de la 2ª quincena" htmlFor="i-b2" hint={w.b1 || w.b2 ? `Al mes: ${fmtMoney((w.b1 || 0) + (w.b2 || 0))}` : undefined}>{money("b2", "i-b2")}</FormField>
            </>
          ) : (
            <FormField label={q ? "Valor de cada quincena" : w.frec === "semanal" ? "Valor de cada semana" : w.frec === "anual" ? "Valor del pago" : "Valor"} htmlFor="i-valor" error={errors.valor?.message} required
              hint={q ? (w.valor ? `Al mes: ${fmtMoney(w.valor * 2)}. Si tu salario es de ${fmtMoney(w.valor * 2)} al mes, escribe la mitad.` : "Escribe lo de una quincena (la mitad del salario del mes).") : undefined}>
              {money("valor", "i-valor")}
            </FormField>
          )}
          {w.frec === "mensual" && (
            <FormField label="Día de pago" htmlFor="i-dia" error={errors.dia ? "Entre 1 y 31" : undefined}
              hint={w.dia >= 1 && w.dia <= 31 ? `Cae en la ${quincenaDeDia(w.dia, corte) === "q1" ? "1ª" : "2ª"} quincena.` : undefined}>
              <Input id="i-dia" className="h-11" type="number" min={1} max={31} {...form.register("dia", { valueAsNumber: true })} />
            </FormField>
          )}
          {w.frec === "semanal" && (
            <FormField label="¿Qué día de la semana?" htmlFor="i-dow">
              <Controller control={form.control} name="dow" render={({ field }) => <Combobox id="i-dow" value={field.value} onChange={(v) => field.onChange(v ?? "5")} options={DIAS_SEMANA.map((d, i) => ({ value: String(i), label: d }))} />} />
            </FormField>
          )}
        </div>
        {q && (
          <div className="grid grid-cols-2 gap-5">
            <FormField label="Día de pago 1ª quincena" htmlFor="i-d1" error={errors.d1 ? "Entre 1 y 15" : undefined}><Input id="i-d1" className="h-11" type="number" min={1} max={15} {...form.register("d1", { valueAsNumber: true })} /></FormField>
            <FormField label="Día de pago 2ª quincena" htmlFor="i-d2" error={errors.d2 ? "Entre 16 y 31" : undefined} hint="31 = el último día de cada mes."><Input id="i-d2" className="h-11" type="number" min={16} max={31} {...form.register("d2", { valueAsNumber: true })} /></FormField>
          </div>
        )}
        {w.frec === "anual" && (
          <div className="grid grid-cols-2 gap-5">
            <FormField label="Mes del pago" htmlFor="i-mes">
              <Controller control={form.control} name="mes" render={({ field }) => <Combobox id="i-mes" value={field.value} onChange={(v) => field.onChange(v ?? "12")} options={MESES_LARGOS.map((m, i) => ({ value: String(i + 1), label: m }))} />} />
            </FormField>
            <FormField label="Día" htmlFor="i-dia-a" error={errors.dia ? "Entre 1 y 31" : undefined}><Input id="i-dia-a" className="h-11" type="number" min={1} max={31} {...form.register("dia", { valueAsNumber: true })} /></FormField>
          </div>
        )}
        <FormField label="¿De quién es?" htmlFor="i-quien">
          <Controller control={form.control} name="quien" render={({ field }) => <Combobox id="i-quien" value={field.value} onChange={field.onChange} options={memberOptions(members)} />} />
        </FormField>
        {w.currency === "COP" && (
          <FormField label="¿El valor que escribiste es lo que te llega a la cuenta?">
            <Controller control={form.control} name="calc" render={({ field }) => (
              <ChoiceCards value={field.value} onChange={field.onChange} items={[
                { value: "neto", label: "Sí, es lo que me llega", icon: "wallet" },
                { value: "bruto", label: "No, es el salario o valor del contrato", desc: "Calculamos los descuentos", icon: "calculator" },
              ]} />
            )} />
          </FormField>
        )}
        {q && bruto && (
          <FormField label="¿En qué quincena te hacen los descuentos?" tip="Muchas empresas pagan la 1ª quincena completa y en la 2ª descuentan salud, pensión, fondo de solidaridad y retención de todo el mes.">
            <Controller control={form.control} name="ded" render={({ field }) => (
              <ChoiceCards value={field.value} onChange={field.onChange} cols={3} items={DED_EN.map((d) => ({ value: d.value, label: d.label, desc: d.desc, icon: d.value === "mitad" ? "split" : "calendar" }))} />
            )} />
          </FormField>
        )}
        {bruto && <DeductionsEditor value={ded} onChange={setDed} bruto={q ? (b1 + b2) / 2 : w.valor || 0} frec={w.frec} smmlv={smmlv} uvt={uvt} resumen={resumenQ || undefined} />}
        {q && !bruto && w.modo === "distinto" && <div className="rounded-lg border-l-4 border-lime bg-brand-soft p-4" aria-live="polite">{resumenQ}</div>}
        {isSubmitting && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Guardando…</p>}
      </FieldGroup>
    </form>
  )
}

/** Monta el formulario cuando los catálogos ya cargaron (skeleton mientras tanto). */
function ReadyGate({ children }: { children: React.ReactNode }) {
  return useCatalogsReady() ? <>{children}</> : <FormSkeleton />
}
