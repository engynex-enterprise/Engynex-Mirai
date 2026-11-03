"use client"

import { useState } from "react"
import { Bell, Pencil, Plus, Printer, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { Notice } from "@/components/mirai/notice"
import { Kpi } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { IsoIcon } from "@/components/mirai/iso-icon"

const SW = [
  ["Marca", [["Navy", "--navy-tone", "var(--navy-tone)"], ["Lima", "--lime", "#9EDB4E"], ["Verde bosque", "--forest", "#3F7A1E"], ["Primario (fondo)", "--primary", "var(--primary)"], ["Primario (texto)", "--primary-foreground", "var(--primary-foreground)"]]],
  ["Superficies y texto", [["Fondo app", "--background", "var(--background)"], ["Tarjeta", "--card", "var(--card)"], ["Menú lateral", "--sidebar", "var(--sidebar)"], ["Ítem activo", "--sidebar-accent", "var(--sidebar-accent)"], ["Hover", "--hover", "var(--hover)"], ["Campo", "--field", "var(--field)"], ["Texto", "--foreground", "var(--foreground)"], ["Texto suave", "--muted-foreground", "var(--muted-foreground)"], ["Borde", "--input", "var(--input)"], ["Divisor", "--border", "var(--border)"]]],
  ["Estados", [["Éxito / acento", "--success", "var(--success)"], ["Éxito suave", "--success-soft", "var(--success-soft)"], ["Enlace / acento texto", "--link", "var(--link)"], ["Error", "--danger", "var(--danger)"], ["Error suave", "--danger-soft", "var(--danger-soft)"], ["Alerta", "--warning", "var(--warning)"], ["Alerta suave", "--warning-soft", "var(--warning-soft)"], ["Info", "--info", "var(--info)"], ["Info suave", "--info-soft", "var(--info-soft)"]]],
] as const

/** Lámina del sistema de diseño (referencia interna, no aparece en el menú). */
export default function SistemaDiseno() {
  const [v, setV] = useState(1250000)
  const [f, setF] = useState<string | null>("2026-10-31")
  const [frec, setFrec] = useState("mensual")
  const [chip, setChip] = useState("todas")
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <IsoIcon k="mirai" size={48} />
        <div><h1 className="font-heading text-[28px] font-semibold">Mirai · Sistema de diseño</h1><p className="text-muted-foreground">Microsoft 365 / Fluent + shadcn · paleta Engynex</p></div>
      </div>
      {SW.map(([t, items]) => (
        <Card key={t} className="gap-4 p-6 shadow-card ring-0">
          <h2 className="text-lg font-semibold">{t}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {items.map(([n, tok, c]) => (
              <div key={n} className="grid gap-1.5">
                <div className="h-16 rounded-lg border" style={{ background: c }} />
                <b className="text-sm">{n}</b><span className="text-xs text-muted-foreground">{tok}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="gap-4 p-6 shadow-card ring-0">
          <h2 className="text-lg font-semibold">Botones</h2>
          <div className="flex flex-wrap gap-2">
            <Button><Plus /> Primario</Button><Button variant="outline"><Printer /> Secundario</Button><Button variant="soft"><Bell /> Suave</Button>
            <Button variant="ghost">Fantasma</Button><Button variant="destructive" className="border"><Trash2 /> Peligro</Button>
            <Button variant="outline" size="sm">Pequeño</Button><Button variant="outline" size="icon" aria-label="Editar"><Pencil /></Button>
          </div>
          <h2 className="text-lg font-semibold">Chips y pills</h2>
          <Segmented value={chip} onChange={setChip} items={[{ value: "todas", label: "Todas", icon: "list" }, { value: "laboral", label: "Laboral", icon: "briefcase" }]} />
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="pagado" check>Pagado</StatusPill><StatusPill tone="porVencer">Por vencer</StatusPill><StatusPill tone="vencido">Vencido</StatusPill><StatusPill tone="estimado">Estimado</StatusPill><StatusPill tone="gray">Sin dato</StatusPill>
          </div>
        </Card>
        <Card className="gap-4 p-6 shadow-card ring-0">
          <h2 className="text-lg font-semibold">Formulario</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Nombre" tip="Cómo quieres llamar este registro."><Input className="h-11" defaultValue="Apartamento Cedritos" /></FormField>
            <FormField label="Valor" tip="El monto en pesos."><MoneyInput value={v} onChange={setV} /></FormField>
            <FormField label="Frecuencia" tip="Cada cuánto se repite."><Combobox value={frec} onChange={setFrec} options={[{ value: "mensual", label: "Mensual", icon: "calendar" }, { value: "quincenal", label: "Quincenal", icon: "calendar" }]} /></FormField>
            <FormField label="Fecha" tip="Cuándo ocurre."><DatePicker value={f} onChange={setF} /></FormField>
          </div>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi icon="wallet" tone="income" label="Te queda esta quincena" value={<Money value={5929968} />} valueClassName="text-success" sub="Entra $10,2 M · sale $4,2 M" />
        <Kpi icon="receipt" tone="expense" label="Vas a pagar" value={<Money value={1323619} />} valueClassName="text-danger" sub="Cuotas del mes" />
        <Kpi icon="calculator" tone="income" label="Impuesto estimado" value={<Money value={4487689} />} sub="Borrador de renta" />
      </div>
      <Notice tone="info" title="Alerta informativa">Texto explicativo con un <b>dato</b> importante.</Notice>
      <Notice tone="warn" title="Advertencia">Algo que conviene revisar.</Notice>
    </div>
  )
}
