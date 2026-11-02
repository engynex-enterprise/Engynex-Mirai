"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { SubmitButton, useSubmitState } from "@/components/mirai/submit-button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { FormSkeleton } from "@/components/skeletons/form-skeleton"
import { useCatalogsReady } from "@/features/catalogs/hooks"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { Combobox } from "@/components/mirai/combobox"
import { Segmented } from "@/components/mirai/choice-cards"
import { AddressFields, emptyAddress, type Address } from "@/components/mirai/address-fields"
import { useSave } from "@/hooks/use-book-data"
import { geoOf } from "@/lib/geo"
import type { Row } from "@/lib/supabase/tables"
import { useContacts, useSettings } from "@/features/catalogs/hooks"
import { findContact } from "@/lib/domain/registros"

export const DOC_TIPOS = [
  { value: "CC", label: "Cédula de ciudadanía (CC)" },
  { value: "CE", label: "Cédula de extranjería (CE)" },
  { value: "NIT", label: "NIT (empresa)" },
  { value: "PA", label: "Pasaporte (PA)" },
  { value: "TI", label: "Tarjeta de identidad (TI)" },
]

const schema = z.object({
  tipo: z.enum(["persona", "empresa"]),
  nombre: z.string().trim().min(1, "Escribe el nombre"),
  doc_tipo: z.string(),
  doc: z.string().regex(/^[\d.\- ]*$/, "Solo números"),
  telefono: z.string(),
  email: z.union([z.literal(""), z.email("Escribe un correo válido")]),
  relacion: z.string(),
  notas: z.string(),
})
type Values = z.infer<typeof schema>

/** Dirección guardada en contacts.direccion (jsonb). */
export const toAddress = (c?: Row<"contacts"> | null): Address => {
  const d = (c?.direccion ?? {}) as Partial<Address>
  return { ...emptyAddress, ...d, ciudad: d.ciudad ?? (geoOf(c?.ciudad)?.v ?? c?.ciudad ?? "") }
}

type Props = { open: boolean; onOpenChange: (o: boolean) => void; contact?: Row<"contacts"> | null; onSaved?: (row: Row<"contacts">) => void }

export function ContactForm(props: Props) {
  const [formId] = useState(() => `contacto-${Math.random().toString(36).slice(2)}`)
  return (
    <ResponsiveDialog open={props.open} onOpenChange={props.onOpenChange} mdesc="contacto" title={props.contact ? "Editar contacto" : "Nuevo contacto"}
      footer={<><Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancelar</Button><SubmitButton form={formId} /></>}>
      <ReadyGate><ContactFormBody {...props} formId={formId} /></ReadyGate>
    </ResponsiveDialog>
  )
}

function ContactFormBody({ onOpenChange, contact, onSaved, formId }: Props & { formId: string }) {
  const save = useSave("contacts")
  const { data: cfg } = useSettings()
  const { data: contacts = [] } = useContacts()
  const [addr, setAddr] = useState<Address>(toAddress(contact))
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo: (contact?.tipo as Values["tipo"]) ?? "persona", nombre: contact?.nombre ?? "", doc_tipo: contact?.doc_tipo ?? "CC", doc: contact?.doc ?? "",
      telefono: contact?.telefono ?? "", email: contact?.email ?? "", relacion: contact?.relacion ?? "", notas: contact?.notas ?? "",
    },
  })
  const { errors, isSubmitting } = form.formState
  useSubmitState(formId, form)
  const relaciones = cfg?.relaciones ?? []

  async function onSubmit(v: Values) {
    // Mismo nombre (sin tildes ni mayúsculas) o mismo documento que otro contacto: no se crea otro igual.
    const dup = findContact(contacts.filter((c) => c.id !== contact?.id), { nombre: v.nombre, doc: v.doc })
    if (dup) { form.setError("nombre", { message: `Ya tienes a “${dup.nombre}” en tus contactos. Edítalo en vez de crear otro.` }); return }
    const city = geoOf(addr.ciudad)
    const row = await save.mutateAsync({
      ...(contact ? { id: contact.id } : {}),
      ...v, nombre: v.nombre.trim(), doc: v.doc.replace(/\D/g, ""),
      direccion: addr, ciudad: city?.c ?? addr.ciudad,
    } as never)
    toast.success("Contacto guardado")
    onSaved?.(row)
    onOpenChange(false)
  }

  return (
    <form id={formId} onSubmit={form.handleSubmit(onSubmit)} noValidate aria-busy={isSubmitting}>
      <FieldGroup>
        <Controller control={form.control} name="tipo" render={({ field }) => (
          <Segmented value={field.value} onChange={(v) => { field.onChange(v); if (v === "empresa") form.setValue("doc_tipo", "NIT") }}
            items={[{ value: "persona", label: "Persona", icon: "user-round" }, { value: "empresa", label: "Empresa", icon: "building-2" }]} />
        )} />
        <FormField label={form.watch("tipo") === "empresa" ? "Razón social" : "Nombre completo"} htmlFor="c-nombre" error={errors.nombre?.message} required tip="Como aparece en su documento. Se usa en los acuerdos de pago.">
          <Input id="c-nombre" className="h-11" autoFocus placeholder="Ej. Andrés Navarro" {...form.register("nombre")} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Tipo de documento" htmlFor="c-doctipo">
            <Controller control={form.control} name="doc_tipo" render={({ field }) => <Combobox id="c-doctipo" value={field.value} onChange={field.onChange} options={DOC_TIPOS} />} />
          </FormField>
          <FormField label="Número de documento" htmlFor="c-doc" error={errors.doc?.message}>
            <Input id="c-doc" className="h-11" inputMode="numeric" {...form.register("doc")} />
          </FormField>
          <FormField label="Celular" htmlFor="c-tel" tip="Para enviarle recordatorios de cobro por WhatsApp.">
            <Input id="c-tel" className="h-11" type="tel" inputMode="tel" placeholder="300 123 4567" {...form.register("telefono")} />
          </FormField>
          <FormField label="Correo" htmlFor="c-email" error={errors.email?.message}>
            <Input id="c-email" className="h-11" type="email" inputMode="email" {...form.register("email")} />
          </FormField>
        </div>
        <AddressFields value={addr} onChange={setAddr} idPrefix="c" />
        <FormField label="Relación" htmlFor="c-rel">
          <Controller control={form.control} name="relacion" render={({ field }) => (
            <Combobox id="c-rel" value={field.value} onChange={field.onChange} options={relaciones.map((r) => ({ value: r, label: r }))} placeholder="Familiar, amigo, cliente…" onCreate={(t) => t && field.onChange(t)} createLabel="Usar" />
          )} />
        </FormField>
        <FormField label="Notas" htmlFor="c-notas">
          <Textarea id="c-notas" rows={3} {...form.register("notas")} />
        </FormField>
        {isSubmitting && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Guardando…</p>}
      </FieldGroup>
    </form>
  )
}

/** Monta el formulario cuando los catálogos ya cargaron (skeleton mientras tanto). */
function ReadyGate({ children }: { children: React.ReactNode }) {
  return useCatalogsReady() ? <>{children}</> : <FormSkeleton />
}
