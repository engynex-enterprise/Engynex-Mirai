"use client"

import { useState } from "react"
import { ImagePlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { Segmented } from "@/components/mirai/choice-cards"
import { FormSkeleton } from "@/components/skeletons/form-skeleton"
import { useSave } from "@/hooks/use-book-data"
import { fmtDate, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { CURRENCY_OPTIONS, methodOptions, useCatalogsReady, useCategories, usePaymentMethods } from "@/features/catalogs/hooks"
import { SUBQ, SubAvatar, toLogo } from "./sub-avatar"

type Props = { open: boolean; onOpenChange: (o: boolean) => void; sub?: Row<"subscriptions"> | null; preset?: { nombre: string; valor: number } | null }

export function SubscriptionForm(props: Props) {
  const ready = useCatalogsReady()
  return (
    <ResponsiveDialog open={props.open} onOpenChange={props.onOpenChange} title={props.sub ? "Editar suscripción" : "Nueva suscripción"}
      description="Streaming, música, apps, nube o gimnasio: todo lo que se cobra solo cada mes o cada año. Te avisamos antes de cada cobro para que decidas si la sigues pagando.">
      {ready ? <Body {...props} /> : <FormSkeleton />}
    </ResponsiveDialog>
  )
}

function Body({ onOpenChange, sub, preset }: Props) {
  const today = todayISO()
  const { data: methods = [] } = usePaymentMethods()
  const { data: cats = [] } = useCategories()
  const save = useSave("subscriptions")
  const plus15 = new Date(new Date(today + "T12:00:00").getTime() + 15 * 864e5).toISOString().slice(0, 10)
  const [nombre, setNombre] = useState(sub?.nombre ?? preset?.nombre ?? "")
  const [valor, setValor] = useState(Number(sub?.valor ?? preset?.valor ?? 0))
  const [currency, setCurrency] = useState(sub?.currency ?? "COP")
  const [ciclo, setCiclo] = useState(sub?.ciclo ?? "mensual")
  const [proximo, setProximo] = useState(sub?.proximo ?? plus15)
  const [medio, setMedio] = useState<string | null>(sub?.payment_method_id ?? methods.find((m) => /cr[eé]dito/i.test(m.nombre))?.id ?? methods[0]?.id ?? null)
  const [comparte, setComparte] = useState(String(sub?.comparte ?? 1))
  const [logo, setLogo] = useState<string | null>(sub?.logo_path ?? null)

  const submit = async () => {
    if (!nombre.trim()) return toast.error("Escribe el nombre del servicio")
    if (!valor) return toast.error("Escribe el valor")
    await save.mutateAsync({
      ...(sub ? { id: sub.id } : {}), nombre: nombre.trim(), valor, currency, ciclo, proximo, payment_method_id: medio, comparte: Number(comparte),
      logo_path: logo, category_id: cats.find((c) => c.nombre === "Suscripciones")?.id ?? null,
    } as never)
    toast.success(`${nombre.trim()} guardada`, { description: `Te avisaremos antes del cobro del ${fmtDate(proximo)}.` })
    onOpenChange(false)
  }

  return (
    <FieldGroup className="pb-2">
      {!sub && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Servicios comunes">
          {SUBQ.map(([n]) => (
            <button key={n} type="button" onClick={() => { setNombre(n); document.getElementById("s-valor")?.focus() }}
              className={cn("flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm hover:bg-hover", nombre === n && "border-brand bg-brand-soft")}>
              <SubAvatar nombre={n} size={24} />{n}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Servicio" htmlFor="s-nombre" required>
          <div className="flex items-center gap-2">
            <SubAvatar nombre={nombre || "?"} logo={logo} size={44} />
            <Input id="s-nombre" className="h-11" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Netflix" />
          </div>
        </FormField>
        <FormField label="Valor" htmlFor="s-valor" required><MoneyInput id="s-valor" value={valor} onChange={setValor} currency={currency} decimals /></FormField>
        <FormField label="Moneda" htmlFor="s-moneda"><Combobox id="s-moneda" value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} /></FormField>
        <FormField label="¿Cada cuánto?"><Segmented value={ciclo} onChange={setCiclo} items={[{ value: "mensual", label: "Mensual" }, { value: "anual", label: "Anual" }]} /></FormField>
        <FormField label="Próximo cobro" htmlFor="s-prox"><DatePicker id="s-prox" value={proximo} onChange={(v) => setProximo(v ?? plus15)} quick="futuro" /></FormField>
        <FormField label="¿Con qué se paga?" htmlFor="s-medio"><Combobox id="s-medio" value={medio} onChange={setMedio} options={methodOptions(methods)} /></FormField>
        <FormField label="¿La compartes?" tip="Si la pagan entre varias personas, contamos solo tu parte en tu presupuesto.">
          <Segmented value={comparte} onChange={setComparte} items={[{ value: "1", label: "No" }, ...[2, 3, 4, 5].map((n) => ({ value: String(n), label: `Entre ${n}` }))]} />
        </FormField>
        <FormField label="Logo (opcional)" tip="Sube la imagen que quieras. Mirai no incluye logos de marcas.">
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 text-sm text-muted-foreground hover:bg-hover">
            <ImagePlus className="size-4" /> {logo ? "Cambiar imagen" : "Subir imagen"}
            <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setLogo(await toLogo(f)) }} />
          </label>
        </FormField>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={submit} disabled={save.isPending}>Guardar</Button>
      </div>
    </FieldGroup>
  )
}
