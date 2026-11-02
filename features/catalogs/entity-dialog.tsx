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
import { CASA_EMPENO, ENTITY_TIPOS, findEntity } from "@/lib/domain"
import { identifyEntity } from "@/features/ai/actions"
import { NIT_RE, nitDV } from "@/features/ai/local"
import type { Row } from "@/lib/supabase/tables"
import { useEntities } from "./hooks"

const TIPOS = ENTITY_TIPOS.map((t) => ({ value: t, label: t }))

/**
 * "Nuevo banco o entidad" con identificación por IA (nombre, sigla o NIT). Si ya existe una con el mismo nombre
 * (sin tildes, mayúsculas ni puntos) o el mismo NIT, la usa en vez de crear otra.
 * `initialTipo`: tipo con el que arranca (p. ej. "Casa de empeño" desde un empeño). Con `entity` edita esa entidad.
 */
export function EntityDialog({ open, onOpenChange, initial = "", initialTipo, entity, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; initial?: string; initialTipo?: string; entity?: Row<"entities"> | null; onCreated?: (id: string) => void
}) {
  const { data: ents = [] } = useEntities()
  const save = useSave("entities")
  const tipo0 = entity?.tipo ?? initialTipo ?? "Banco"
  const seed = (txt: string) => NIT_RE.test(txt.trim())
  const [nombre, setNombre] = useState(entity ? entity.nombre : seed(initial) ? "" : initial)
  const [nit, setNit] = useState(entity ? entity.nit : seed(initial) ? initial.replace(/\D/g, "") : "")
  const [tipo, setTipo] = useState(tipo0)
  const [q, setQ] = useState(entity?.nombre ?? initial)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const key = `${entity?.id ?? ""}|${initial}|${tipo0}`
  const [prev, setPrev] = useState(key)
  if (prev !== key) {
    setPrev(key); setNombre(entity ? entity.nombre : seed(initial) ? "" : initial); setNit(entity ? entity.nit : seed(initial) ? initial.replace(/\D/g, "") : "")
    setTipo(tipo0); setQ(entity?.nombre ?? initial); setHint(null)
  }
  const casa = tipo0 === CASA_EMPENO
  const otras = entity ? ents.filter((e) => e.id !== entity.id) : ents

  const identify = async () => {
    if (!q.trim()) return toast("Escribe el nombre, la sigla o el NIT")
    setBusy(true)
    const r = await identifyEntity(q)
    setBusy(false)
    if (!r.ok || !r.s) return setHint("La IA no está disponible ahora. Completa los datos a mano.")
    if (r.s.nombre) setNombre(r.s.nombre)
    if (r.s.nit) setNit(r.s.nit)
    // La IA no conoce las casas de empeño: si no reconoce el tipo, se conserva el escogido.
    if (!(casa && r.s.tipo === "Otro")) setTipo(r.s.tipo)
    const dup = findEntity(otras, { nombre: r.s.nombre, nit: r.s.nit })
    setHint(`${[r.s.razon, r.s.nota].filter(Boolean).join(". ")}${r.s.confianza !== "alta" ? " Confirma los datos antes de guardar." : ""}${dup ? ` Ya tienes “${dup.nombre}” en tu lista.` : ""}`)
  }
  const submit = async () => {
    const n = nombre.trim()
    if (!n) return toast.error("Escribe el nombre de la entidad.")
    const ex = findEntity(otras, { nombre: n, nit })
    if (entity) {
      if (ex) return toast.error(`Ya tienes “${ex.nombre}”`, { description: "Usa otro nombre o NIT, o elimina la repetida." })
      await save.mutateAsync({ id: entity.id, nombre: n.slice(0, 60), nit, tipo } as never)
      toast.success("Entidad actualizada", { description: `“${n}”` })
      onCreated?.(entity.id); return onOpenChange(false)
    }
    if (ex) {
      if (!ex.nit && nit) await save.mutateAsync({ id: ex.id, nit } as never)
      toast(`Ya tenías “${ex.nombre}”: la usamos`, { description: "No creamos otra igual. Está en Contactos › Bancos y entidades." })
      onCreated?.(ex.id); return onOpenChange(false)
    }
    const row = await save.mutateAsync({ nombre: n.slice(0, 60), nit, tipo } as never)
    toast.success(casa ? "Casa de empeño creada" : "Entidad creada", { description: `“${n}” quedó en Contactos › Bancos y entidades${onCreated ? " y ya está seleccionada" : ""}.` })
    onCreated?.(row.id); onOpenChange(false)
  }
  const dv = nit.length >= 8 ? nitDV(nit) : null
  const ya = nombre.trim() || nit ? findEntity(otras, { nombre, nit }) : undefined
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={entity ? "Editar entidad" : casa ? "Nueva casa de empeño" : "Nuevo banco o entidad"}
      description={entity ? "Cambia el nombre, el NIT o el tipo. Las deudas, tarjetas e inversiones enlazadas se actualizan solas."
        : casa ? "La casa de empeño o compraventa donde dejaste el objeto. Queda en Contactos › Bancos y entidades: la próxima vez solo la escoges."
        : "Agrega quién te prestó o te vende a crédito: un banco, cooperativa, fintech o empresa. Queda en Contactos › Bancos y entidades y en todas tus listas."}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={submit} disabled={save.isPending}>{entity ? "Guardar cambios" : ya ? "Usar la que ya tienes" : onCreated ? "Crear y usar" : "Crear"}</Button></>}>
      <FieldGroup>
        {!entity && (
          <div className="grid gap-2 rounded-lg bg-brand-soft p-3">
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-brand" /> Que la IA la identifique</p>
            <p className="text-xs text-muted-foreground">Escribe el nombre, la sigla o el NIT y completamos el resto.</p>
            <div className="flex gap-2"><Input className="h-10 bg-card" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Nombre, sigla o NIT" /><Button variant="soft" className="h-10" disabled={busy} onClick={identify}>{busy ? <Spinner /> : <Sparkles />}{busy ? "Buscando…" : hint ? "Identificar otra vez" : "Identificar"}</Button></div>
            {hint && <p className="text-sm">{hint}</p>}
          </div>
        )}
        <FormField label="Nombre" htmlFor="en-n" required tip={false}
          hint={ya ? (entity ? <>Ya tienes otra llamada <b>“{ya.nombre}”</b>.</> : <>Ya tienes <b>“{ya.nombre}”</b>: al guardar la usamos en vez de crear otra.</>) : undefined}>
          <Input id="en-n" className="h-11" maxLength={60} placeholder={casa ? "Ej. Compraventa La 14" : "Ej. Cooperativa Confiar"} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="NIT o documento" htmlFor="en-nit" hint={dv !== null ? <>NIT con dígito de verificación: <b>{nit}-{dv}</b>. Verifícalo en el RUT o en el contrato del crédito.</> : undefined}><Input id="en-nit" className="h-11" inputMode="numeric" maxLength={14} placeholder="Ej. 890903938" value={nit} onChange={(e) => setNit(e.target.value.replace(/\D/g, ""))} /></FormField>
          <FormField label="Tipo de entidad" htmlFor="en-tipo" tip={false}><Combobox id="en-tipo" value={tipo} onChange={setTipo} options={TIPOS} /></FormField>
        </div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}
