"use client"

import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Copy, KeyRound, Landmark, Plus, QrCode, Share2, Trash2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { FormField } from "@/components/mirai/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { soloDigitos } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Un medio para recibir pagos: llave Bre-B, billetera (Nequi, Daviplata) o cuenta de banco. */
export type Cobro = { id: string; medio: string; detalle: string; tipo?: "ahorros" | "corriente"; banco?: string; titular?: string }

type Medio = { v: string; n: string; kind: "llave" | "celular" | "cuenta" }
const MEDIOS: Medio[] = [
  { v: "breb", n: "Llave Bre-B", kind: "llave" },
  { v: "nequi", n: "Nequi", kind: "celular" },
  { v: "daviplata", n: "Daviplata", kind: "celular" },
  { v: "bancolombia", n: "Bancolombia", kind: "cuenta" },
  { v: "davivienda", n: "Davivienda", kind: "cuenta" },
  { v: "bbva", n: "BBVA", kind: "cuenta" },
  { v: "nubank", n: "Nu", kind: "cuenta" },
  { v: "otro", n: "Otro banco", kind: "cuenta" },
]
const medio = (v: string) => MEDIOS.find((m) => m.v === v) ?? MEDIOS[MEDIOS.length - 1]
const nombreDe = (c: Cobro) => (c.medio === "otro" ? c.banco || "Banco" : medio(c.medio).n)
const celular = (s: string) => soloDigitos(s).replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3")

function MedioLogo({ v, size = 40 }: { v: string; size?: number }) {
  if (v === "breb") return <span className="grid shrink-0 place-items-center rounded-[28%] bg-brand-soft text-brand" style={{ width: size, height: size }}><KeyRound className="size-[45%]" /></span>
  if (v === "otro") return <span className="grid shrink-0 place-items-center rounded-[28%] bg-secondary text-muted-foreground" style={{ width: size, height: size }}><Landmark className="size-[45%]" /></span>
  return <BrandLogo k={v} size={size} />
}

/** Texto para compartir por WhatsApp o copiar. */
export function cobroTexto(nombre: string, items: Cobro[]) {
  const lines = items.map((c) => {
    const m = medio(c.medio)
    if (m.kind === "llave") return `• Llave Bre-B: ${c.detalle}`
    if (m.kind === "celular") return `• ${m.n}: ${celular(c.detalle)}`
    return `• ${nombreDe(c)} ${c.tipo === "corriente" ? "corriente" : "ahorros"}: ${c.detalle}${c.titular ? ` (a nombre de ${c.titular})` : ""}`
  })
  return [`Para pagarle a ${nombre}:`, ...lines].join("\n")
}

function AddDialog({ open, onOpenChange, onAdd, titular }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (c: Cobro) => void; titular: string }) {
  const [m, setM] = useState("breb")
  const [detalle, setDetalle] = useState("")
  const [tipo, setTipo] = useState<"ahorros" | "corriente">("ahorros")
  const [banco, setBanco] = useState("")
  const [nom, setNom] = useState(titular)
  const kind = medio(m).kind
  const add = () => {
    const d = detalle.trim()
    if (!d) return toast.error(kind === "llave" ? "Escribe tu llave" : kind === "celular" ? "Escribe el número de celular" : "Escribe el número de cuenta")
    if (kind === "celular" && !/^3\d{9}$/.test(soloDigitos(d))) return toast.error("El celular debe tener 10 dígitos y empezar por 3")
    if (kind === "cuenta" && !/^\d{5,20}$/.test(soloDigitos(d))) return toast.error("El número de cuenta debe tener solo números")
    if (m === "otro" && !banco.trim()) return toast.error("Escribe el nombre del banco")
    onAdd({ id: crypto.randomUUID(), medio: m, detalle: kind === "celular" ? soloDigitos(d) : d, ...(kind === "cuenta" ? { tipo, titular: nom.trim() || undefined } : {}), ...(m === "otro" ? { banco: banco.trim() } : {}) })
    setDetalle(""); setBanco(""); onOpenChange(false)
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Agregar un medio de pago"
      description="Guarda dónde te pueden pagar. Solo tú y tu familia lo ven, y lo compartes cuando quieras."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={add}>Agregar</Button></>}>
      <FieldGroup>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Medio">
          {MEDIOS.map((x) => (
            <button key={x.v} type="button" role="radio" aria-checked={m === x.v} onClick={() => setM(x.v)}
              className={cn("grid justify-items-center gap-1.5 rounded-lg p-2 text-center text-[12px] leading-tight outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring", m === x.v && "bg-brand-soft font-semibold ring-2 ring-brand")}>
              <MedioLogo v={x.v} size={36} />{x.n}
            </button>
          ))}
        </div>
        {m === "otro" && <FormField label="Banco" htmlFor="cb-banco" required tip={false}><Input id="cb-banco" className="h-11" placeholder="Ej. Banco de Bogotá" value={banco} onChange={(e) => setBanco(e.target.value)} /></FormField>}
        <FormField label={kind === "llave" ? "Tu llave" : kind === "celular" ? "Celular" : "Número de cuenta"} htmlFor="cb-det" required
          tip={kind === "llave" ? "La llave que registraste en tu banco para Bre-B: tu celular, tu cédula, tu correo o una llave alfanumérica (empieza por @)." : false}>
          <Input id="cb-det" className="h-11" inputMode={kind === "llave" ? "text" : "numeric"} placeholder={kind === "llave" ? "Ej. @alberto o 3001234567" : kind === "celular" ? "Ej. 300 123 4567" : "Ej. 123-456789-01"} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
        </FormField>
        {kind === "cuenta" && (
          <>
            <FormField label="Tipo de cuenta" tip={false}>
              <ChoiceCards value={tipo} onChange={(v) => setTipo(v as typeof tipo)} items={[{ value: "ahorros", label: "Ahorros", icon: "piggy-bank" }, { value: "corriente", label: "Corriente", icon: "landmark" }]} />
            </FormField>
            <FormField label="A nombre de" htmlFor="cb-tit" tip={false}><Input id="cb-tit" className="h-11" value={nom} onChange={(e) => setNom(e.target.value)} /></FormField>
          </>
        )}
      </FieldGroup>
    </ResponsiveDialog>
  )
}

/** "Recibe pagos": tus llaves Bre-B, Nequi, Daviplata y cuentas para compartir con un toque o con un código QR. */
export function CobroCard({ nombre, items, onChange, readOnly }: { nombre: string; items: Cobro[]; onChange: (items: Cobro[]) => void; readOnly?: boolean }) {
  const [add, setAdd] = useState(false)
  const [qr, setQr] = useState(false)
  const texto = cobroTexto(nombre, items)
  const copy = async (t: string, msg = "Copiado") => { try { await navigator.clipboard.writeText(t); toast.success(msg) } catch { toast.error("No se pudo copiar") } }
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: `Para pagarle a ${nombre}`, text: texto }); return } catch { /* el usuario canceló */ return } }
    copy(texto, "Copiado: pégalo en WhatsApp o en un mensaje")
  }
  return (
    <Card className="gap-4 p-5 shadow-card ring-0" id="cobro">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-semibold">Recibe pagos</h2><p className="text-sm text-muted-foreground">Ten a la mano tus llaves y cuentas para que te paguen un préstamo o te devuelvan plata. Compártelas con un toque.</p></div>
        {!readOnly && <Button variant="outline" onClick={() => setAdd(true)}><Plus /> Agregar</Button>}
      </div>
      {!items.length ? (
        <p className="rounded-lg bg-secondary/60 p-4 text-sm text-muted-foreground">Agrega tu llave Bre-B, tu Nequi o tu cuenta. Cuando alguien te deba, le mandas los datos sin buscarlos.</p>
      ) : (
        <ul className="grid gap-1">
          {items.map((c) => {
            const k = medio(c.medio).kind
            const val = k === "celular" ? celular(c.detalle) : c.detalle
            return (
              <li key={c.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-hover">
                <MedioLogo v={c.medio} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{nombreDe(c)}{k === "cuenta" && <span className="font-normal text-muted-foreground"> · {c.tipo === "corriente" ? "Corriente" : "Ahorros"}</span>}</p>
                  <p className="truncate font-mono text-[14px] tabular-nums" data-money>{val}</p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label={`Copiar ${nombreDe(c)}`} onClick={() => copy(soloDigitos(val) && k !== "llave" ? soloDigitos(val) : val)}><Copy /></Button>
                {!readOnly && <Button size="icon-sm" variant="ghost" className="text-danger" aria-label={`Quitar ${nombreDe(c)}`} onClick={() => onChange(items.filter((x) => x.id !== c.id))}><Trash2 /></Button>}
              </li>
            )
          })}
        </ul>
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={share}><Share2 /> Compartir</Button>
          <Button variant="outline" onClick={() => setQr(true)}><QrCode /> Código QR</Button>
        </div>
      )}
      <AddDialog open={add} onOpenChange={setAdd} titular={nombre} onAdd={(c) => onChange([...items, c])} />
      <ResponsiveDialog open={qr} onOpenChange={setQr} title="Tu código para recibir pagos"
        description="Que la otra persona lo escanee con la cámara del celular: verá tus datos para pagarte.">
        <div className="grid justify-items-center gap-4 pb-2">
          <div className="rounded-2xl bg-white p-4 shadow-card"><QRCodeSVG value={texto} size={220} level="M" marginSize={0} /></div>
          <pre className="w-full rounded-lg bg-secondary/60 p-3 text-[13px] whitespace-pre-wrap" data-money>{texto}</pre>
          <Button variant="outline" onClick={() => copy(texto)}><Copy /> Copiar texto</Button>
        </div>
      </ResponsiveDialog>
    </Card>
  )
}
