"use client"

import { useEffect, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Camera } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Money } from "@/components/mirai/money"
import { useBookId } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import {
  categoryOptions, memberOptions, methodOptions, useCategories, useKeywordRules, useMembers, usePaymentMethods, useSettings,
} from "@/features/catalogs/hooks"
import { CategoryDialog } from "@/features/catalogs/category-dialog"
import { isHormiga, localCat, localHormiga } from "./logic"
import { classifyExpenses, readInvoice } from "@/features/ai/actions"
import { useList } from "@/hooks/use-book-data"

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
      <ReadyGate><ExpenseFormBody {...props} formId={formId} /></ReadyGate>
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
  const [catSrc, setCatSrc] = useState<"regla" | "historial" | "palabras" | "ia" | null>(null)
  const [aiH, setAiH] = useState<{ h: boolean; razon: string } | null>(null)
  const [aiBusy, setAiBusy] = useState<"foto" | "cat" | null>(null)
  const [fotoMsg, setFotoMsg] = useState<string | null>(null)
  const fotoRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aiCache = useRef(new Map<string, { category_id: string | null; hormiga: boolean | null; razon: string }>())
  const { data: history = [] } = useList("expenses", { order: { column: "created_at" } })
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
          descripcion: "", valor: 0, category_id: defaults.cat || "", hormigaMode: "auto", fecha: todayISO(),
          quien: defaults.quien || "familia", payment_method_id: defaults.medio || methods[0]?.id || null, usarFondo: true,
        },
  })
  const { errors, isSubmitting } = form.formState
  const w = form.watch()

  useEffect(() => {
    if (!open || expense) return
    createClient().from("emergency_funds").select("activo,saldo").eq("book_id", bookId).maybeSingle().then(({ data }) => setFondo(data ? { activo: data.activo, saldo: Number(data.saldo) } : null))
  }, [open, expense, bookId])

  // Categoría automática mientras escribe: regla → historial → palabras clave (si no la eligió a mano)
  const onDesc = (v: string) => {
    let hit: ReturnType<typeof localCat> = null
    if (!catManual) {
      hit = localCat(v, { rules, expenses: history, categories: cats })
      if (hit) { form.setValue("category_id", hit.category_id, { shouldValidate: true }); setCatSrc(hit.src) }
    }
    askAI(v, hit?.src)
  }

  // IA (onAutoInput de la v4): 750 ms después de escribir, si falta categoría o para decidir si es hormiga.
  const ia = (cfg?.ia ?? {}) as { on?: boolean; autocat?: boolean; hormiga?: boolean }
  const askAI = (desc: string, localSrc?: string) => {
    if (timer.current) clearTimeout(timer.current)
    setAiH(null)
    if (ia.on === false || desc.trim().length < 3) return
    timer.current = setTimeout(async () => {
      const valor = form.getValues("valor") || 0
      const needCat = ia.autocat !== false && !catManual && localSrc !== "regla" && localSrc !== "historial"
      const needH = ia.hormiga !== false && form.getValues("hormigaMode") === "auto" && valor > 0
      if (!needCat && !needH) return
      const key = `${desc.trim().toLowerCase()}|${Math.round(valor / 1000)}`
      let r = aiCache.current.get(key)
      if (!r) {
        setAiBusy("cat")
        const veces = history.filter((g) => g.descripcion.trim().toLowerCase() === desc.trim().toLowerCase()).length
        const out = await classifyExpenses([{ i: 0, descripcion: desc, valor: Math.round(valor), veces_mes: veces }])
        setAiBusy(null)
        if (!out?.[0]) return
        r = out[0]; aiCache.current.set(key, r)
      }
      if (form.getValues("descripcion") !== desc) return
      if (needCat && r.category_id && !localSrc) { form.setValue("category_id", r.category_id, { shouldValidate: true }); setCatSrc("ia") }
      if (needH && r.hormiga !== null) setAiH({ h: r.hormiga, razon: r.razon })
    }, 750)
  }

  const onFoto = async (f: File | undefined) => {
    if (!f) return
    setAiBusy("foto"); setFotoMsg("Leyendo la factura…")
    const fd = new FormData(); fd.append("file", f)
    const r = await readInvoice(fd).catch((e) => ({ ok: false as const, msg: (e as Error).message }))
    setAiBusy(null)
    if (!r.ok) return setFotoMsg(r.msg)
    form.setValue("descripcion", r.comercio, { shouldValidate: true })
    if (r.valor) form.setValue("valor", r.valor, { shouldValidate: true })
    if (r.fecha) form.setValue("fecha", r.fecha)
    if (r.category_id) { form.setValue("category_id", r.category_id, { shouldValidate: true }); setCatManual(true); setCatSrc("ia") }
    setFotoMsg("Listo. Revisa los datos antes de guardar.")
    askAI(r.comercio, r.category_id ? "regla" : undefined)
  }

  const umbral = Number(cfg?.umbral ?? 25000)
  const isImprevisto = cats.find((c) => c.id === w.category_id)?.nombre === "Imprevistos"
  const autoH = w.hormigaMode === "auto" && w.valor > 0 && localHormiga({ descripcion: w.descripcion, valor: w.valor, category_id: w.category_id }, cats, umbral)

  async function onSubmit(v: Values) {
    const sb = createClient()
    const row = {
      ...(expense ? { id: expense.id } : {}),
      book_id: bookId, descripcion: v.descripcion.trim(), valor: v.valor, category_id: v.category_id, fecha: v.fecha || todayISO(),
      member_id: v.quien === "familia" ? null : v.quien, payment_method_id: v.payment_method_id || defaults.medio || methods[0]?.id || null,
      hormiga: v.hormigaMode === "auto" ? (aiH?.h ?? false) : v.hormigaMode === "si",
      hormiga_src: v.hormigaMode === "auto" ? (aiH ? ("ia" as const) : null) : ("manual" as const),
      hormiga_razon: v.hormigaMode === "auto" && aiH ? aiH.razon : null,
      cat_src: catManual && catSrc !== "ia" ? ("manual" as const) : catSrc,
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
            {ia.on !== false && !expense && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="soft" size="sm" disabled={aiBusy === "foto"} onClick={() => fotoRef.current?.click()}>{aiBusy === "foto" ? <Spinner /> : <Camera />} Leer una factura con foto</Button>
                <input ref={fotoRef} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => { onFoto(e.target.files?.[0]); e.target.value = "" }} />
                <span className="text-xs text-muted-foreground">{fotoMsg ?? "La IA saca el valor, el comercio y la fecha."}</span>
              </div>
            )}
            <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr]">
              <FormField label="¿En qué gastaste?" htmlFor="g-desc" error={errors.descripcion?.message} required>
                <Input id="g-desc" className="h-11" autoFocus placeholder="Ej. Mercado en el D1" {...form.register("descripcion", { onChange: (e) => onDesc(e.target.value) })} />
              </FormField>
              <FormField label="Valor" htmlFor="g-valor" error={errors.valor?.message} required>
                <Controller control={form.control} name="valor" render={({ field }) => <MoneyInput id="g-valor" value={field.value} onChange={field.onChange} invalid={!!errors.valor} />} />
              </FormField>
            </div>
            <FormField label="Categoría" htmlFor="g-cat" error={errors.category_id?.message} required hint={!catManual && catSrc && w.descripcion ? { regla: "Se puso sola por una de tus reglas.", historial: "Se puso sola: así la registraste antes.", palabras: "Se puso sola según lo que escribiste.", ia: "Categoría sugerida por IA." }[catSrc] + " Puedes cambiarla." : undefined}>
              <Controller control={form.control} name="category_id" render={({ field }) => (
                <Combobox id="g-cat" value={field.value} onChange={(v) => { setCatManual(true); field.onChange(v) }} options={categoryOptions(cats)} invalid={!!errors.category_id}
                  placeholder="Elige una categoría" createLabel="Crear" onCreate={(t) => setNewCat(t || " ")} />
              )} />
            </FormField>
            <FormField label="¿Es un gasto hormiga?" hint={w.hormigaMode === "si" ? "Lo marcaste como hormiga." : w.hormigaMode === "auto" ? (aiBusy === "cat" ? "La IA está pensando…" : aiH ? (aiH.h ? `La IA lo detecta como gasto hormiga: ${aiH.razon}` : `La IA no lo ve como hormiga: ${aiH.razon}`) : autoH ? "Parece un gasto hormiga." : "Mirai lo decide solo.") : undefined}>
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
          </FieldGroup>
          {isSubmitting && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Guardando…</p>}
        </form>
      <CategoryDialog open={newCat !== null} onOpenChange={(o) => !o && setNewCat(null)} initialName={newCat?.trim() ?? ""}
        onCreated={(id) => { setCatManual(true); form.setValue("category_id", id, { shouldValidate: true }) }} />
    </>
  )
}

/** Monta el formulario cuando los catálogos ya cargaron (skeleton mientras tanto). */
function ReadyGate({ children }: { children: React.ReactNode }) {
  return useCatalogsReady() ? <>{children}</> : <FormSkeleton />
}
