"use client"

import { useEffect } from "react"
import { Controller, useForm, type Control, type Resolver, type UseFormRegister } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Copy, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Combobox } from "@/components/mirai/combobox"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { Segmented } from "@/components/mirai/choice-cards"
import { CATALOG, DIR_CUOTA, EVENTOS_SUSCRIPCION, FRECUENCIAS, GROUPS, PARA, TIPOS_PAGO, VARIABLES } from "@/lib/automations/catalog"
import { NODE_SCHEMAS } from "@/lib/automations/schema"
import { DIAS_SEMANA } from "@/lib/domain/reparto"
import type { FlowNode, NodeData } from "@/lib/automations/types"
import { cn } from "@/lib/utils"
import { StepIcon, GROUP_STYLE } from "../shared"

type Opt = { value: string; label: string; icon?: string }
type Vals = Record<string, unknown>
export type PropsOptions = {
  categorias: Opt[]; metas: Opt[]; miembros: Opt[]; triggerHasMonto: boolean
  /** Gastos fijos, tarjetas y personas con cuenta (user_id) para los pasos nuevos. */
  fijos?: Opt[]; tarjetas?: Opt[]; personas?: Opt[]
  /** El disparador trae a quien hizo el movimiento (para "Quien hizo el movimiento"). */
  triggerHasAutor?: boolean
}

/** Chips que se tocan para elegir varios valores (días, tipos de pago, categorías). */
function Chips<T extends string | number>({ value, onChange, items, label }: { value: T[]; onChange: (v: T[]) => void; items: { value: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((i) => {
        const on = value.includes(i.value)
        return (
          <button key={String(i.value)} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== i.value) : [...value, i.value])}
            className={cn("h-8 rounded-full px-3 text-[13px] font-semibold transition-colors", on ? "bg-brand-soft text-link ring-2 ring-brand/40" : "bg-secondary hover:bg-secondary-hover")}>
            {i.label}
          </button>
        )
      })}
    </div>
  )
}

/** Botones para meter {variables} en un texto. */
function Vars({ onPick }: { onPick: (k: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[12px] text-muted-foreground">Insertar:</span>
      {VARIABLES.map((v) => (
        <button key={v.k} type="button" title={v.d} onClick={() => onPick(`{${v.k}}`)} className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11.5px] hover:bg-secondary-hover">{`{${v.k}}`}</button>
      ))}
    </div>
  )
}

const Num = ({ id, register, name, min, max, suffix }: { id: string; register: UseFormRegister<Vals>; name: string; min?: number; max?: number; suffix?: string }) => (
  <div className="flex items-center gap-2">
    <Input id={id} type="number" inputMode="numeric" min={min} max={max} className="h-11 w-28" {...register(name, { valueAsNumber: true })} />
    {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
  </div>
)

function Fields({ kind, control, register, setValue, getValues, err, o }: {
  kind: FlowNode["kind"]; control: Control<Vals>; register: UseFormRegister<Vals>; setValue: (k: string, v: unknown) => void; getValues: (k: string) => unknown; err: (k: string) => string | undefined; o: PropsOptions
}) {
  const id = (k: string) => `p-${k}`
  const seg = (name: string, items: { value: string; label: string }[]) => (
    <Controller control={control} name={name} render={({ field }) => <Segmented value={String(field.value ?? "")} onChange={field.onChange} items={items} />} />
  )
  const combo = (name: string, options: Opt[], placeholder: string, allowNone?: string) => (
    <Controller control={control} name={name} render={({ field }) => (
      <Combobox id={id(name)} value={(field.value as string) ?? (allowNone ? "" : null)} onChange={(v) => field.onChange(v || (allowNone ? null : ""))}
        options={allowNone ? [{ value: "", label: allowNone }, ...options] : options} placeholder={placeholder} />
    )} />
  )
  const money = (name: string) => <Controller control={control} name={name} render={({ field }) => <MoneyInput id={id(name)} value={field.value as number} onChange={(v) => field.onChange(v ?? 0)} invalid={!!err(name)} />} />
  const text = (name: string, label: string, area?: boolean) => (
    <FormField label={label} htmlFor={id(name)} tip={false} error={err(name)} hint={<Vars onPick={(v) => setValue(name, `${String(getValues(name) ?? "")}${v}`)} />}>
      {area ? <Textarea id={id(name)} rows={3} {...register(name)} /> : <Input id={id(name)} className="h-11" {...register(name)} />}
    </FormField>
  )
  const canales = <FormField label="¿Por dónde?" tip={false} hint="“Todos” usa los canales que cada persona tenga activos en Ajustes › Alertas (y respeta su horario de silencio).">{seg("canales", [{ value: "app", label: "Solo en la app" }, { value: "todos", label: "App y sus canales" }])}</FormField>
  const para = (
    <FormField label="¿A quién?" htmlFor={id("para")} tip={false} error={err("para")} hint="Solo las personas con cuenta en Mirai reciben avisos.">
      <Controller control={control} name="para" render={({ field }) => (
        <Combobox id={id("para")} value={String(field.value || "hogar")} onChange={(v) => field.onChange(v || "hogar")}
          options={[...PARA.filter((x) => x.value !== "autor" || o.triggerHasAutor).map((x) => ({ value: x.value, label: x.label })), ...(o.personas ?? [])]} />
      )} />
    </FormField>
  )
  const dias = DIAS_SEMANA.map((d, i) => ({ value: i, label: d.slice(0, 3) }))

  switch (kind) {
    case "gasto": case "pago_fijo": case "hormiga": case "marcar_hormiga": case "recordatorio":
      return <p className="text-sm text-muted-foreground">Este paso no necesita datos.</p>
    case "cuota":
      return <FormField label="¿Qué cuotas?" tip={false} hint="Le debo: lo que tú pagas. Me deben: lo que te pagan a ti.">{seg("dir", DIR_CUOTA.map((x) => ({ value: x.value, label: x.label })))}</FormField>
    case "compra_tarjeta":
      return <FormField label="Tarjeta" htmlFor={id("card_id")} tip={false}>{combo("card_id", o.tarjetas ?? [], "Cualquier tarjeta", "Cualquier tarjeta")}</FormField>
    case "suscripcion":
      return <FormField label="¿Cuándo?" tip={false} hint="“Cuando se cobra”: al tocar Ya se cobró en Suscripciones.">{seg("evento", EVENTOS_SUSCRIPCION.map((x) => ({ value: x.value, label: x.label })))}</FormField>
    case "crear_ingreso":
      return (
        <Controller control={control} name="modo" render={({ field: m }) => (
          <>
            <FormField label="¿Cuánto?" tip={false}><Segmented value={String(m.value)} onChange={m.onChange} items={[{ value: "pct", label: "% del monto" }, { value: "fijo", label: "Un valor fijo" }]} /></FormField>
            {m.value === "pct" && <FormField label="Porcentaje" htmlFor={id("pct")} tip={false} error={err("pct")} hint={o.triggerHasMonto ? "Del monto que trae el disparador." : "Ojo: el disparador elegido no trae un monto."}><Num id={id("pct")} register={register} name="pct" min={1} max={100} suffix="%" /></FormField>}
            {m.value === "fijo" && <FormField label="Valor" htmlFor={id("valor")} tip={false} error={err("valor")}>{money("valor")}</FormField>}
            <FormField label="Categoría" htmlFor={id("category_id")} tip={false}>{combo("category_id", o.categorias, "Sin categoría", "Sin categoría")}</FormField>
            {text("descripcion", "Descripción")}
          </>
        )} />
      )
    case "pagar_fijo":
      return (
        <>
          <FormField label="Gasto fijo" htmlFor={id("fixed_expense_id")} tip={false} error={err("fixed_expense_id")} hint="Se paga el periodo pendiente más antiguo (o el próximo), igual que al tocar Pagar.">
            {combo("fixed_expense_id", o.fijos ?? [], "Elige el gasto fijo")}
          </FormField>
          <FormField label="¿Con qué valor?" tip={false} hint={o.triggerHasMonto ? undefined : "Este disparador no trae un monto: usa el valor del gasto fijo."}>
            {seg("valor", [{ value: "fijo", label: "El del gasto fijo" }, ...(o.triggerHasMonto ? [{ value: "monto", label: "El monto del disparador" }] : [])])}
          </FormField>
        </>
      )
    case "ingreso":
      return <FormField label="¿Qué ingresos?" tip={false}>{seg("fuente", [{ value: "todos", label: "Todos" }, { value: "extras", label: "Ingresos extra" }, { value: "nomina", label: "Días de pago" }])}</FormField>
    case "programado":
      return (
        <Controller control={control} name="frecuencia" render={({ field }) => (
          <>
            <FormField label="¿Cada cuánto?" htmlFor={id("frecuencia")} tip={false}>
              <Combobox id={id("frecuencia")} value={String(field.value)} onChange={field.onChange} options={FRECUENCIAS.map((f) => ({ value: f.value, label: f.label }))} />
            </FormField>
            {field.value === "semanal" && <FormField label="Día de la semana" htmlFor={id("dia_semana")} tip={false}><Controller control={control} name="dia_semana" render={({ field: f }) => <Combobox id={id("dia_semana")} value={String(f.value)} onChange={(v) => f.onChange(Number(v))} options={DIAS_SEMANA.map((d, i) => ({ value: String(i), label: d }))} />} /></FormField>}
            {field.value === "mensual" && <FormField label="Día del mes" htmlFor={id("dia_mes")} tip={false} error={err("dia_mes")} hint="Si el mes es más corto, corre el último día."><Num id={id("dia_mes")} register={register} name="dia_mes" min={1} max={31} /></FormField>}
            <FormField label="Hora" htmlFor={id("hora")} tip={false} hint="Hora de Colombia. Puede llegar unos minutos después.">
              <Controller control={control} name="hora" render={({ field: f }) => <Combobox id={id("hora")} value={String(f.value)} onChange={(v) => f.onChange(Number(v))} options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${h % 12 || 12}:00 ${h < 12 ? "a. m." : "p. m."}` }))} />} />
            </FormField>
          </>
        )} />
      )
    case "presupuesto":
      return (
        <>
          <FormField label="Categoría" htmlFor={id("category_id")} tip={false}>{combo("category_id", o.categorias, "Cualquier categoría", "Cualquier categoría con presupuesto")}</FormField>
          <FormField label="Cuando llegue al" htmlFor={id("pct")} tip={false} error={err("pct")} hint="Del presupuesto (tope) del mes de esa categoría."><Num id={id("pct")} register={register} name="pct" min={10} max={200} suffix="%" /></FormField>
        </>
      )
    case "pago_proximo":
      return (
        <>
          <FormField label="¿Cuántos días antes?" htmlFor={id("dias")} tip={false} error={err("dias")} hint="0 = el mismo día del pago."><Num id={id("dias")} register={register} name="dias" min={0} max={30} suffix="días" /></FormField>
          <FormField label="¿Qué pagos?" tip={false} error={err("tipos")}><Controller control={control} name="tipos" render={({ field }) => <Chips label="Tipos de pago" value={(field.value as string[]) ?? []} onChange={field.onChange} items={TIPOS_PAGO.map((t) => ({ value: t.value, label: t.label }))} />} /></FormField>
        </>
      )
    case "saldo_bajo":
      return (
        <Controller control={control} name="tipo" render={({ field }) => (
          <>
            <FormField label="¿Qué revisar?" tip={false}><Segmented value={String(field.value)} onChange={field.onChange} items={[{ value: "fondo", label: "Fondo de emergencia" }, { value: "disponible", label: "Lo que me queda del mes" }]} /></FormField>
            {field.value === "fondo"
              ? <FormField label="Cuando baje del" htmlFor={id("pct")} tip={false} error={err("pct")} hint="De la meta de tu fondo (meses de gastos básicos)."><Num id={id("pct")} register={register} name="pct" min={1} max={100} suffix="%" /></FormField>
              : <FormField label="Cuando me quede menos de" htmlFor={id("valor")} tip={false} error={err("valor")}>{money("valor")}</FormField>}
          </>
        )} />
      )
    case "meta_alcanzada":
      return <FormField label="Meta" htmlFor={id("goal_id")} tip={false}>{combo("goal_id", o.metas, "Cualquier meta", "Cualquier meta")}</FormField>
    case "monto":
      return (
        <>
          <FormField label="El monto es" tip={false}>{seg("op", [{ value: "mayor", label: "Mayor que" }, { value: "menor", label: "Menor que" }])}</FormField>
          <FormField label="Valor" htmlFor={id("valor")} tip={false} error={err("valor")}>{money("valor")}</FormField>
        </>
      )
    case "categoria":
      return <FormField label="Categorías" tip={false} error={err("category_ids")} hint="Sí, si el movimiento es de alguna de estas."><Controller control={control} name="category_ids" render={({ field }) => <Chips label="Categorías" value={(field.value as string[]) ?? []} onChange={field.onChange} items={o.categorias} />} /></FormField>
    case "miembro":
      return <FormField label="Persona" htmlFor={id("member_id")} tip={false} error={err("member_id")}>{combo("member_id", o.miembros, "Elige a la persona")}</FormField>
    case "fecha":
      return (
        <Controller control={control} name="modo" render={({ field }) => (
          <>
            <FormField label="Revisar" tip={false}><Segmented value={String(field.value)} onChange={field.onChange} items={[{ value: "semana", label: "Día de la semana" }, { value: "quincena", label: "Quincena" }]} /></FormField>
            {field.value === "semana"
              ? <FormField label="Días" tip={false} error={err("dias")}><Controller control={control} name="dias" render={({ field: f }) => <Chips label="Días" value={(f.value as number[]) ?? []} onChange={f.onChange} items={dias} />} /></FormField>
              : <FormField label="¿Cuál quincena?" tip={false}>{seg("quincena", [{ value: "q1", label: "Primera" }, { value: "q2", label: "Segunda" }])}</FormField>}
          </>
        )} />
      )
    case "texto":
      return <FormField label="Palabras" htmlFor={id("contiene")} tip={false} error={err("contiene")} hint="Sepáralas con coma. No importan tildes ni mayúsculas."><Input id={id("contiene")} className="h-11" placeholder="rappi, domicilio" {...register("contiene")} /></FormField>
    case "aviso":
      return <>{text("titulo", "Título")}{text("mensaje", "Mensaje", true)}{para}{canales}</>
    case "movimiento":
      return (
        <Controller control={control} name="tipo" render={({ field }) => (
          <>
            <FormField label="¿Qué movimiento?" tip={false}><Segmented value={String(field.value)} onChange={field.onChange} items={[{ value: "meta", label: "Aporte a una meta" }, { value: "ahorro", label: "Ahorro en el fondo" }, { value: "gasto", label: "Gasto" }]} /></FormField>
            {field.value === "meta" && <FormField label="Meta" htmlFor={id("goal_id")} tip={false} error={err("goal_id")}>{combo("goal_id", o.metas, "Elige la meta")}</FormField>}
            {field.value === "gasto" && <FormField label="Categoría" htmlFor={id("category_id")} tip={false}>{combo("category_id", o.categorias, "Sin categoría", "Sin categoría")}</FormField>}
            <Controller control={control} name="modo" render={({ field: m }) => (
              <>
                <FormField label="¿Cuánto?" tip={false}><Segmented value={String(m.value)} onChange={m.onChange} items={[{ value: "pct", label: "% del monto" }, { value: "fijo", label: "Un valor fijo" }, { value: "fijos", label: "Lo de mis fijos" }]} /></FormField>
                {m.value === "pct" && <FormField label="Porcentaje" htmlFor={id("pct")} tip={false} error={err("pct")} hint={o.triggerHasMonto ? "Del monto que trae el disparador." : "Ojo: el disparador elegido no trae un monto."}><Num id={id("pct")} register={register} name="pct" min={1} max={100} suffix="%" /></FormField>}
                {m.value === "fijo" && <FormField label="Valor" htmlFor={id("valor")} tip={false} error={err("valor")}>{money("valor")}</FormField>}
                {m.value === "fijos" && <p className="text-sm text-muted-foreground">Usa lo que suman tus gastos fijos sin pagar de la quincena (con el disparador “En una fecha” › quincena).</p>}
              </>
            )} />
            {text("descripcion", "Descripción")}
          </>
        )} />
      )
    case "categorizar":
      return <FormField label="Categoría" htmlFor={id("category_id")} tip={false} error={err("category_id")}>{combo("category_id", o.categorias, "Elige la categoría")}</FormField>
    case "apartar":
      return (
        <Controller control={control} name="destino" render={({ field }) => (
          <>
            <FormField label="Porcentaje" htmlFor={id("pct")} tip={false} error={err("pct")} hint="Del monto que trae el disparador."><Num id={id("pct")} register={register} name="pct" min={1} max={100} suffix="%" /></FormField>
            <FormField label="¿Para dónde?" tip={false}><Segmented value={String(field.value)} onChange={field.onChange} items={[{ value: "meta", label: "Una meta" }, { value: "fondo", label: "Fondo de emergencia" }]} /></FormField>
            {field.value === "meta" && <FormField label="Meta" htmlFor={id("goal_id")} tip={false} error={err("goal_id")}>{combo("goal_id", o.metas, "Elige la meta")}</FormField>}
          </>
        )} />
      )
    case "agenda":
      return (
        <>
          {text("titulo", "Título del recordatorio")}
          <FormField label="¿En cuántos días?" htmlFor={id("dias")} tip={false} error={err("dias")} hint="0 = hoy mismo."><Num id={id("dias")} register={register} name="dias" min={0} max={365} suffix="días" /></FormField>
          <FormField label="Con el monto del disparador" htmlFor={id("usar_monto")} tip={false} orientation="horizontal">
            <Controller control={control} name="usar_monto" render={({ field }) => <Switch id={id("usar_monto")} checked={!!field.value} onCheckedChange={field.onChange} />} />
          </FormField>
        </>
      )
    case "esperar":
      return <FormField label="Esperar" htmlFor={id("dias")} tip={false} error={err("dias")} hint="Después sigue con el siguiente paso."><Num id={id("dias")} register={register} name="dias" min={1} max={60} suffix="días" /></FormField>
    case "ia":
      return <>{text("pregunta", "¿Qué le preguntas a la IA?", true)}{para}{canales}</>
  }
}

/** Panel de propiedades del paso elegido: formulario validado con zod y cambios en vivo en el diagrama. */
export function Properties({ node, options, issues, onChange, onDelete, onDuplicate, readOnly }: {
  node: FlowNode; options: PropsOptions; issues: string[]; onChange: (d: NodeData) => void; onDelete: () => void; onDuplicate: () => void; readOnly?: boolean
}) {
  const c = CATALOG[node.kind]
  const form = useForm<Vals>({
    resolver: zodResolver(NODE_SCHEMAS[node.kind] as never) as unknown as Resolver<Vals>,
    defaultValues: { ...structuredClone(c.defaults), ...structuredClone(node.data) },
    mode: "onChange",
  })
  useEffect(() => {
    form.trigger() // muestra de una vez lo que falta
    return form.subscribe({ formState: { values: true }, callback: ({ values }) => onChange(JSON.parse(JSON.stringify(values)) as NodeData) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const err = (k: string) => (form.formState.errors[k]?.message as string | undefined)
  return (
    <div className="grid content-start gap-4" data-testid="propiedades">
      <div className="flex items-start gap-3">
        <StepIcon kind={node.kind} className="size-11 rounded-2xl" />
        <div className="grid min-w-0 gap-0.5">
          <span className={cn("text-[11px] font-bold tracking-[.08em] uppercase", GROUP_STYLE[c.group].text)}>{GROUPS[c.group].label}</span>
          <h2 className="text-lg leading-tight font-semibold">{c.label}</h2>
          <p className="text-sm text-muted-foreground">{c.desc}</p>
        </div>
      </div>
      {issues.length > 0 && (
        <ul className="grid gap-1 rounded-lg bg-warning-soft p-3 text-sm text-warning" role="alert">
          {issues.map((m, i) => <li key={i}>• {m}</li>)}
        </ul>
      )}
      <fieldset disabled={readOnly} className="min-w-0">
        <FieldGroup className="gap-4">
          <Fields kind={node.kind} control={form.control} register={form.register} setValue={(k, v) => form.setValue(k, v, { shouldValidate: true, shouldDirty: true })} getValues={(k) => form.getValues(k)} err={err} o={options} />
        </FieldGroup>
      </fieldset>
      {!readOnly && (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {c.group !== "trigger" && <Button variant="outline" size="sm" onClick={onDuplicate}><Copy /> Duplicar paso</Button>}
          <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 /> Quitar paso</Button>
        </div>
      )}
    </div>
  )
}
