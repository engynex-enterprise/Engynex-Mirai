"use client"

import { useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { SubmitButton, useSubmitState } from "@/components/mirai/submit-button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { Combobox, type Option } from "@/components/mirai/combobox"
import { useSave } from "@/hooks/use-book-data"
import { brandFor } from "@/lib/brands"
import { PROVIDER_TIPOS, cleanProvName, findProvider, isProviderTipo, tipoSugerido, type ProviderTipo } from "@/lib/domain"
import type { Row } from "@/lib/supabase/tables"
import { categoryOptions, useCategories, useProviders } from "@/features/catalogs/hooks"
import { ICON_OPTIONS } from "@/features/catalogs/category-dialog"
import { ProviderAvatar } from "./provider-avatar"

export const TIPO_OPTIONS: Option[] = Object.entries(PROVIDER_TIPOS).map(([value, t]) => ({ value, label: t.label, icon: t.icon }))

const schema = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre del proveedor").max(120, "Máximo 120 letras"),
  tipo: z.string(),
  category_id: z.string(),
  referencia: z.string().max(80),
  nit: z.string().regex(/^[\d.\- ]*$/, "Solo números, puntos y guion"),
  telefono: z.string().max(40),
  correo: z.union([z.literal(""), z.email("Escribe un correo válido")]),
  sitio_web: z.string().max(200),
  notas: z.string().max(500),
  icon: z.string(),
  activo: z.boolean(),
})
type Values = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (o: boolean) => void
  provider?: Row<"providers"> | null
  /** Nombre ya escrito (desde el selector). */
  initialName?: string
  initialTipo?: ProviderTipo
  onSaved?: (row: Row<"providers">) => void
}

/** Crear o editar un proveedor (a quién le pagas): nombre, tipo, categoría por defecto y datos de contacto. */
export function ProviderDialog(props: Props) {
  const [formId] = useState(() => `prov-${Math.random().toString(36).slice(2)}`)
  return (
    <ResponsiveDialog open={props.open} onOpenChange={props.onOpenChange} title={props.provider ? "Editar proveedor" : "Nuevo proveedor"}
      description="La empresa o persona a la que le pagas: Enel, la inmobiliaria, Claro, el colegio… Guárdalo una vez y elígelo en tus gastos fijos, suscripciones y gastos."
      footer={<><Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancelar</Button><SubmitButton form={formId} /></>}>
      {props.open && <Body {...props} formId={formId} />}
    </ResponsiveDialog>
  )
}

function Body({ onOpenChange, provider, initialName = "", initialTipo, onSaved, formId }: Props & { formId: string }) {
  const { data: list = [] } = useProviders()
  const { data: cats = [] } = useCategories()
  const save = useSave("providers")
  const [tipoManual, setTipoManual] = useState(!!provider || !!initialTipo)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: provider?.nombre ?? initialName, tipo: provider?.tipo ?? initialTipo ?? (initialName ? tipoSugerido(initialName) : "otro"),
      category_id: provider?.category_id ?? "", referencia: provider?.referencia ?? "", nit: provider?.nit ?? "", telefono: provider?.telefono ?? "",
      correo: provider?.correo ?? "", sitio_web: provider?.sitio_web ?? "", notas: provider?.notas ?? "", icon: provider?.icon ?? "", activo: provider?.activo ?? true,
    },
  })
  const { errors, isSubmitting } = form.formState
  useSubmitState(formId, form)
  const [nombre, tipo, icon] = useWatch({ control: form.control, name: ["nombre", "tipo", "icon"] })

  async function onSubmit(v: Values) {
    const n = cleanProvName(v.nombre)
    const dup = findProvider(list, n)
    if (dup && dup.id !== provider?.id) { form.setError("nombre", { message: `Ya tienes “${dup.nombre}”. Búscalo en la lista.` }); return }
    const row = await save.mutateAsync({
      ...(provider ? { id: provider.id } : {}),
      nombre: n, tipo: isProviderTipo(v.tipo) ? v.tipo : "otro", category_id: v.category_id || null, referencia: v.referencia.trim(), nit: v.nit.trim(),
      telefono: v.telefono.trim(), correo: v.correo.trim(), sitio_web: v.sitio_web.trim(), notas: v.notas.trim(), icon: v.icon || null,
      brand: brandFor(n), activo: v.activo,
    } as never)
    toast.success(provider ? "Proveedor actualizado" : "Proveedor agregado", { description: `“${n}”` })
    onSaved?.(row as Row<"providers">)
    onOpenChange(false)
  }

  return (
    // stopPropagation: el selector vive dentro de otros formularios (gasto fijo, gasto) y en React el "submit" sube
    // a través del portal de la ventana; sin esto, guardar el proveedor también enviaría el formulario de afuera.
    <form id={formId} onSubmit={(e) => { e.stopPropagation(); void form.handleSubmit(onSubmit)(e) }} noValidate aria-busy={isSubmitting}>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Nombre del proveedor" htmlFor="p-nombre" error={errors.nombre?.message} required tip="Como aparece en la factura: Enel, Acueducto de Bogotá, Inmobiliaria El Prado…">
            <div className="flex items-center gap-2">
              <ProviderAvatar p={{ nombre: nombre || "?", tipo, icon }} size={44} />
              <Input id="p-nombre" className="h-11" autoFocus placeholder="Ej. Enel" {...form.register("nombre", {
                onChange: (e) => { if (!tipoManual) form.setValue("tipo", tipoSugerido(e.target.value)) },
              })} />
            </div>
          </FormField>
          <FormField label="Tipo" htmlFor="p-tipo" tip="Sirve para agruparlos y para sugerir la categoría del gasto.">
            <Controller control={form.control} name="tipo" render={({ field }) => (
              <Combobox id="p-tipo" value={field.value} onChange={(v) => { setTipoManual(true); field.onChange(v) }} options={TIPO_OPTIONS} />
            )} />
          </FormField>
          <FormField label="Categoría del gasto" htmlFor="p-cat" tip="Cuando elijas este proveedor en un gasto, Mirai pone esta categoría si aún no tiene una.">
            <Controller control={form.control} name="category_id" render={({ field }) => (
              <Combobox id="p-cat" value={field.value} onChange={field.onChange} placeholder="Según el tipo" options={[{ value: "", label: "Según el tipo", icon: "sparkles" }, ...categoryOptions(cats)]} />
            )} />
          </FormField>
          <FormField label="Número de contrato o de cliente" htmlFor="p-ref" tip="El número que te piden para pagar (lo ves en la factura). Así lo tienes a mano.">
            <Input id="p-ref" className="h-11" placeholder="Ej. 1234567" {...form.register("referencia")} />
          </FormField>
          <FormField label="Teléfono" htmlFor="p-tel"><Input id="p-tel" className="h-11" type="tel" inputMode="tel" {...form.register("telefono")} /></FormField>
          <FormField label="Correo" htmlFor="p-correo" error={errors.correo?.message}><Input id="p-correo" className="h-11" type="email" inputMode="email" {...form.register("correo")} /></FormField>
          <FormField label="Sitio web" htmlFor="p-web" tip="Donde pagas en línea o descargas la factura."><Input id="p-web" className="h-11" inputMode="url" placeholder="Ej. www.enel.com.co" {...form.register("sitio_web")} /></FormField>
          <FormField label="NIT (opcional)" htmlFor="p-nit" error={errors.nit?.message} tip="El número de identificación de la empresa. Aparece en la factura; sirve si necesitas certificados para la renta.">
            <Input id="p-nit" className="h-11" inputMode="numeric" {...form.register("nit")} />
          </FormField>
          <FormField label="Ícono" htmlFor="p-icon" tip="Si el proveedor tiene logo conocido, se muestra solo. Si no, puedes escoger un ícono.">
            <Controller control={form.control} name="icon" render={({ field }) => (
              <Combobox id="p-icon" value={field.value} onChange={field.onChange} options={[{ value: "", label: "El del tipo", icon: PROVIDER_TIPOS[(isProviderTipo(tipo) ? tipo : "otro") as ProviderTipo].icon }, ...ICON_OPTIONS]} />
            )} />
          </FormField>
          {provider && (
            <FormField label="Activo" tip="Si ya no le pagas, desactívalo: deja de salir en el selector pero conservas su historial.">
              <Controller control={form.control} name="activo" render={({ field }) => (
                <label className="flex h-11 items-center gap-3 text-sm"><Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Activo" />{field.value ? "Sí, le sigo pagando" : "No, ya no le pago"}</label>
              )} />
            </FormField>
          )}
        </div>
        <FormField label="Notas" htmlFor="p-notas"><Textarea id="p-notas" rows={2} placeholder="Ej. Se paga en Efecty o con el código QR de la factura" {...form.register("notas")} /></FormField>
        {isSubmitting && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Guardando…</p>}
      </FieldGroup>
    </form>
  )
}
