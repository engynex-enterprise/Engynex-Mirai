"use client"

import Link from "next/link"
import { useState } from "react"
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import { Copy, HandCoins, Plus, Store } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/mirai/page-header"
import { EmptyState } from "@/components/mirai/empty-state"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { IconAction } from "@/components/mirai/list-row"
import { DataTable } from "@/components/mirai/data-table"
import { initials } from "@/components/app/app-sidebar"
import { useCanEdit } from "@/components/app/app-context"
import { useList, useSoftDelete } from "@/hooks/use-book-data"
import { useIdParam, useNewParam } from "@/hooks/use-new-param"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { ENTITY_TIPOS, entityIcon } from "@/lib/domain"
import { useEntities } from "@/features/catalogs/hooks"
import { EntityDialog } from "@/features/catalogs/entity-dialog"
import { ContactForm, DOC_TIPOS, toAddress } from "./contact-form"

/** Degradado del avatar según el nombre (av() de la v4: c0..c4). */
const AV = ["from-navy to-forest", "from-forest to-lime", "from-[#C2571A] to-[#F7B928]", "from-navy to-[#5A6C9E]", "from-[#2C3E6B] to-forest"]
export const avatarTone = (n: string) => AV[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length]

function CopyRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {value ? (
        <button type="button" className="flex min-w-0 items-center gap-1.5 truncate font-medium hover:text-link" title={`Copiar ${label.toLowerCase()}`}
          onClick={() => navigator.clipboard.writeText(value).then(() => toast("Copiado"), () => toast(value))}>
          <span className="truncate">{value}</span><Copy className="size-3.5 shrink-0" />
        </button>
      ) : <span className="text-muted-foreground/70">Sin registrar</span>}
    </div>
  )
}

const TABS = ["personas", "entidades"] as const
type Tab = (typeof TABS)[number]

/** Contactos en dos pestañas: Personas (contactos) y Bancos y entidades (?tab=entidades). */
export function ContactsView() {
  const canEdit = useCanEdit()
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("personas").withOptions({ history: "replace" }))
  const [nuevo, setNuevo] = useNewParam()
  const [nuevaEnt, setNuevaEnt] = useState(false)
  const { data: contacts } = useList("contacts", { order: { column: "nombre" } })
  const { data: entities } = useEntities()
  const n = (x: unknown[] | undefined) => (x ? <span className="rounded-full bg-secondary px-1.5 text-xs tabular-nums">{x.length}</span> : null)
  return (
    <div className="grid gap-6">
      <PageHeader id="contactos" description="Las personas, bancos y entidades con las que tienes deudas o préstamos. Guárdalos una vez y escógelos cada vez que registres uno."
        actions={canEdit && (tab === "entidades"
          ? <Button onClick={() => setNuevaEnt(true)}><Plus /> Nueva entidad</Button>
          : <Button onClick={() => setNuevo(true)}><Plus /> Nuevo contacto</Button>)} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-5">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="personas">Personas {n(contacts)}</TabsTrigger>
          <TabsTrigger value="entidades">Bancos y entidades {n(entities)}</TabsTrigger>
        </TabsList>
        <TabsContent value="personas"><Personas nuevo={nuevo} setNuevo={setNuevo} /></TabsContent>
        <TabsContent value="entidades"><Entidades nueva={nuevaEnt} setNueva={setNuevaEnt} /></TabsContent>
      </Tabs>
    </div>
  )
}

function Personas({ nuevo, setNuevo }: { nuevo: boolean; setNuevo: (o: boolean) => void }) {
  // ?q= abre la lista ya filtrada (p. ej. desde Ajustes › Relaciones: los contactos de una relación).
  const [q0] = useQueryState("q", parseAsString.withDefault(""))
  const canEdit = useCanEdit()
  const [id, setId] = useIdParam()
  const [editing, setEditing] = useState<Row<"contacts"> | null>(null)
  const { data: contacts, isPending } = useList("contacts", { order: { column: "nombre" } })
  const { data: loans = [] } = useList("loans")
  const del = useSoftDelete("contacts", "Contacto eliminado")

  const loansOf = (c: Row<"contacts">) => loans.filter((l) => l.contact_id === c.id)
  const ciudades = [...new Set((contacts ?? []).map((c) => c.ciudad).filter((x): x is string => !!x))].sort()
  const remove = (c: Row<"contacts">) => {
    if (loans.some((l) => l.contact_id === c.id)) return toast.error("Este contacto tiene préstamos", { description: "Elimínalos primero." })
    del.mutate(c)
  }

  return (
    <>
      <DataTable<Row<"contacts">>
        bare title="Tus contactos" info="Personas y empresas con las que tienes préstamos. Toca un dato para copiarlo."
        data={contacts} loading={isPending} rowKey={(c) => c.id} noun={["contacto", "contactos"]} exportName="contactos"
        listClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        columns={[
          { id: "nombre", header: "Nombre", sort: (c) => c.nombre.toLowerCase(), csv: (c) => c.nombre },
          { id: "prestamos", header: "Préstamos", sort: (c) => loansOf(c).length, csv: (c) => loansOf(c).length },
          { id: "telefono", header: "Teléfono", csv: (c) => c.telefono },
          { id: "correo", header: "Correo", csv: (c) => c.email },
          { id: "documento", header: "Documento", csv: (c) => (c.doc ? `${c.doc_tipo} ${c.doc}` : "") },
          { id: "ciudad", header: "Ciudad", sort: (c) => c.ciudad ?? "~", csv: (c) => c.ciudad },
          { id: "relacion", header: "Relación", csv: (c) => c.relacion },
        ]}
        initialSort={{ id: "nombre", dir: "asc" }}
        search={{ placeholder: "Buscar contacto", initial: q0, text: (c) => `${c.nombre} ${c.telefono ?? ""} ${c.email ?? ""} ${c.doc ?? ""} ${c.ciudad ?? ""} ${c.relacion ?? ""}` }}
        filters={[
          { id: "tipo", label: "Tipo", options: [{ value: "persona", label: "Personas" }, { value: "empresa", label: "Empresas" }], match: (c, v) => (c.tipo === "empresa" ? "empresa" : "persona") === v },
          { id: "prest", label: "Préstamos", options: [{ value: "si", label: "Con préstamos" }, { value: "no", label: "Sin préstamos" }], match: (c, v) => (loansOf(c).length > 0) === (v === "si") },
          ...(ciudades.length > 1 ? [{ id: "ciudad", label: "Ciudad", options: ciudades.map((x) => ({ value: x, label: x })), match: (c: Row<"contacts">, v: string) => c.ciudad === v }] : []),
        ]}
        emptyState={<Card className="shadow-card ring-0"><EmptyState iso="contactos" title="Aún no tienes contactos" description="Agrega a las personas o empresas con las que tienes préstamos." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar contacto</Button>} /></Card>}
        item={(c) => {
          const a = toAddress(c)
          const count = loansOf(c)
          return (
            <li key={c.id} id={`c-${c.id}`} className="grid">
              <Card className={cn("h-full gap-4 p-5 shadow-card ring-0", id === c.id && "ring-2 ring-brand")}>
                <div className="flex items-center gap-3">
                  {c.tipo === "empresa" ? <EntityLogo name={c.nombre} icon="building-2" seed={c.nombre} size={44} />
                    : <Avatar className="size-11"><AvatarFallback className={cn("bg-gradient-to-br text-sm font-semibold text-white", avatarTone(c.nombre))}>{initials(c.nombre)}</AvatarFallback></Avatar>}
                  <div className="grid min-w-0 flex-1">
                    <span className="truncate font-semibold">{c.nombre}</span>
                    <span className="truncate text-sm text-muted-foreground">{[c.relacion || (c.tipo === "empresa" ? "Empresa" : "Persona"), c.ciudad].filter(Boolean).join(" · ")}</span>
                  </div>
                  {canEdit && <IconAction a={{ label: `Editar ${c.nombre}`, tip: "Editar", icon: "pencil", onClick: () => setEditing(c) }} />}
                </div>
                <div className="grid gap-2">
                  <CopyRow label="Teléfono" value={c.telefono} />
                  <CopyRow label="Correo" value={c.email} />
                  <CopyRow label="Documento" value={c.doc ? `${DOC_TIPOS.find((d) => d.value === c.doc_tipo)?.value ?? c.doc_tipo} ${c.doc}` : ""} />
                  <CopyRow label="Dirección" value={[a.dir, a.barrio].filter(Boolean).join(", ")} />
                  {c.notas && <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">{c.notas}</p>}
                </div>
                {count.length > 0 && <p className="text-sm text-muted-foreground">{count.length} préstamo{count.length > 1 ? "s" : ""} con este contacto</p>}
                {canEdit && (
                  <div className="mt-auto flex gap-2">
                    <Button variant="soft" className="flex-1" asChild><Link href={`/me-deben?nuevo=1&cid=${c.id}`}><HandCoins /> Prestarle</Link></Button>
                    <IconAction a={{ label: `Eliminar ${c.nombre}`, tip: "Eliminar contacto", icon: "trash-2", destructive: true, onClick: () => remove(c) }} />
                  </div>
                )}
              </Card>
            </li>
          )
        }}
      />
      <ContactForm open={nuevo || !!editing} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditing(null); if (id) setId(null) } }} contact={editing} />
    </>
  )
}

type Ent = Row<"entities">
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Bancos, cooperativas, casas de empeño y demás entidades del libro, con lo que tienes en cada una. */
function Entidades({ nueva, setNueva }: { nueva: boolean; setNueva: (o: boolean) => void }) {
  const canEdit = useCanEdit()
  const [id] = useIdParam()
  const [editing, setEditing] = useState<Ent | null>(null)
  const { data: entities, isPending } = useEntities()
  const { data: loans = [] } = useList("loans")
  const { data: cards = [] } = useList("credit_cards")
  const { data: invs = [] } = useList("investments")
  const del = useSoftDelete("entities", "Entidad eliminada")

  const uso = (e: Ent) => ({ deudas: loans.filter((l) => l.entity_id === e.id).length, tarjetas: cards.filter((c) => c.entity_id === e.id).length, inversiones: invs.filter((i) => i.entity_id === e.id).length })
  const usoN = (e: Ent) => { const u = uso(e); return u.deudas + u.tarjetas + u.inversiones }
  const usoTxt = (e: Ent) => {
    const u = uso(e)
    return [u.deudas && plural(u.deudas, "deuda", "deudas"), u.tarjetas && plural(u.tarjetas, "tarjeta", "tarjetas"), u.inversiones && plural(u.inversiones, "inversión", "inversiones")].filter(Boolean).join(" · ")
  }
  const tipos = ENTITY_TIPOS.filter((t) => entities?.some((e) => e.tipo === t))
  const remove = (e: Ent) => {
    if (usoN(e)) return toast.error("Esta entidad está en uso", { description: `Tiene ${usoTxt(e)}. Cámbialas a otra entidad o elimínalas primero.` })
    del.mutate(e)
  }

  return (
    <div className="grid gap-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-secondary/60 p-3 text-sm">
        <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>Las tiendas y almacenes donde te fían o compras a cuotas están en Proveedores.</span>
        <Link href="/proveedores" className="font-semibold text-link hover:underline">Ver en Proveedores</Link>
      </p>
      <DataTable<Ent>
        bare title="Bancos y entidades" info="Bancos, cooperativas, fintech, fondos y casas de empeño. Las escoges al registrar deudas, tarjetas e inversiones."
        data={entities} loading={isPending} rowKey={(e) => e.id} noun={["entidad", "entidades"]} exportName="entidades"
        listClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        columns={[
          { id: "nombre", header: "Nombre", sort: (e) => e.nombre.toLowerCase(), csv: (e) => e.nombre },
          { id: "tipo", header: "Tipo", sort: (e) => e.tipo, csv: (e) => e.tipo },
          { id: "nit", header: "NIT", csv: (e) => e.nit },
          { id: "uso", header: "En uso", sort: usoN, csv: usoN },
        ]}
        initialSort={{ id: "nombre", dir: "asc" }}
        search={{ placeholder: "Buscar por nombre o NIT", text: (e) => `${e.nombre} ${e.nit} ${e.tipo}` }}
        filters={[
          ...(tipos.length > 1 ? [{ id: "tipo", label: "Tipo", options: tipos.map((t) => ({ value: t, label: t })), match: (e: Ent, v: string) => e.tipo === v }] : []),
          { id: "uso", label: "En uso", options: [{ value: "si", label: "Con deudas, tarjetas o inversiones" }, { value: "no", label: "Sin uso" }], match: (e, v) => (usoN(e) > 0) === (v === "si") },
        ]}
        emptyState={<Card className="shadow-card ring-0"><EmptyState iso="contactos" title="Aún no tienes entidades" description="Agrega tu banco, cooperativa o casa de empeño para escogerla al registrar una deuda." action={canEdit && <Button onClick={() => setNueva(true)}><Plus /> Agregar entidad</Button>} /></Card>}
        item={(e) => {
          const txt = usoTxt(e)
          return (
            <li key={e.id} id={`e-${e.id}`} className="grid">
              <Card className={cn("h-full gap-3 p-5 shadow-card ring-0", id === e.id && "ring-2 ring-brand")}>
                <div className="flex items-center gap-3">
                  <EntityLogo name={e.nombre} icon={entityIcon(e.tipo)} seed={e.nombre} size={44} />
                  <div className="grid min-w-0 flex-1">
                    <span className="truncate font-semibold">{e.nombre}</span>
                    <span className="truncate text-sm text-muted-foreground">{e.tipo}</span>
                  </div>
                  {canEdit && <IconAction a={{ label: `Editar ${e.nombre}`, tip: "Editar", icon: "pencil", onClick: () => setEditing(e) }} />}
                </div>
                <CopyRow label="NIT" value={e.nit} />
                <p className="text-sm text-muted-foreground">{txt || "Sin deudas, tarjetas ni inversiones"}</p>
                {canEdit && (
                  <div className="mt-auto flex justify-end">
                    <IconAction a={{ label: `Eliminar ${e.nombre}`, tip: "Eliminar entidad", icon: "trash-2", destructive: true, onClick: () => remove(e) }} />
                  </div>
                )}
              </Card>
            </li>
          )
        }}
      />
      <EntityDialog open={nueva || !!editing} onOpenChange={(o) => { if (!o) { setNueva(false); setEditing(null) } }} entity={editing} />
    </div>
  )
}
