"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldGroup } from "@/components/ui/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { MoneyInput } from "@/components/mirai/money-input"
import { useSave } from "@/hooks/use-book-data"
import { useCategories } from "./hooks"

/** Íconos elegibles para categorías y medios (ICON_CHOICES de la v4). */
export const ICON_CHOICES = ["house", "zap", "droplets", "wifi", "shopping-cart", "car", "bus", "fuel", "graduation-cap", "heart-pulse", "landmark", "utensils", "coffee", "bike", "cookie", "film", "tv", "shirt", "repeat", "dog", "gift", "plane", "piggy-bank", "trending-up", "briefcase", "store", "baby", "dumbbell", "smartphone", "receipt", "banknote", "credit-card", "coins", "percent", "file-text", "tag", "umbrella", "sprout", "circle-ellipsis", "paw-print", "pill", "scissors", "wrench", "gamepad-2", "book-open", "music"]

/** "Nueva categoría" (mini-modal de la v4). Devuelve el id creado. */
export function CategoryDialog({ open, onOpenChange, initialName = "", onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; initialName?: string; onCreated?: (id: string) => void }) {
  const { data: cats = [] } = useCategories()
  const save = useSave("categories")
  const [nombre, setNombre] = useState(initialName)
  const [grupo, setGrupo] = useState("g")
  const [icon, setIcon] = useState("tag")
  const [tope, setTope] = useState(0)
  const [prev, setPrev] = useState(initialName)
  if (prev !== initialName) { setPrev(initialName); setNombre(initialName) }

  const submit = async () => {
    const n = nombre.trim()
    if (!n) return toast.error("Escribe el nombre de la categoría")
    if (cats.some((c) => c.nombre.toLowerCase() === n.toLowerCase())) return toast.error("Ya tienes una categoría con ese nombre")
    const row = await save.mutateAsync({ nombre: n.slice(0, 40), grupo, icon, tope, sort: cats.length + 1 } as never)
    toast.success("Categoría creada", { description: `“${n}” ya aparece en tus listas, presupuesto y reportes.` })
    onCreated?.(row.id)
    onOpenChange(false)
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Nueva categoría"
      description="Crea un grupo para clasificar tus gastos. Aparecerá en tus listas, presupuesto y reportes."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={save.isPending}>Crear categoría</Button></>}>
      <FieldGroup>
        <FormField label="Nombre de la categoría" required><Input className="h-11" value={nombre} maxLength={40} placeholder="Ej. Mascotas" onChange={(e) => setNombre(e.target.value)} autoFocus /></FormField>
        <FormField label="¿Qué tipo de gasto es?">
          <ChoiceCards value={grupo} onChange={setGrupo} cols={3} items={[
            { value: "n", label: "Necesidad", desc: "Lo indispensable", icon: "house" },
            { value: "g", label: "Gusto", desc: "Lo que podrías evitar", icon: "coffee" },
            { value: "a", label: "Ahorro", desc: "Para tu futuro", icon: "piggy-bank" },
          ]} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Ícono"><Combobox value={icon} onChange={setIcon} options={ICON_CHOICES.map((i) => ({ value: i, label: i.replace(/-/g, " "), icon: i }))} /></FormField>
          <FormField label="Tope mensual" hint="Opcional. Te avisamos al acercarte."><MoneyInput value={tope} onChange={setTope} /></FormField>
        </div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}
