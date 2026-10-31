"use client"

import Link from "next/link"
import { useState } from "react"
import { Copy, HandCoins, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/mirai/page-header"
import { EmptyState } from "@/components/mirai/empty-state"
import { initials } from "@/components/app/app-sidebar"
import { useCanEdit } from "@/components/app/app-context"
import { useList, useSoftDelete } from "@/hooks/use-book-data"
import { useIdParam, useNewParam } from "@/hooks/use-new-param"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { ContactForm, DOC_TIPOS, toAddress } from "./contact-form"

/** Degradado del avatar según el nombre (av() de la v4: c0..c4). */
const AV = ["from-navy to-forest", "from-forest to-lime", "from-[#C2571A] to-[#F7B928]", "from-navy to-[#5A6C9E]", "from-[#2C3E6B] to-forest"]
export const avatarTone = (n: string) => AV[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length]

function CopyRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {value ? (
        <button type="button" className="flex min-w-0 items-center gap-1.5 truncate font-medium hover:text-link" title="Copiar"
          onClick={() => navigator.clipboard.writeText(value).then(() => toast("Copiado"), () => toast(value))}>
          <span className="truncate">{value}</span><Copy className="size-3.5 shrink-0" />
        </button>
      ) : <span className="text-muted-foreground/70">Sin registrar</span>}
    </div>
  )
}

export function ContactsView() {
  const canEdit = useCanEdit()
  const [nuevo, setNuevo] = useNewParam()
  const [id, setId] = useIdParam()
  const [editing, setEditing] = useState<Row<"contacts"> | null>(null)
  const { data: contacts, isPending } = useList("contacts", { order: { column: "nombre" } })
  const { data: loans = [] } = useList("loans")
  const del = useSoftDelete("contacts", "Contacto eliminado")

  const remove = (c: Row<"contacts">) => {
    if (loans.some((l) => l.contact_id === c.id)) return toast.error("Este contacto tiene préstamos", { description: "Elimínalos primero." })
    del.mutate(c)
  }

  return (
    <div className="grid gap-6">
      <PageHeader id="contactos" description="Las personas y empresas con las que tienes préstamos. Guarda sus datos una vez y úsalos cada vez que registres un préstamo."
        actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Nuevo contacto</Button>} />
      {isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>
      ) : !contacts?.length ? (
        <Card className="shadow-card ring-0"><EmptyState iso="contactos" title="Aún no tienes contactos" description="Agrega a las personas o empresas con las que tienes préstamos." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar contacto</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {contacts.map((c) => {
            const a = toAddress(c)
            const count = loans.filter((l) => l.contact_id === c.id)
            return (
              <Card key={c.id} id={`c-${c.id}`} className={cn("gap-4 p-5 shadow-card ring-0", id === c.id && "ring-2 ring-brand")}>
                <div className="flex items-center gap-3">
                  <Avatar className="size-11"><AvatarFallback className={cn("bg-gradient-to-br text-sm font-semibold text-white", avatarTone(c.nombre))}>{initials(c.nombre)}</AvatarFallback></Avatar>
                  <div className="grid min-w-0 flex-1">
                    <span className="truncate font-semibold">{c.nombre}</span>
                    <span className="truncate text-sm text-muted-foreground">{[c.relacion || (c.tipo === "empresa" ? "Empresa" : "Persona"), c.ciudad].filter(Boolean).join(" · ")}</span>
                  </div>
                  {canEdit && <Button variant="ghost" size="icon" aria-label={`Editar ${c.nombre}`} onClick={() => setEditing(c)}><Pencil /></Button>}
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
                    <Button variant="ghost" size="icon" aria-label={`Eliminar ${c.nombre}`} onClick={() => remove(c)}><Trash2 /></Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
      <ContactForm open={nuevo || !!editing} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditing(null); if (id) setId(null) } }} contact={editing} />
    </div>
  )
}
