"use client"

import { Sparkles } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { suggestCategory } from "@/features/ai/api"
import { localCatGuess } from "@/features/ai/local"
import { useState } from "react"
import { toast } from "@/components/mirai/toast"
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

/** Íconos elegibles para categorías y medios (ICON_CHOICES de la v4), con su nombre en español. */
export const ICON_LABELS: Record<string, string> = {
  house: "Casa", zap: "Energía", droplets: "Agua", wifi: "Internet", "shopping-cart": "Mercado", car: "Carro", bus: "Transporte", fuel: "Gasolina",
  "graduation-cap": "Educación", "heart-pulse": "Salud", landmark: "Banco", utensils: "Restaurante", coffee: "Café", bike: "Bicicleta", cookie: "Antojos",
  film: "Cine", tv: "Televisión", shirt: "Ropa", repeat: "Suscripción", dog: "Mascota", gift: "Regalos", plane: "Viajes", "piggy-bank": "Ahorro",
  "trending-up": "Inversión", briefcase: "Trabajo", store: "Tienda", baby: "Bebé", dumbbell: "Gimnasio", smartphone: "Celular", receipt: "Factura",
  banknote: "Efectivo", "credit-card": "Tarjeta", coins: "Monedas", percent: "Intereses", "file-text": "Documento", tag: "Etiqueta", umbrella: "Seguro",
  sprout: "Crecimiento", "circle-ellipsis": "Otros", "paw-print": "Huella", pill: "Medicamentos", scissors: "Belleza", wrench: "Arreglos",
  "gamepad-2": "Juegos", "book-open": "Libros", music: "Música", "arrow-left-right": "Transferencia", wallet: "Billetera",
}
export const ICON_CHOICES = Object.keys(ICON_LABELS)
export const ICON_OPTIONS = ICON_CHOICES.map((i) => ({ value: i, label: ICON_LABELS[i], icon: i }))

/** "Nueva categoría" (mini-modal de la v4). Devuelve el id creado. */
export function CategoryDialog({ open, onOpenChange, initialName = "", onCreated, ctxDesc = "" }: { open: boolean; onOpenChange: (o: boolean) => void; initialName?: string; onCreated?: (id: string) => void; ctxDesc?: string }) {
  const { data: cats = [] } = useCategories()
  const save = useSave("categories")
  const [nombre, setNombre] = useState(initialName)
  const [grupo, setGrupo] = useState("g")
  const [icon, setIcon] = useState("tag")
  const [tope, setTope] = useState(0)
  const [prev, setPrev] = useState(initialName)
  if (prev !== initialName) { setPrev(initialName); setNombre(initialName) }
  const [ai, setAi] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null })
  const suggest = async () => {
    if (!nombre.trim() && !ctxDesc.trim()) return toast("Escribe una idea en el nombre (por ejemplo “comida del perro”) y la IA la completa.")
    setAi({ busy: true, msg: null })
    const r = await suggestCategory(ctxDesc, nombre, ICON_CHOICES)
    const s = r.ok && r.s ? r.s : localCatGuess(ctxDesc, nombre)
    setNombre(s.nombre); setGrupo(s.grupo); setIcon(s.icon); if (s.tope) setTope(s.tope)
    setAi({ busy: false, msg: r.ok && r.s ? r.s.razon || "Sugerencia lista. Puedes ajustarla antes de crearla." : "La IA no está disponible ahora; te dejamos una sugerencia. Ajústala si quieres." })
  }

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
        <div className="grid gap-2 rounded-lg bg-brand-soft p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex flex-1 items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-brand" /> Que la IA la proponga</p>
            <Button type="button" size="sm" variant="soft" disabled={ai.busy} onClick={suggest}>{ai.busy ? <Spinner /> : <Sparkles />}{ai.busy ? "Pensando…" : ai.msg ? "Sugerir otra vez" : "Sugerir"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{ai.msg ?? (ctxDesc ? `Usará “${ctxDesc}” para sugerir nombre, ícono y tipo.` : "Escribe una idea en el nombre y la IA completa el resto.")}</p>
        </div>
        <FormField label="Nombre de la categoría" htmlFor="cat-nombre" required><Input id="cat-nombre" className="h-11" value={nombre} maxLength={40} placeholder="Ej. Mascotas" onChange={(e) => setNombre(e.target.value)} autoFocus /></FormField>
        <FormField label="¿Qué tipo de gasto es?">
          <ChoiceCards value={grupo} onChange={setGrupo} cols={3} items={[
            { value: "n", label: "Necesidad", desc: "Lo indispensable", icon: "house" },
            { value: "g", label: "Gusto", desc: "Lo que podrías evitar", icon: "coffee" },
            { value: "a", label: "Ahorro", desc: "Para tu futuro", icon: "piggy-bank" },
          ]} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Ícono" htmlFor="cat-icon"><Combobox id="cat-icon" value={icon} onChange={setIcon} options={ICON_OPTIONS} /></FormField>
          <FormField label="Tope mensual" htmlFor="cat-tope" hint="Opcional. Te avisamos al acercarte."><MoneyInput id="cat-tope" value={tope} onChange={setTope} /></FormField>
        </div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}
