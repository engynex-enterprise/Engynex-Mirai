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
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { useSave } from "@/hooks/use-book-data"
import { dedCalc, smmlvFor, uvtFor, type Deducciones } from "@/lib/domain"
import { fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { CURRENCY_OPTIONS, memberOptions, useIncomeCategories, useMembers, useSettings } from "@/features/catalogs/hooks"
import { DeductionsEditor, defaultDed } from "./deductions-editor"

export const FRECS = [
  { value: "mensual", label: "Cada mes" },
  { value: "quincenal", label: "Cada quincena (15 y 30)" },
  { value: "semanal", label: "Cada semana" },
  { value: "anual", label: "Una vez al año" },
]

const schema = z.object({
  concepto: z.string().trim().min(1, "Escribe el concepto"),
  category_id: z.string().nullable(),
  valor: z.number().positive("Escribe el valor"),
  currency: z.string(),
  frec: z.enum(["mensual", "quincenal", "semanal", "anual"]),
  dia: z.number().int().min(1).max(31),
  quien: z.string(),
  calc: z.enum(["neto", "bruto"]),
})
type Values = z.infer<typeof schema>
type Props = { open: boolean; onOpenChange: (o: boolean) => void; income?: Row<"incomes"> | null }

export function IncomeForm(props: Props) {
  const [formId] = useState(() => `ingreso-${Math.random().toString(36).slice(2)}`)
  return (
    <ResponsiveDialog open={props.open} onOpenChange={props.onOpenChange} wide title={props.income ? "Editar ingreso" : "Agregar ingreso"}
      description="El dinero que recibes con regularidad. Si escribes el salario o el valor del contrato, calculamos salud, pensión, retención y otros descuentos para saber cuánto te llega realmente."
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
  const hasBruto = !!income?.bruto && Number(income.bruto) > 0
  const [ded, setDed] = useState<Deducciones>((income?.deducciones as Deducciones) ?? defaultDed())
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      concepto: income?.concepto ?? "", category_id: income?.category_id ?? cats.find((c) => c.nombre === "Salario")?.id ?? null,
      valor: hasBruto ? Number(income!.bruto) : Number(income?.valor ?? 0), currency: income?.currency ?? "COP",
      frec: (income?.frec as Values["frec"]) ?? "mensual", dia: income?.dia ?? 30, quien: income?.member_id ?? "familia", calc: hasBruto ? "bruto" : "neto",
    },
  })
  const { errors, isSubmitting } = form.formState
  const w = form.watch()

  async function onSubmit(v: Values) {
    const bruto = v.calc === "bruto" ? v.valor : null
    const r = bruto ? dedCalc(bruto, v.frec, ded, { smmlv, uvt }) : null
    await save.mutateAsync({
      ...(income ? { id: income.id } : {}),
      concepto: v.concepto.trim(), category_id: v.category_id ?? cats.find((c) => c.nombre === "Salario")?.id ?? null, frec: v.frec, dia: Math.round(v.dia || 30), currency: v.currency,
      member_id: v.quien === "familia" ? null : v.quien,
      valor: r ? r.neto : v.valor, bruto, deducciones: bruto ? (ded as never) : null,
    } as never)
    if (r) toast.success("Ingreso guardado", { description: `Te llegan ${fmtMoney(r.neto)} después de ${fmtMoney(r.total)} en descuentos. Ese es el valor que usamos en tu presupuesto.` })
    else toast.success("Ingreso guardado")
    onOpenChange(false)
  }

  return (
    <form id={formId} onSubmit={form.handleSubmit(onSubmit)} noValidate aria-busy={isSubmitting}>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Concepto" htmlFor="i-concepto" error={errors.concepto?.message} required>
            <Input id="i-concepto" className="h-11" autoFocus placeholder="Ej. Salario de Ana" {...form.register("concepto")} />
          </FormField>
          <FormField label="Tipo de ingreso" htmlFor="i-cat">
            <Controller control={form.control} name="category_id" render={({ field }) => <Combobox id="i-cat" value={field.value} onChange={field.onChange} options={cats.map((c) => ({ value: c.id, label: c.nombre, icon: c.icon }))} />} />
          </FormField>
          <FormField label="Valor" htmlFor="i-valor" error={errors.valor?.message} required hint="Si te pagan por quincena, escribe lo de una quincena.">
            <Controller control={form.control} name="valor" render={({ field }) => <MoneyInput id="i-valor" value={field.value} onChange={field.onChange} currency={w.currency} invalid={!!errors.valor} />} />
          </FormField>
          <FormField label="Moneda" htmlFor="i-moneda">
            <Controller control={form.control} name="currency" render={({ field }) => <Combobox id="i-moneda" value={field.value} onChange={field.onChange} options={CURRENCY_OPTIONS} />} />
          </FormField>
          <FormField label="¿Cada cuánto te pagan?" htmlFor="i-frec">
            <Controller control={form.control} name="frec" render={({ field }) => <Combobox id="i-frec" value={field.value} onChange={field.onChange} options={FRECS} />} />
          </FormField>
          {w.frec === "mensual" ? (
            <FormField label="Día de pago" htmlFor="i-dia" error={errors.dia ? "Entre 1 y 31" : undefined}>
              <Input id="i-dia" className="h-11" type="number" min={1} max={31} {...form.register("dia", { valueAsNumber: true })} />
            </FormField>
          ) : <div className="max-sm:hidden" />}
          <FormField label="¿De quién es?" htmlFor="i-quien" className="sm:col-span-2">
            <Controller control={form.control} name="quien" render={({ field }) => <Combobox id="i-quien" value={field.value} onChange={field.onChange} options={memberOptions(members)} />} />
          </FormField>
        </div>
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
        {w.calc === "bruto" && w.currency === "COP" && <DeductionsEditor value={ded} onChange={setDed} bruto={w.valor || 0} frec={w.frec} smmlv={smmlv} uvt={uvt} />}
        {isSubmitting && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Guardando…</p>}
      </FieldGroup>
    </form>
  )
}

/** Monta el formulario cuando los catálogos ya cargaron (skeleton mientras tanto). */
function ReadyGate({ children }: { children: React.ReactNode }) {
  return useCatalogsReady() ? <>{children}</> : <FormSkeleton />
}
