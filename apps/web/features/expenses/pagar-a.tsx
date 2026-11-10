"use client"

import { useState } from "react"
import { Segmented } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { toast } from "@/components/mirai/toast"
import { useCanEdit } from "@/components/app/app-context"
import { useSave } from "@/hooks/use-book-data"
import { contactOptions, useContacts } from "@/features/catalogs/hooks"
import { ProviderSelect, type Provider } from "@/features/providers/provider-select"

/** A quién se le pagó un gasto: nadie en particular, un negocio o empresa (Proveedores) o una persona (Contactos). */
export type PagarATipo = "nadie" | "negocio" | "persona"

export const pagarATipo = (v: { provider_id?: string | null; contact_id?: string | null }): PagarATipo =>
  v.provider_id ? "negocio" : v.contact_id ? "persona" : "nadie"

const TIPOS = [
  { value: "nadie", label: "No hace falta", icon: "store" },
  { value: "negocio", label: "Negocio o empresa", icon: "building-2" },
  { value: "persona", label: "Una persona", icon: "user-round" },
]
const AYUDA: Record<PagarATipo, string> = {
  nadie: "Tienda de barrio, gasolinera, el bus, el mercado de la esquina… no hace falta decir a quién.",
  negocio: "Una empresa o negocio al que le pagas seguido: Enel, el colegio, el Éxito, tu EPS. Queda en Proveedores.",
  persona: "Alguien en particular: la señora del aseo, el arrendador, un amigo. Queda en Contactos › Personas.",
}

/**
 * "¿A quién le pagaste?" del formulario de gasto (antes "Proveedor"). Separa un negocio o empresa (`provider_id`) de una
 * persona natural (`contact_id`) y deja el caso común sin nadie: en una gasolinera o una tienda de barrio no hace falta.
 */
export function PagarA({ provider, contact, onProvider, onContact, idPrefix = "g" }: {
  provider: string | null; contact: string | null
  onProvider: (id: string | null, p: Provider | null) => void
  onContact: (id: string | null) => void
  idPrefix?: string
}) {
  const [tipo, setTipo] = useState<PagarATipo>(() => pagarATipo({ provider_id: provider, contact_id: contact }))
  const { data: contacts = [] } = useContacts()
  const saveContact = useSave("contacts")
  const can = useCanEdit()
  const personas = contacts.filter((c) => c.tipo !== "empresa")

  const cambiar = (t: string) => {
    const v = t as PagarATipo
    setTipo(v)
    // Solo un destino a la vez: elegir persona quita el proveedor y al revés.
    if (v !== "negocio" && provider) onProvider(null, null)
    if (v !== "persona" && contact) onContact(null)
  }
  const crearPersona = async (nombre: string) => {
    const n = nombre.trim()
    if (!n) return
    const id = crypto.randomUUID()
    try {
      await saveContact.mutateAsync({ id, nombre: n, tipo: "persona" } as never)
      onContact(id)
      toast.success(`Agregamos a ${n} a tus contactos`)
    } catch { /* el aviso lo muestra useSave */ }
  }

  return (
    <div className="grid gap-2">
      <Segmented value={tipo} onChange={cambiar} items={TIPOS} />
      <p className="text-xs text-muted-foreground">{AYUDA[tipo]}</p>
      {tipo === "negocio" && <ProviderSelect id={`${idPrefix}-prov`} value={provider} onChange={onProvider} placeholder="Elige o escribe el negocio" />}
      {tipo === "persona" && (
        <Combobox id={`${idPrefix}-persona`} value={contact} onChange={(v) => onContact(v || null)} options={contactOptions(personas)}
          placeholder="Elige o escribe el nombre" searchPlaceholder="Buscar persona…" emptyText="No está en tus contactos"
          createLabel="Agregar a" onCreate={can ? (t) => void crearPersona(t) : undefined} aria-label="Persona a la que le pagaste" />
      )}
    </div>
  )
}
