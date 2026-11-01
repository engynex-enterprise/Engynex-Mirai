"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { Icon } from "@/components/mirai/icon"
import { useShell } from "./shell-store"
import { createBook } from "./actions"
import { useApp } from "./app-context"
import { FREE_LIMITS } from "@/lib/plans"
import { PremiumUpsell } from "@/features/planes/premium"

const TIPOS = [
  { v: "personal", l: "Personal o familiar", icon: "house" },
  { v: "negocio", l: "Negocio o independiente", icon: "store" },
  { v: "otro", l: "Otro (viaje, proyecto…)", icon: "plane" },
] as const

export function NewBookDialog() {
  const open = useShell((s) => s.newBook)
  const setOpen = useShell((s) => s.setNewBook)
  const [nombre, setNombre] = useState("")
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["v"]>("negocio")
  const [pending, start] = useTransition()
  const router = useRouter()
  const qc = useQueryClient()
  const { plan, books, household } = useApp()
  const limite = plan !== "premium" && books.filter((b) => b.household_id === household.id).length >= FREE_LIMITS.libros
  if (limite) return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Nuevo libro</DialogTitle><DialogDescription>El plan gratis incluye {FREE_LIMITS.libros} libro de cuentas. Con Premium llevas aparte tu negocio, tus arriendos o un viaje.</DialogDescription></DialogHeader>
        <PremiumUpsell feature="familia" compact />
      </DialogContent>
    </Dialog>
  )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo libro</DialogTitle>
          <DialogDescription>Un libro separa cuentas: por ejemplo, las del hogar y las de tu negocio. Cada uno tiene sus propios gastos, ingresos y reportes.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="bk-nombre">Nombre del libro</FieldLabel>
            <Input id="bk-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Tienda de Ana" maxLength={40} />
          </Field>
          <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)} className="grid gap-2 sm:grid-cols-3">
            {TIPOS.map((t) => (
              <label key={t.v} className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-center text-sm has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand-soft">
                <RadioGroupItem value={t.v} className="sr-only" />
                <Icon name={t.icon} className="size-6 text-brand" />
                {t.l}
              </label>
            ))}
          </RadioGroup>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            disabled={pending || nombre.trim().length < 2}
            onClick={() =>
              start(async () => {
                try {
                  await createBook(nombre.trim(), tipo, TIPOS.find((t) => t.v === tipo)!.icon)
                  qc.clear()
                  setOpen(false)
                  setNombre("")
                  toast.success("Libro creado", { description: `Ahora estás en “${nombre.trim()}”.` })
                  router.refresh()
                } catch (e) {
                  toast.error("No se pudo crear el libro", { description: (e as Error).message })
                }
              })
            }
          >
            {pending && <Spinner />} Crear libro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
