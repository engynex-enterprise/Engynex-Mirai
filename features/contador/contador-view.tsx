"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Link2, MessageCircle, RefreshCw, UserX } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { FormField } from "@/components/mirai/field"
import { Notice } from "@/components/mirai/notice"
import { PageHeader } from "@/components/mirai/page-header"
import { StatusPill } from "@/components/mirai/status-pill"
import { useApp } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { createShare, ownerNote, revokeShare, rotateShare } from "./actions"
import { NotesThread, type Note } from "./notes"

const PASOS = [
  ["link-2", "Creas un enlace", "Eliges qué puede ver y hasta cuándo."],
  ["shield-check", "Es privado", "Solo con el enlace se entra; guardamos una huella, no el enlace."],
  ["eye", "Tu contador entra", "Ve tu información en vivo, sin poder cambiar nada."],
  ["message-circle", "Te deja notas", "Pide documentos o avisa cuando termine."],
]

function copy(url: string, label: string) {
  navigator.clipboard.writeText(url).then(() => toast.success(`Copiamos el enlace para ${label}`, { description: "Envíaselo por un medio seguro." }), () => window.prompt("Copia el enlace:", url))
}

export function ContadorView() {
  const { book, household } = useApp()
  const qc = useQueryClient()
  const owner = household.role === "owner"
  const [f, setF] = useState({ label: "", email: "", perms: "renta" as "renta" | "todo", exp: "90" as "30" | "90" | "dic" | "nunca" })
  const [busy, setBusy] = useState<string | null>(null)
  const [links, setLinks] = useState<Record<string, string>>({})
  const year = new Date().getFullYear()
  const key = ["b", book.id, "accountant_shares"]
  const { data, isPending } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const sb = createClient()
      const [{ data: shares }, { data: notes }] = await Promise.all([
        sb.from("accountant_shares").select("id,label,email,perms,expires_at,revoked_at,views,last_access,created_at").eq("book_id", book.id).order("created_at", { ascending: false }),
        sb.from("accountant_notes").select("id,share_id,autor,texto,created_at").eq("book_id", book.id).is("deleted_at", null).order("created_at"),
      ])
      return { shares: shares ?? [], notes: (notes ?? []) as (Note & { share_id: string })[] }
    },
    refetchInterval: 30_000,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: key })

  return (
    <div className="grid gap-6">
      <PageHeader id="contador" title="Acceso de tu contador" description="Dale a tu contador acceso de solo lectura a tu información para la declaración de renta, sin enviarle archivos sueltos." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PASOS.map(([i, t, d], n) => (
          <Card key={t} className="flex-row items-start gap-3 p-4 shadow-card ring-0"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-link">{n + 1}</span><div><p className="font-medium">{t}</p><p className="text-sm text-muted-foreground">{d}</p></div></Card>
        ))}
      </div>

      {owner ? (
        <Card className="gap-4 p-5 shadow-card ring-0">
          <h2 className="font-semibold">Crear un acceso</h2>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Nombre de tu contador" htmlFor="ct-n" required tip={false}><Input id="ct-n" className="h-11" placeholder="Ej. Marcela Rojas" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></FormField>
              <FormField label="Correo (opcional)" htmlFor="ct-e" hint="Si tienes un servicio de correo activo, le enviamos el enlace." tip={false}><Input id="ct-e" type="email" className="h-11" placeholder="contador@correo.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></FormField>
            </div>
            <FormField label="¿Qué puede ver?" tip={false}><ChoiceCards value={f.perms} onChange={(v) => setF({ ...f, perms: v as "renta" })} items={[{ value: "renta", label: "Lo de la declaración de renta", desc: "Ingresos, bienes, deudas, dependientes y documentos", icon: "file-check", recommended: true }, { value: "todo", label: "Todo mi libro (solo lectura)", desc: "Además, todos tus gastos y movimientos", icon: "book-open" }]} /></FormField>
            <FormField label="¿Hasta cuándo?" tip={false}><div className="sm:w-80"><Combobox value={f.exp} onChange={(v) => setF({ ...f, exp: v as "90" })} options={[{ value: "30", label: "30 días" }, { value: "90", label: "3 meses" }, { value: "dic", label: `Hasta el 31 de diciembre de ${year}` }, { value: "nunca", label: "Hasta que yo lo quite" }]} /></div></FormField>
            <Button className="h-11 w-fit" disabled={busy === "new"} onClick={async () => {
              setBusy("new"); const r = await createShare(f); setBusy(null)
              if (!r.ok) return toast.error(r.msg)
              toast.success("Acceso creado", { description: r.msg }); copy(r.url!, f.label)
              setF({ ...f, label: "", email: "" }); refresh()
            }}>{busy === "new" ? <Spinner /> : <Link2 />} Crear y copiar enlace</Button>
          </FieldGroup>
        </Card>
      ) : <Notice tone="info" title="Solo el dueño del hogar puede crear accesos para el contador." />}

      <section className="grid gap-3">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Accesos creados</h2><Button variant="ghost" size="sm" onClick={refresh}><RefreshCw /> Actualizar</Button></div>
        {isPending ? <Skeleton className="h-32" /> : !data?.shares.length ? <p className="text-sm text-muted-foreground">Aún no has creado accesos.</p> : data.shares.map((s) => {
          const vencido = !!s.expires_at && new Date(s.expires_at) < new Date()
          const off = !!s.revoked_at || vencido
          const notes = data.notes.filter((n) => n.share_id === s.id)
          return (
            <Card key={s.id} className={cn("gap-3 p-5 shadow-card ring-0", off && "opacity-60")}>
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-link">{s.label.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{s.label}{s.revoked_at ? <StatusPill tone="vencido">Quitado</StatusPill> : vencido ? <StatusPill tone="vencido">Venció</StatusPill> : <StatusPill tone="pagado">Activo</StatusPill>}</p>
                  <p className="text-sm text-muted-foreground">{s.perms === "todo" ? "Todo el libro" : "Declaración de renta"} · {s.expires_at ? `${vencido ? "venció" : "vence"} el ${fmtDate(s.expires_at.slice(0, 10))}` : "sin vencimiento"}{s.email ? ` · ${s.email}` : ""}</p>
                  <p className="text-xs text-muted-foreground">{s.last_access ? `Entró ${fmtDate(s.last_access.slice(0, 10))} (${s.views} ${s.views === 1 ? "vez" : "veces"})` : "Aún no ha entrado"}</p>
                </div>
                {owner && (
                  <div className="flex flex-wrap gap-2">
                    {links[s.id] && <><Button size="sm" variant="outline" onClick={() => copy(links[s.id], s.label)}><Copy /> Copiar enlace</Button><Button size="sm" variant="outline" asChild><a href={`https://wa.me/?text=${encodeURIComponent(`Hola ${s.label}, este es el acceso a mi información en Mirai: ${links[s.id]}`)}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></Button></>}
                    <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={async () => { setBusy(s.id); try { const u = await rotateShare(s.id); setLinks({ ...links, [s.id]: u }); copy(u, s.label); refresh() } catch (e) { toast.error((e as Error).message) } setBusy(null) }}>{busy === s.id ? <Spinner /> : <RefreshCw />} {off ? "Reactivar con enlace nuevo" : "Enlace nuevo"}</Button>
                    {!off && <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { await revokeShare(s.id); toast(`${s.label} ya no puede entrar.`); refresh() }}><UserX /> Quitar acceso</Button>}
                  </div>
                )}
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="mb-2 text-sm font-medium">Notas</p>
                <NotesThread notes={notes} me="titular" other={s.label.split(" ")[0]} limit={6} onSend={async (t) => { await ownerNote(s.id, t); refresh() }} />
              </div>
            </Card>
          )
        })}
      </section>
      <p className="text-xs text-muted-foreground">El enlace es la llave de acceso: si crees que alguien más lo tiene, genera uno nuevo o quita el acceso. Por seguridad no guardamos el enlace; solo puedes copiarlo al crearlo o al generar uno nuevo.</p>
    </div>
  )
}
