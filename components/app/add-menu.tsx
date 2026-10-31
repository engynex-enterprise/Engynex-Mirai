"use client"

import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { useIsMobile } from "@/hooks/use-mobile"
import { useShell } from "./shell-store"

/** Menú "Agregar" (tecla N). Cada opción abre el formulario de su sección con ?nuevo=1. */
export const ADD_ITEMS = [
  { iso: "gastos", label: "Gasto", hint: "Algo que acabas de pagar", href: "/gastos?nuevo=1" },
  { iso: "fijos", label: "Gasto fijo", hint: "Arriendo, servicios, colegio", href: "/fijos?nuevo=1" },
  { iso: "ingresos", label: "Ingreso", hint: "Salario u otro ingreso", href: "/ingresos?nuevo=1" },
  { iso: "me-deben", label: "Préstamo que hice", hint: "Alguien te debe", href: "/me-deben?nuevo=1" },
  { iso: "le-debo", label: "Deuda o crédito", hint: "Tú debes", href: "/le-debo?nuevo=1" },
  { iso: "contactos", label: "Contacto", hint: "Persona o empresa", href: "/contactos?nuevo=1" },
  { iso: "inversiones", label: "Inversión", hint: "CDT, fondo, ahorro", href: "/inversiones?nuevo=1" },
  { iso: "metas", label: "Meta de ahorro", hint: "Algo que quieres lograr", href: "/metas?nuevo=1" },
] as const

export function AddMenu() {
  const open = useShell((s) => s.add)
  const setOpen = useShell((s) => s.setAdd)
  const router = useRouter()
  const mobile = useIsMobile()
  const grid = (
    <div className="grid grid-cols-2 gap-2 p-1 sm:grid-cols-4">
      {ADD_ITEMS.map((i) => (
        <button
          key={i.href}
          type="button"
          onClick={() => { setOpen(false); router.push(i.href) }}
          className="flex flex-col items-center gap-2 rounded-lg border bg-card p-4 text-center transition hover:border-brand hover:bg-brand-soft focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <IsoIcon k={i.iso} size={36} />
          <span className="text-sm font-semibold">{i.label}</span>
          <span className="text-xs text-muted-foreground">{i.hint}</span>
        </button>
      ))}
    </div>
  )
  if (mobile)
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>¿Qué quieres agregar?</DrawerTitle><DrawerDescription>Elige y te llevamos al formulario.</DrawerDescription></DrawerHeader>
          <div className="px-4 pb-6">{grid}</div>
        </DrawerContent>
      </Drawer>
    )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>¿Qué quieres agregar?</DialogTitle><DialogDescription>Elige y te llevamos al formulario.</DialogDescription></DialogHeader>
        {grid}
      </DialogContent>
    </Dialog>
  )
}
