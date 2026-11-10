"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Plus, RotateCcw } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { ToneIcon, toneFor } from "@/components/mirai/tone-icon"
import { IconButton } from "@/components/mirai/tip"
import { StatusPill } from "@/components/mirai/status-pill"
import { toast } from "@/components/mirai/toast"
import { useCanEdit } from "@/components/app/app-context"
import { useList, useSave } from "@/hooks/use-book-data"
import { useSettings } from "@/features/catalogs/hooks"
import { RELACIONES_SUGERIDAS, contactosConRelacion, moverRelacion, norm, usoRelaciones } from "@/lib/domain"
import { SettingSection, SettingStack } from "../ui"
import { useBookSettingsSave } from "../prefs"
import { AddRow, TextBlur } from "./catalog-ui"

/** Las que trae Mirai al crear un libro (default de book_settings.relaciones). */
const DE_MIRAI = ["Familiar", "Amigo", "Compañero de trabajo", "Cliente", "Vecino", "Proveedor", "Otro"]
const MAX = 40
const ICONO: Record<string, string> = {
  familiar: "heart-handshake", amigo: "smile", "companero de trabajo": "briefcase", cliente: "handshake", vecino: "house", proveedor: "store", otro: "user-round",
  mama: "heart", papa: "heart", pareja: "heart", jefe: "briefcase", socio: "handshake", arrendatario: "key-round", arrendador: "key-round",
}
const iconoDe = (r: string) => ICONO[norm(r).replace(/\(a\)$/, "").trim()] ?? (/herman|hij|prim|ti[oa]|abuel/.test(norm(r)) ? "heart-handshake" : "user-round")
const n2 = (n: number) => `${n} ${n === 1 ? "contacto" : "contactos"}`

type Borrar = { rel: string; n: number }

export function Relaciones() {
  const { data: cfg } = useSettings()
  const { data: contacts, isPending } = useList("contacts")
  const save = useBookSettingsSave()
  const saveCt = useSave("contacts")
  const can = useCanEdit()
  const [borrar, setBorrar] = useState<Borrar | null>(null)
  const [destino, setDestino] = useState<string>("")
  const [modo, setModo] = useState<"dejar" | "pasar" | "quitar">("dejar")
  const rels = useMemo(() => cfg?.relaciones ?? [], [cfg?.relaciones])
  const uso = useMemo(() => usoRelaciones(contacts ?? [], rels), [contacts, rels])
  if (!cfg || isPending) return <Skeleton className="h-80 rounded-lg" />

  const lleno = rels.length >= MAX
  const has = (r: string) => rels.some((x) => norm(x) === norm(r))
  const sugeridas = RELACIONES_SUGERIDAS.filter((r) => !has(r))
  const faltanMirai = DE_MIRAI.filter((r) => !has(r))
  const conRel = [...uso.porRel.values()].reduce((a, b) => a + b, 0)
  const agregar = (r: string) => save.mutateAsync({ relaciones: [...rels, r] })

  /** Cambia la relación escrita en los contactos (renombrar, unir o quitar) con Deshacer. */
  async function cambiarContactos(de: string, a: string, msg: string) {
    const lista = contactosConRelacion(contacts ?? [], de)
    const hechos: { id: string; antes: string | null }[] = []
    for (const c of lista) { await saveCt.mutateAsync({ id: c.id, relacion: a } as never); hechos.push({ id: c.id, antes: c.relacion ?? null }) }
    if (hechos.length) toast.success(msg, { description: n2(hechos.length) + " actualizados.", action: { label: "Deshacer", onClick: () => { for (const h of hechos) saveCt.mutate({ id: h.id, relacion: h.antes ?? "" } as never) } } })
  }

  async function renombrar(i: number, nuevo: string) {
    const viejo = rels[i]
    const otra = rels.findIndex((x, k) => k !== i && norm(x) === norm(nuevo))
    // Si el nombre nuevo ya existe, se unen: la lista queda con una sola y los contactos pasan a esa.
    const lista = otra >= 0 ? rels.filter((_, k) => k !== i) : rels.map((x, k) => (k === i ? nuevo : x))
    await save.mutateAsync({ relaciones: lista })
    await cambiarContactos(viejo, otra >= 0 ? rels[otra] : nuevo, otra >= 0 ? `“${viejo}” quedó unida a “${rels[otra]}”` : `Ahora se llama “${nuevo}”`)
  }

  async function confirmarBorrar() {
    if (!borrar) return
    const { rel } = borrar
    setBorrar(null)
    await save.mutateAsync({ relaciones: rels.filter((x) => x !== rel) })
    if (modo === "pasar" && destino) await cambiarContactos(rel, destino, `Contactos pasados a “${destino}”`)
    if (modo === "quitar") await cambiarContactos(rel, "", "Relación quitada de los contactos")
  }

  return (
    <SettingStack>
      <SettingSection icon="users" title="Relaciones" desc="Cómo conoces a tus contactos. Aparecen al crear un contacto o un préstamo, en este orden.">
        <ul className="grid grid-cols-3 gap-2 pb-4" aria-label="Resumen">
          {[["Relaciones", rels.length, `de ${MAX}`], ["Contactos con relación", conRel, ""], ["Sin relación", uso.sin, ""]].map(([t, v, s]) => (
            <li key={t as string} className="grid gap-0.5 rounded-lg bg-secondary/60 p-3">
              <span className="text-xs font-semibold text-muted-foreground">{t}</span>
              <span className="text-xl font-bold">{v}<span className="ml-1 text-xs font-medium text-muted-foreground">{s}</span></span>
            </li>
          ))}
        </ul>
        <AddRow placeholder={lleno ? `Llegaste al máximo de ${MAX}` : "Nueva relación (ej. Primo)"} disabled={!can || lleno} taken={has} onAdd={agregar} />

        {rels.length === 0 ? (
          <p className="pt-4 text-sm text-muted-foreground">No tienes relaciones. Agrega una o usa las sugeridas de abajo.</p>
        ) : (
          <ul className="grid pt-2" aria-label="Lista de relaciones">
            {rels.map((r, i) => {
              const n = uso.porRel.get(r) ?? 0
              return (
                <li key={r} className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 border-b py-2 last:border-0 sm:grid-cols-[2rem_1fr_9rem_auto]">
                  <ToneIcon icon={iconoDe(r)} tone={toneFor(r)} size="sm" />
                  <TextBlur label={`Nombre de ${r}`} value={r} disabled={!can} onSave={(v) => void renombrar(i, v)} />
                  <div className="col-start-2 row-start-2 sm:col-start-auto sm:row-start-auto">
                    {n ? <Link href={`/personas?q=${encodeURIComponent(r)}`} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"><StatusPill tone="info">{n2(n)}</StatusPill></Link>
                      : <StatusPill tone="gray">Sin usar</StatusPill>}
                  </div>
                  <div className="col-start-3 row-span-2 flex items-center sm:row-span-1">
                    <IconButton icon="chevron-up" label={`Subir ${r}`} disabled={!can || i === 0} onClick={() => save.mutate({ relaciones: moverRelacion(rels, i, -1) })} />
                    <IconButton icon="chevron-down" label={`Bajar ${r}`} disabled={!can || i === rels.length - 1} onClick={() => save.mutate({ relaciones: moverRelacion(rels, i, 1) })} />
                    <IconButton icon="trash-2" destructive label={`Quitar ${r}`} disabled={!can}
                      onClick={() => (n ? (setModo("dejar"), setDestino(rels.find((x) => x !== r) ?? ""), setBorrar({ rel: r, n })) : save.mutate({ relaciones: rels.filter((x) => x !== r) }))} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="pt-3 text-xs text-muted-foreground">Si cambias un nombre, también cambia en tus contactos. Si escribes el nombre de otra que ya existe, se unen.</p>
      </SettingSection>

      {uso.fuera.length > 0 && (
        <SettingSection icon="users" title="Usadas en contactos, pero no están en la lista" desc="Las escribiste directo en un contacto. Agrégalas para elegirlas rápido la próxima vez.">
          <ul className="flex flex-wrap gap-2" aria-label="Relaciones fuera de la lista">
            {uso.fuera.map((f) => (
              <li key={f.nombre}>
                <Button variant="outline" size="sm" disabled={!can || lleno} onClick={() => void agregar(f.nombre)}><Plus /> {f.nombre} <span className="text-muted-foreground">· {n2(f.n)}</span></Button>
              </li>
            ))}
          </ul>
        </SettingSection>
      )}

      {(sugeridas.length > 0 || faltanMirai.length > 0) && (
        <SettingSection icon="sparkles" title="Ideas para agregar" desc="Un toque y quedan en la lista.">
          <ul className="flex flex-wrap gap-2" aria-label="Relaciones sugeridas">
            {sugeridas.map((r) => (
              <li key={r}><Button variant="secondary" size="sm" disabled={!can || lleno} onClick={() => void agregar(r)}><Plus /> {r}</Button></li>
            ))}
          </ul>
          {faltanMirai.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 mt-4">
              <p className="text-sm text-muted-foreground">Faltan {faltanMirai.length} de las que trae Mirai: {faltanMirai.join(", ")}.</p>
              <Button variant="ghost" size="sm" disabled={!can || rels.length + faltanMirai.length > MAX} onClick={() => save.mutate({ relaciones: [...rels, ...faltanMirai] })}><RotateCcw /> Volver a agregarlas</Button>
            </div>
          )}
        </SettingSection>
      )}

      <AlertDialog open={!!borrar} onOpenChange={(o) => !o && setBorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar “{borrar?.rel}”?</AlertDialogTitle>
            <AlertDialogDescription>{borrar ? `${n2(borrar.n)} la ${borrar.n === 1 ? "tiene" : "tienen"}. ¿Qué hacemos con ${borrar.n === 1 ? "él" : "ellos"}?` : null}</AlertDialogDescription>
          </AlertDialogHeader>
          <ChoiceCards cols={2} value={modo} onChange={(v) => setModo(v as typeof modo)} items={[
            { value: "dejar", label: "Dejarlos como están", desc: "Solo sale de la lista.", icon: "check" },
            { value: "pasar", label: "Pasarlos a otra", desc: "Elige cuál abajo.", icon: "arrow-left-right" },
            { value: "quitar", label: "Quitarles la relación", desc: "Quedan sin relación.", icon: "eraser" },
          ]} />
          {modo === "pasar" && <Combobox value={destino} onChange={setDestino} aria-label="Pasarlos a" options={rels.filter((x) => x !== borrar?.rel).map((x) => ({ value: x, label: x, icon: iconoDe(x) }))} />}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={modo === "pasar" && !destino} onClick={() => void confirmarBorrar()}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingStack>
  )
}

