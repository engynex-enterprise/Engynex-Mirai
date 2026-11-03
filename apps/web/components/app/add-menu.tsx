"use client"

import { useRouter } from "next/navigation"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { useShell } from "./shell-store"

export type AddItem = { iso: string; label: string; hint: string; href: string; /** Palabras extra para el buscador ⌘K. */ words?: string }

/**
 * Menú "Agregar" (tecla N), por grupos. Cada opción abre el formulario de su sección con ?nuevo=…:
 * `1` = el formulario de alta; un subtipo abre una variante (deudas por tipo, compra o pago de tarjeta, abono a meta,
 * cuenta o bien). Las vistas leen el valor con `useNewParam()`.
 */
export const ADD_GROUPS: { t: string; items: AddItem[] }[] = [
  { t: "Día a día", items: [
    { iso: "gastos", label: "Gasto", hint: "Algo que acabas de pagar", href: "/gastos?nuevo=1", words: "compra pago mercado" },
    { iso: "tarjetas", label: "Compra con tarjeta", hint: "A una o varias cuotas", href: "/tarjetas?nuevo=compra", words: "tarjeta de credito cuotas" },
    { iso: "ingresos", label: "Ingreso extra", hint: "Una venta, un bono, un regalo", href: "/inicio?nuevo=ingreso", words: "me pagaron entrada plata" },
  ] },
  { t: "Lo que se repite", items: [
    { iso: "ingresos", label: "Ingreso", hint: "Salario, honorarios, arriendo", href: "/ingresos?nuevo=1", words: "sueldo nomina quincena" },
    { iso: "fijos", label: "Gasto fijo", hint: "Arriendo, servicios, colegio", href: "/fijos?nuevo=1", words: "recibo mensual cuota" },
    { iso: "suscripciones", label: "Suscripción", hint: "Netflix, Spotify, apps", href: "/suscripciones?nuevo=1", words: "streaming plataforma" },
  ] },
  { t: "Deudas y préstamos", items: [
    { iso: "le-debo", label: "Deuda o crédito", hint: "Banco, fiado, empeño, persona", href: "/le-debo?nuevo=1", words: "prestamo credito debo" },
    { iso: "me-deben", label: "Préstamo que hice", hint: "Alguien te debe", href: "/me-deben?nuevo=1", words: "preste cobrar" },
    { iso: "tarjetas", label: "Tarjeta de crédito", hint: "Su cupo, corte y tasa", href: "/tarjetas?nuevo=1", words: "visa mastercard" },
    { iso: "tarjetas", label: "Pago de tarjeta", hint: "Lo que pagaste este mes", href: "/tarjetas?nuevo=pago", words: "pagar tarjeta minimo total" },
  ] },
  { t: "Ahorro y patrimonio", items: [
    { iso: "metas", label: "Meta de ahorro", hint: "Algo que quieres lograr", href: "/metas?nuevo=1", words: "ahorrar objetivo" },
    { iso: "metas", label: "Abono a una meta", hint: "Lo que guardaste hoy", href: "/metas?nuevo=abono", words: "abonar guardar ahorro" },
    { iso: "inversiones", label: "Inversión", hint: "CDT, fondo, ahorro", href: "/inversiones?nuevo=1", words: "cdt acciones cripto" },
    { iso: "balance", label: "Cuenta o bien", hint: "Banco, efectivo, casa, carro", href: "/balance?nuevo=1", words: "activo cuenta de ahorros nequi patrimonio" },
  ] },
  { t: "Personas y fechas", items: [
    { iso: "contactos", label: "Contacto", hint: "Persona o empresa", href: "/contactos?nuevo=1", words: "persona amigo familiar" },
    { iso: "fijos", label: "Proveedor", hint: "A quién le pagas", href: "/proveedores?nuevo=1", words: "empresa servicio tienda" },
    { iso: "recordatorios", label: "Recordatorio o fecha", hint: "Impuestos, primas, vencimientos", href: "/calendario?nuevo=1", words: "evento calendario fiscal predial vehicular" },
  ] },
]

/** Todas las opciones en una lista (buscador ⌘K). */
export const ADD_ITEMS: AddItem[] = ADD_GROUPS.flatMap((g) => g.items)

export function AddMenu() {
  const open = useShell((s) => s.add)
  const setOpen = useShell((s) => s.setAdd)
  const router = useRouter()
  // Misma ventana que los formularios (Dialog en escritorio, panel inferior en celular, título centrado).
  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen} title="¿Qué quieres agregar?" description="Elige y te llevamos al formulario." wide>
      <div className="grid gap-4 pb-2">
        {ADD_GROUPS.map((g) => (
          <section key={g.t} aria-label={g.t} className="grid gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.t}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {g.items.map((i) => (
                <button
                  key={i.href}
                  type="button"
                  onClick={() => { setOpen(false); router.push(i.href) }}
                  className="press flex flex-col items-center gap-1.5 rounded-lg border bg-card p-3 text-center transition hover:border-brand hover:bg-brand-soft focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <IsoIcon k={i.iso} size={32} />
                  <span className="text-sm font-semibold">{i.label}</span>
                  <span className="text-xs text-muted-foreground">{i.hint}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </ResponsiveDialog>
  )
}
