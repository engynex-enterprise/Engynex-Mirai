"use client"

import { useState } from "react"
import { Sparkles } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Combobox } from "@/components/mirai/combobox"
import { FormField } from "@/components/mirai/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { useSave } from "@/hooks/use-book-data"
import { norm } from "@/lib/domain"
import { identifyEntity } from "@/features/ai/actions"
import { NIT_RE, nitDV } from "@/features/ai/local"
import { useEntities } from "./hooks"

const TIPOS = ["Banco", "Cooperativa", "Fintech", "Billetera", "Fondo", "Otro"].map((t) => ({ value: t, label: t }))

/** "Nuevo banco o entidad" con identificación por IA (nombre, sigla o NIT). */
export function EntityDialog({ open, onOpenChange, initial = "", onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: string; onCreated?: (id: string) => void }) {
  const { data: ents = [] } = useEntities()
  const save = useSave("entities")
  const isNit = NIT_RE.test(initial.trim())
  const [nombre, setNombre] = useState(isNit ? "" : initial)
  const [nit, setNit] = useState(isNit ? initial.replace(/\D/g, "") : "")
  const [tipo, setTipo] = useState("Banco")
  const [q, setQ] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [prev, setPrev] = useState(initial)
  if (prev !== initial) { setPrev(initial); setNombre(NIT_RE.test(initial.trim()) ? "" : initial); setNit(NIT_RE.test(initial.trim()) ? initial.replace(/\D/g, "") : ""); setQ(initial); setHint(null) }

  const identify = async () => {
    if (!q.trim()) return toast("Escribe el nombre, la sigla o el NIT")
    setBusy(true)
    const r = await identifyEntity(q)
    setBusy(false)
    if (!r.ok || !r.s) return setHint("La IA no está disponible ahora. Completa los datos a mano.")
    if (r.s.nombre) setNombre(r.s.nombre)
    if (r.s.nit) setNit(r.s.nit)
    setTipo(r.s.tipo)
    const dup = ents.find((e) => norm(e.nombre) === norm(r.s!.nombre) || (r.s!.nit && e.nit === r.s!.nit))
    setHint(`${[r.s.razon, r.s.nota].filter(Boolean).join(". ")}${r.s.confianza !== "alta" ? " Confirma los datos antes de guardar." : ""}${dup ? ` Ya tienes “${dup.nombre}” en tu lista.` : ""}`)
  }
  const submit = async () => {
    const n = nombre.trim()
    if (!n) return toast.error("Escribe el nombre de la entidad.")
    const ex = ents.find((e) => (nit && e.nit === nit) || norm(e.nombre) === norm(n))
    if (ex) {
      if (!ex.nit && nit) await save.mutateAsync({ id: ex.id, nit } as never)
      toast.success("Entidad seleccionada", { description: `“${ex.nombre}” ya existía; la seleccionamos.` })
      onCreated?.(ex.id); return onOpenChange(false)
    }
    const row = await save.mutateAsync({ nombre: n.slice(0, 60), nit, tipo } as never)
    toast.success("Entidad creada", { description: `“${n}” quedó en tu lista y ya está seleccionada.` })
    onCreated?.(row.id); onOpenChange(false)
  }
  const dv = nit.length >= 8 ? nitDV(nit) : null
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Nuevo banco o entidad" description="Agrega quién te prestó o te vende a crédito: un banco, cooperativa, fintech, almacén o empresa. Quedará disponible en todas tus listas."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={save.isPending}>Crear y usar</Button></>}>
      <FieldGroup>
        <div className="grid gap-2 rounded-lg bg-brand-soft p-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-brand" /> Que la IA la identifique</p>
          <p className="text-xs text-muted-foreground">Escribe el nombre, la sigla o el NIT y completamos el resto.</p>
          <div className="flex gap-2"><Input className="h-10 bg-card" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Nombre, sigla o NIT" /><Button variant="soft" className="h-10" disabled={busy} onClick={identify}>{busy ? <Spinner /> : <Sparkles />}{busy ? "Buscando…" : hint ? "Identificar otra vez" : "Identificar"}</Button></div>
          {hint && <p className="text-sm">{hint}</p>}
        </div>
        <FormField label="Nombre" htmlFor="en-n" required tip={false}><Input id="en-n" className="h-11" maxLength={60} placeholder="Ej. Cooperativa Confiar" value={nombre} onChange={(e) => setNombre(e.target.value)} /></FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="NIT o documento" htmlFor="en-nit" hint={dv !== null ? <>NIT con dígito de verificación: <b>{nit}-{dv}</b>. Verifícalo en el RUT o en el contrato del crédito.</> : undefined}><Input id="en-nit" className="h-11" inputMode="numeric" maxLength={14} placeholder="Ej. 890903938" value={nit} onChange={(e) => setNit(e.target.value.replace(/\D/g, ""))} /></FormField>
          <FormField label="Tipo de entidad" tip={false}><Combobox value={tipo} onChange={setTipo} options={TIPOS} /></FormField>
        </div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}
