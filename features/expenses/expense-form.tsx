"use client"

import { useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Sparkles } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { Segmented } from "@/components/mirai/choice-cards"
import { Money } from "@/components/mirai/money"
import { useBookId } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import {
  categoryOptions, memberOptions, methodOptions, useCategories, useKeywordRules, useMembers, usePaymentMethods, useSettings,
} from "@/features/catalogs/hooks"
import { CategoryDialog } from "@/features/catalogs/category-dialog"
import { isHormiga, localHormiga, ruleCategory } from "./logic"

const schema = z.object({
  descripcion: z.string().trim().min(1, "Escribe en qué gastaste"),
  valor: z.number().positive("Escribe el valor del gasto"),
  category_id: z.string().min(1, "Elige la categoría"),
  hormigaMode: z.enum(["auto", "si", "no"]),
  fecha: z.string(),
  quien: z.string(),
  payment_method_id: z.string().nullable(),
  usarFondo: z.boolean(),
})
type Values = z.infer<typeof schema>

type Props = { open: boolean; onOpenChange: (o: boolean) => void; expense?: Row<"expenses"> | null }

/** Registrar / editar gasto. El formulario se monta al abrir para tomar los valores por defecto ya cargados. */
export function ExpenseForm(props: Props) {
  const [formId] = useState(() => `gasto-${Math.random().toString(36).slice(2)}`)
  return (
    <ResponsiveDialog
      open={props.open} onOpenChange={props.onOpenChange} mdesc="gasto"
      title={props.expense ? "Editar gasto" : "Registrar gasto"}
      footer={<><Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancelar</Button><Button type="submit" form={formId}>Guardar</Button></>}
    >
      <ExpenseFormBody {...props} formId={formId} />
    </ResponsiveDialog>
  )
}

function ExpenseFormBody({ onOpenChange, expense, formId }: Props & { formId: string }) {
  const open = true
  const bookId = useBookId()
  const qc = useQueryClient()
  const { data: cats = [] } = useCategories()
  const { data: methods = [] } = usePaymentMethods()
  const { data: members = [] } = useMembers()
  const { data: rules = [] } = useKeywordRules()
  const { data: cfg } = useSettings()
  const [fondo, setFondo] = useState<{ activo: boolean; saldo: number } | null>(null)
  const [newCat, setNewCat] = useState<string | null>(null)
  const [catManual, setCatManual] = useState(false)
  const defaults = (cfg?.defaults ?? {}) as { cat?: string; medio?: string; quien?: string }

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: expense
      ? {
          descripcion: expense.descripcion, valor: Number(expense.valor), category_id: expense.category_id ?? "",
          hormigaMode: expense.hormiga_src === "manual" ? (expense.hormiga ? "si" : "no") : "auto",
          fecha: expense.fecha, quien: expense.member_id ?? "familia", payment_method_id: expense.payment_method_id, usarFondo: false,
        }
      : {
          descripcion: "", valor: 0, category_id: defaults.cat ?? "", hormigaMode: "auto", fecha: todayISO(),
          quien: defaults.quien ?? "familia", payment_method_id: defaults.medio ?? methods[0]?.id ?? null, usarFondo: true,
        },
  })
  const { errors, isSubmitting } = form.formState
  const w = form.watch()

  useEffect(() => {
    if (!open || expense) return
    createClient().from("emergency_funds").select("activo,saldo").eq("book_id", bookId).maybeSingle().then(({ data }) => setFondo(data ? { activo: data.activo, saldo: Number(data.saldo) } : null))
  }, [open, expense, bookId])

  // Categoría automática por reglas mientras escribe (si el usuario no la eligió a mano)
  const onDesc = (v: string) => {
    if (catManual) return
    const id = ruleCategory(v, rules)
    if (id) form.setValue("category_id", id, { shouldValidate: true })
  }

  const umbral = Number(cfg?.umbral ?? 25000)
  const isImprevisto = cats.find((c) => c.id === w.category_id)?.nombre === "Imprevistos"
  const autoH = w.hormigaMode === "auto" && w.valor > 0 && localHormiga({ descripcion: w.descripcion, valor: w.valor, category_id: w.category_id }, cats, umbral)

  async function onSubmit(v: Values) {
    const sb = createClient()
    const row = {
      ...(expense ? { id: expense.id } : {}),
      book_id: bookId, descripcion: v.descripcion.trim(), valor: v.valor, category_id: v.category_id, fecha: v.fecha || todayISO(),
      member_id: v.quien === "familia" ? null : v.quien, payment_method_id: v.payment_method_id ?? defaults.medio ?? methods[0]?.id ?? null,
      hormiga: v.hormigaMode === "auto" ? false : v.hormigaMode === "si",
      hormiga_src: v.hormigaMode === "auto" ? null : ("manual" as const),
      cat_src: catManual ? ("manual" as const) : ("regla" as const),
    }
    const { data, error } = await sb.from("expenses").upsert(row).select().single()
    if (error) return toast.error("No se pudo guardar el gasto", { description: error.message })

    if (isImprevisto && v.usarFondo && fondo?.activo && fondo.saldo > 0 && !expense) {
      // Atómico en la BD: descuenta del fondo y registra el movimiento (y lo devuelve si se borra el gasto)
      const { data: queda, error: fe } = await sb.rpc("use_emergency_fund", { p_expense: data.id, p_valor: v.valor })
      if (fe) toast.error("El gasto se guardó, pero no se pudo descontar del fondo", { description: fe.message })
      else toast.success("Imprevisto registrado", { description: `Gasto registrado y pagado con tu fondo de emergencia. Te quedan ${fmtMoney(Number(queda))} en el fondo.` })
    } else {
      toast.success(expense ? "Gasto actualizado" : isHormiga(data, cats, umbral) ? "Gasto hormiga registrado" : "Gasto registrado")
    }
    qc.invalidateQueries({ queryKey: ["b", bookId] })
    form.reset()
    setCatManual(false)
    onOpenChange(false)
  }

  return (
    <>
        <form id={formId} onSubmit={form.handleSubmit(onSubmit)} noValidate aria-busy={isSubmitting}>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr]">
              <FormField label="¿En qué gastaste?" htmlFor="g-desc" error={errors.descripcion?.message} required>
                <Input id="g-desc" className="h-11" autoFocus placeholder="Ej. Mercado en el D1" {...form.register("descripcion", { onChange: (e) => onDesc(e.target.value) })} />
              </FormField>
              <FormField label="Valor" htmlFor="g-valor" error={errors.valor?.message} required>
                <Controller control={form.control} name="valor" render={({ field }) => <MoneyInput id="g-valor" value={field.value} onChange={field.onChange} invalid={!!errors.valor} />} />
              </FormField>
            </div>
            <FormField label="Categoría" htmlFor="g-cat" error={errors.category_id?.message} required hint={!catManual && w.category_id && w.descripcion ? "Se puso sola según lo que escribiste. Puedes cambiarla." : undefined}>
              <Controller control={form.control} name="category_id" render={({ field }) => (
                <Combobox id="g-cat" value={field.value} onChange={(v) => { setCatManual(true); field.onChange(v) }} options={categoryOptions(cats)} invalid={!!errors.category_id}
                  placeholder="Elige una categoría" createLabel="Crear" onCreate={(t) => setNewCat(t || " ")} />
              )} />
            </FormField>
            <FormField label="¿Es un gasto hormiga?" hint={w.hormigaMode === "auto" ? (autoH ? "Parece hormiga: pequeño y evitable." : "Mirai lo decide solo.") : undefined}>
              <Controller control={form.control} name="hormigaMode" render={({ field }) => (
                <Segmented value={field.value} onChange={field.onChange} items={[{ value: "auto", label: "Que Mirai decida", icon: "sparkles" }, { value: "si", label: "Sí", icon: "coffee" }, { value: "no", label: "No" }]} />
              )} />
            </FormField>
            <div className="grid gap-5 sm:grid-cols-3">
              <FormField label="Fecha" htmlFor="g-fecha"><Controller control={form.control} name="fecha" render={({ field }) => <DatePicker id="g-fecha" value={field.value} onChange={(v) => field.onChange(v ?? todayISO())} />} /></FormField>
              <FormField label="¿Quién gastó?" htmlFor="g-quien"><Controller control={form.control} name="quien" render={({ field }) => <Combobox id="g-quien" value={field.value} onChange={field.onChange} options={memberOptions(members)} />} /></FormField>
              <FormField label="Medio de pago" htmlFor="g-medio"><Controller control={form.control} name="payment_method_id" render={({ field }) => <Combobox id="g-medio" value={field.value} onChange={field.onChange} options={methodOptions(methods)} />} /></FormField>
            </div>
            {isImprevisto && !expense && (fondo?.activo && fondo.saldo > 0 ? (
              <label className="flex items-start gap-3 rounded-lg border border-dashed p-3">
                <Controller control={form.control} name="usarFondo" render={({ field }) => <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} className="mt-0.5" />} />
                <span className="grid gap-0.5 text-sm">
                  <b>Pagarlo con mi fondo de emergencia</b>
                  <span className="text-muted-foreground">Es un imprevisto. Tienes <Money value={fondo.saldo} /> guardados.</span>
                </span>
              </label>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Es un imprevisto. Queda separado en la categoría Imprevistos. Crea tu fondo de emergencia en Metas para pagar estos gastos sin desordenar tu mes.
              </p>
            ))}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="size-3.5" /> Pronto: foto de la factura y clasificación con IA (fase 4).</p>
          </FieldGroup>
          {isSubmitting && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Guardando…</p>}
        </form>
      <CategoryDialog open={newCat !== null} onOpenChange={(o) => !o && setNewCat(null)} initialName={newCat?.trim() ?? ""}
        onCreated={(id) => { setCatManual(true); form.setValue("category_id", id, { shouldValidate: true }) }} />
    </>
  )
}
