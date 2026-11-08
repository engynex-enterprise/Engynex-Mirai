"use client"

import { useEffect, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Camera } from "lucide-react"
import { parseAsString, useQueryStates } from "nuqs"
import { toast } from "@/components/mirai/toast"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { SubmitButton, useSubmitState } from "@/components/mirai/submit-button"
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
import { apiFund, apiInsertRow, apiUpdateRow } from "@/lib/api/book-rows"
import { linkExpenseFixed, unlinkExpenseFixed, payWithEmergencyFund } from "./commands"
import { fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import {
  categoryOptions, memberOptions, methodOptions, useCategories, useKeywordRules, useMembers, usePaymentMethods, useSettings,
} from "@/features/catalogs/hooks"
import { CategoryDialog } from "@/features/catalogs/category-dialog"
import { PagarA } from "./pagar-a"
import { categoriaSugerida, periodoTexto, sugerirPagoFijo, vecesMes } from "@/lib/domain"
import { DEDUCIBLES } from "@/lib/domain/renta"
import { useBookData } from "@/features/book/use-book-data"
import { useCanEdit } from "@/components/app/app-context"
import { isHormiga, localCat, localHormiga } from "./logic"
import { classifyExpenses, readInvoice } from "@/features/ai/api"
import { useList } from "@/hooks/use-book-data"
import { takeShared } from "@/features/pwa/shared"

const schema = z.object({
  descripcion: z.string().trim().min(1, "Escribe en qué gastaste"),
  valor: z.number().positive("Escribe el valor del gasto"),
  category_id: z.string().min(1, "Elige la categoría"),
  hormigaMode: z.enum(["auto", "si", "no"]),
  fecha: z.string(),
  quien: z.string(),
  payment_method_id: z.string().nullable(),
  provider_id: z.string().nullable(),
  contact_id: z.string().nullable(),
  usarFondo: z.boolean(),
  /** Deducción de renta a la que puede servir (expenses.deducible); null = no aplica. */
  deducible: z.string().nullable(),
})
type Values = z.infer<typeof schema>

/** `preset`: valores iniciales al crear (p. ej. desde Proveedores › "Registrar un gasto"). */
type Preset = { provider_id?: string | null; payment_method_id?: string | null; category_id?: string | null; descripcion?: string }
type Props = { open: boolean; onOpenChange: (o: boolean) => void; expense?: Row<"expenses"> | null; preset?: Preset | null }

/** Registrar / editar gasto. El formulario se monta al abrir para tomar los valores por defecto ya cargados. */
export function ExpenseForm(props: Props) {
  const [formId] = useState(() => `gasto-${Math.random().toString(36).slice(2)}`)
  return (
    <ResponsiveDialog
      open={props.open} onOpenChange={props.onOpenChange} mdesc="gasto"
      title={props.expense ? "Editar gasto" : "Registrar gasto"}
      footer={<><Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancelar</Button><SubmitButton form={formId} /></>}
    >
      <ReadyGate><ExpenseFormBody {...props} formId={formId} /></ReadyGate>
    </ResponsiveDialog>
  )
}

function ExpenseFormBody({ onOpenChange, expense, formId, preset }: Props & { formId: string }) {
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
  // La respuesta de la IA llega después: si mientras tanto la persona escogió la categoría, se respeta la suya.
  const catManualRef = useRef(false)
  useEffect(() => { catManualRef.current = catManual }, [catManual])
  const [catSrc, setCatSrc] = useState<"regla" | "historial" | "palabras" | "ia" | null>(null)
  const [aiH, setAiH] = useState<{ h: boolean; razon: string; src: "ia" | "regla" } | null>(null)
  const [aiBusy, setAiBusy] = useState<"foto" | "cat" | null>(null)
  const [fotoMsg, setFotoMsg] = useState<string | null>(null)
  const fotoRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aiCache = useRef(new Map<string, { category_id: string | null; hormiga: boolean | null; razon: string; src?: "regla" | "ia" }>())
  const { data: history = [] } = useList("expenses", { order: { column: "created_at" } })
  const { data: book } = useBookData()
  const canEdit = useCanEdit()
  const defaults = (cfg?.defaults ?? {}) as { cat?: string; medio?: string; quien?: string }

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: expense
      ? {
          descripcion: expense.descripcion, valor: Number(expense.valor), category_id: expense.category_id ?? "",
          hormigaMode: expense.hormiga_src === "manual" ? (expense.hormiga ? "si" : "no") : "auto",
          fecha: expense.fecha, quien: expense.member_id ?? "familia", payment_method_id: expense.payment_method_id, provider_id: expense.provider_id ?? null, contact_id: expense.contact_id ?? null, usarFondo: false, deducible: expense.deducible ?? null,
        }
      : {
          descripcion: preset?.descripcion ?? "", valor: 0, category_id: preset?.category_id || defaults.cat || "", hormigaMode: "auto", fecha: todayISO(),
          quien: defaults.quien || "familia", payment_method_id: preset?.payment_method_id || defaults.medio || methods[0]?.id || null, provider_id: preset?.provider_id ?? null, contact_id: null, usarFondo: true, deducible: null,
        },
  })
  const { errors, isSubmitting } = form.formState
  useSubmitState(formId, form)
  const w = form.watch()

  useEffect(() => {
    if (!open || expense) return
    const set = (data: { activo: boolean; saldo: number | string } | null) => setFondo(data ? { activo: data.activo, saldo: Number(data.saldo) } : null)
    apiFund<{ activo: boolean; saldo: number }>(bookId).then(set, () => set(null))
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
      // La IA decide siempre la categoría (lo de las reglas ya quedó puesto como sugerencia mientras responde).
      const needCat = ia.autocat !== false && !catManual
      const needH = ia.hormiga !== false && form.getValues("hormigaMode") === "auto" && valor > 0
      if (!needCat && !needH) return
      const key = `${desc.trim().toLowerCase()}|${Math.round(valor / 1000)}`
      let r = aiCache.current.get(key)
      if (!r) {
        setAiBusy("cat")
        // Veces en los últimos 30 días (lo que la IA recibe como "veces al mes"), no en toda la historia.
        const veces = vecesMes(desc, history, todayISO())
        const out = await classifyExpenses([{ i: 0, descripcion: desc, valor: Math.round(valor), veces_mes: veces }])
        setAiBusy(null)
        if (!out?.[0]) return
        r = out[0]; aiCache.current.set(key, r)
      }
      if (form.getValues("descripcion") !== desc) return
      if (needCat && r.category_id && !catManualRef.current) { form.setValue("category_id", r.category_id, { shouldValidate: true }); setCatSrc("ia") }
      if (needH && r.hormiga !== null) setAiH({ h: r.hormiga, razon: r.razon, src: r.src === "regla" ? "regla" : "ia" })
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

  // Compartido a Mirai desde otra app (Galería, WhatsApp, el correo…): el service worker dejó la foto o el PDF y el
  // texto (features/pwa/shared.ts); se llenan solos y la factura se lee con IA. Una sola vez por apertura.
  const [shared, setShared] = useQueryStates({ compartido: parseAsString, desc: parseAsString, valor: parseAsString }, { history: "replace" })
  const sharedDone = useRef(false)
  const fill = useRef({ onDesc, onFoto })
  useEffect(() => { fill.current = { onDesc, onFoto } })
  useEffect(() => {
    if (expense || !shared.compartido || sharedDone.current) return
    sharedDone.current = true
    const { compartido, desc, valor } = shared
    void (async () => {
      const got = compartido === "sin-archivo" ? { file: null, text: null } : await takeShared()
      const d = got.text?.descripcion || desc || ""
      const v = got.text?.valor || (Number(valor) > 0 ? Number(valor) : 0)
      if (d) { form.setValue("descripcion", d, { shouldValidate: true }); fill.current.onDesc(d) }
      if (v) form.setValue("valor", v, { shouldValidate: true })
      if (got.file) {
        if (ia.on === false) toast.info("Recibimos tu factura", { description: "La lectura con IA está apagada en Ajustes › Inteligencia artificial: escribe los datos a mano." })
        else await fill.current.onFoto(got.file)
      } else if (compartido !== "texto") setFotoMsg("No alcanzamos a recibir la foto. Toca Leer una factura con foto para tomarla o escogerla.")
      void setShared({ compartido: null, desc: null, valor: null })
    })()
  }, [expense, shared, setShared, form, ia.on])

  const umbral = Number(cfg?.umbral ?? 25000)
  const isImprevisto = cats.find((c) => c.id === w.category_id)?.nombre === "Imprevistos"
  const autoH = w.hormigaMode === "auto" && w.valor > 0 && localHormiga({ descripcion: w.descripcion, valor: w.valor, category_id: w.category_id }, cats, umbral)

  async function onSubmit(v: Values) {
    const row = {
      ...(expense ? { id: expense.id } : {}),
      book_id: bookId, descripcion: v.descripcion.trim(), valor: v.valor, category_id: v.category_id, fecha: v.fecha || todayISO(),
      member_id: v.quien === "familia" ? null : v.quien, payment_method_id: v.payment_method_id || defaults.medio || methods[0]?.id || null,
      hormiga: v.hormigaMode === "auto" ? (aiH?.h ?? false) : v.hormigaMode === "si",
      // Quién lo decidió de verdad: una regla o la IA (la ayuda del ícono lo dice así).
      hormiga_src: v.hormigaMode === "auto" ? (aiH ? aiH.src : null) : ("manual" as const),
      hormiga_razon: v.hormigaMode === "auto" && aiH ? aiH.razon : null,
      cat_src: catManual && catSrc !== "ia" ? ("manual" as const) : catSrc,
      provider_id: v.provider_id,
      contact_id: v.contact_id,
      deducible: v.deducible || null,
    }
    const { data, error } = expense ? await apiUpdateRow<Row<"expenses">>(bookId, "expenses", expense.id, row) : await apiInsertRow<Row<"expenses">>(bookId, "expenses", row)
    if (error || !data) return toast.error("No se pudo guardar el gasto", { description: error?.message })

    if (isImprevisto && v.usarFondo && fondo?.activo && fondo.saldo > 0 && !expense) {
      // Atómico en la BD: descuenta del fondo y registra el movimiento (y lo devuelve si se borra el gasto)
      const { data: queda, error: fe } = await payWithEmergencyFund({ p_expense: data.id, p_valor: v.valor })
      if (fe) toast.error("El gasto se guardó, pero no se pudo descontar del fondo", { description: fe.message })
      else toast.success("Imprevisto registrado", { description: `Gasto registrado y pagado con tu fondo de emergencia. Te quedan ${fmtMoney(Number(queda))} en el fondo.` })
    } else {
      // ¿Es el pago de un gasto fijo pendiente (p. ej. el arriendo)? Se pregunta y se enlaza sin duplicar.
      const sug = !expense && canEdit && book ? sugerirPagoFijo(data, book.fixedExpenses) : null
      const titulo = expense ? "Gasto actualizado" : isHormiga(data, cats, umbral) ? "Gasto hormiga registrado" : "Gasto registrado"
      if (!sug) toast.success(titulo)
      else {
        const cual = [sug.fixed.nombre, periodoTexto(sug.per)].filter(Boolean).join(" de ")
        toast.success(titulo, {
          description: `¿Es el pago de ${cual}? Si lo es, lo marcamos como pagado y no se cuenta dos veces.`,
          duration: 12000,
          action: { label: "Sí, es ese pago", onClick: async () => {
            const { error: le } = await linkExpenseFixed({ p_expense: data.id, p_fixed: sug.fixed.id, p_periodo: sug.per })
            if (le) return toast.error("No se pudo enlazar", { description: le.message })
            qc.invalidateQueries({ queryKey: ["b", bookId] })
            toast.success(`${sug.fixed.nombre} quedó pagado`, { description: "Usamos este gasto como el pago: no se cuenta dos veces.", action: { label: "Deshacer", onClick: async () => {
              const { error: ue } = await unlinkExpenseFixed({ p_expense: data.id })
              if (ue) return toast.error("No se pudo deshacer", { description: ue.message })
              qc.invalidateQueries({ queryKey: ["b", bookId] })
            } } })
          } },
        })
      }
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
                  placeholder="Elige una categoría" createLabel="Crear" onCreate={(t) => setNewCat(t || " ")} onCreateAI={(t) => setNewCat(t || " ")} />
              )} />
            </FormField>
            <FormField label="¿Es un gasto hormiga?" hint={w.hormigaMode === "si" ? "Lo marcaste como hormiga." : w.hormigaMode === "auto" ? (aiBusy === "cat" ? "La IA está pensando…" : aiH ? (aiH.h ? `La IA lo detecta como gasto hormiga: ${aiH.razon}` : `La IA no lo ve como hormiga: ${aiH.razon}`) : autoH ? "Parece un gasto hormiga." : "Mirai lo decide solo.") : undefined}>
              <Controller control={form.control} name="hormigaMode" render={({ field }) => (
                <Segmented value={field.value} onChange={field.onChange} items={[{ value: "auto", label: "Que Mirai decida", icon: "sparkles" }, { value: "si", label: "Sí", icon: "coffee" }, { value: "no", label: "No" }]} />
              )} />
            </FormField>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Fecha" htmlFor="g-fecha"><Controller control={form.control} name="fecha" render={({ field }) => <DatePicker id="g-fecha" value={field.value} onChange={(v) => field.onChange(v ?? todayISO())} />} /></FormField>
              <FormField label="¿Quién gastó?" htmlFor="g-quien"><Controller control={form.control} name="quien" render={({ field }) => <Combobox id="g-quien" value={field.value} onChange={field.onChange} options={memberOptions(members)} />} /></FormField>
              <FormField label="Medio de pago" htmlFor="g-medio"><Controller control={form.control} name="payment_method_id" render={({ field }) => <Combobox id="g-medio" value={field.value} onChange={field.onChange} options={methodOptions(methods)} />} /></FormField>

            </div>
            <FormField label="¿A quién le pagaste? (opcional)" tip="No siempre hace falta: en la gasolinera o la tienda de barrio déjalo así. Si es un negocio al que le pagas seguido (Enel, el colegio) elige Negocio o empresa; si es alguien en particular (la señora del aseo, el arrendador), Una persona.">
              <Controller control={form.control} name="provider_id" render={({ field }) => (
                <PagarA provider={field.value} contact={w.contact_id}
                  onContact={(id) => form.setValue("contact_id", id)}
                  onProvider={(id, p) => {
                    field.onChange(id)
                    // Medio de pago preferido del proveedor (solo al crear).
                    if (!expense && p?.payment_method_id) form.setValue("payment_method_id", p.payment_method_id)
                    // Categoría por defecto del proveedor si aún no hay una o no la escogió a mano.
                    const c = categoriaSugerida(p, cats)
                    if (c && (!catManual || !form.getValues("category_id"))) { form.setValue("category_id", c, { shouldValidate: true }); setCatSrc(null) }
                  }} />
              )} />
            </FormField>
            <FormField label="¿Sirve para tu declaración de renta? (opcional)" htmlFor="g-deducible"
              tip="Algunos gastos bajan el impuesto de renta: la medicina prepagada, los intereses del crédito de vivienda o del ICETEX. Márcalos y Mirai los suma en Declaración de renta."
              hint={DEDUCIBLES.find((d) => d.value === w.deducible)?.help}>
              <Controller control={form.control} name="deducible" render={({ field }) => (
                <Combobox id="g-deducible" value={field.value ?? "no"} onChange={(v) => field.onChange(v && v !== "no" ? v : null)}
                  options={[{ value: "no", label: "No aplica" }, ...DEDUCIBLES.map((d) => ({ value: d.value, label: d.label }))]} />
              )} />
            </FormField>
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
      <CategoryDialog open={newCat !== null} onOpenChange={(o) => !o && setNewCat(null)} initialName={newCat?.trim() ?? ""} ctxDesc={w.descripcion}
        onCreated={(id) => { setCatManual(true); form.setValue("category_id", id, { shouldValidate: true }) }} />
    </>
  )
}

/** Monta el formulario cuando los catálogos ya cargaron (skeleton mientras tanto). */
function ReadyGate({ children }: { children: React.ReactNode }) {
  return useCatalogsReady() ? <>{children}</> : <FormSkeleton />
}
