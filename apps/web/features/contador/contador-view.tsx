"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Link2, MessageCircle, RefreshCw, UserX } from "lucide-react"
import { z } from "zod"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { FormField } from "@/components/mirai/field"
import { Notice } from "@/components/mirai/notice"
import { EmptyState } from "@/components/mirai/empty-state"
import { ListToolbar, NoResults, useListControls, type ListFilter, type ListSort } from "@/components/mirai/list-toolbar"
import { Panel, SectionTitle } from "@/components/mirai/panel"
import { SubmitButton } from "@/components/mirai/submit-button"
import { Tip } from "@/components/mirai/tip"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { PageHeader } from "@/components/mirai/page-header"
import { StatusPill } from "@/components/mirai/status-pill"
import { useApp } from "@/components/app/app-context"
import { can } from "@/lib/household/roles"
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

type ShareRow = { id: string; label: string; email: string | null; perms: string; expires_at: string | null; revoked_at: string | null; views: number; last_access: string | null; created_at: string }
const estadoDe = (s: ShareRow) => (s.revoked_at ? "quitado" : s.expires_at && new Date(s.expires_at) < new Date() ? "vencido" : "activo")
const FILTROS: ListFilter<ShareRow>[] = [
  { value: "todos", label: "Todos" },
  { value: "activo", label: "Activos", match: (s) => estadoDe(s) === "activo" },
  { value: "off", label: "Vencidos o quitados", match: (s) => estadoDe(s) !== "activo" },
]
const ORDEN: ListSort<ShareRow>[] = [
  { value: "nuevo", label: "Más recientes", by: (a, b) => b.created_at.localeCompare(a.created_at) },
  { value: "acceso", label: "Último ingreso", by: (a, b) => (b.last_access ?? "").localeCompare(a.last_access ?? "") },
  { value: "nombre", label: "Nombre (A-Z)", by: (a, b) => a.label.localeCompare(b.label, "es") },
]
const emailOk = (e: string) => !e.trim() || z.email().safeParse(e.trim()).success

function copy(url: string, label: string) {
  navigator.clipboard.writeText(url).then(() => toast.success(`Copiamos el enlace para ${label}`, { description: "Envíaselo por un medio seguro." }), () => window.prompt("Copia el enlace:", url))
}

export function ContadorView() {
  const { book, household } = useApp()
  const qc = useQueryClient()
  const owner = can(household.access, "ajustes")
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
  const ctl = useListControls<ShareRow>(data?.shares as ShareRow[] | undefined, { text: (s) => `${s.label} ${s.email ?? ""}`, filters: FILTROS, sorts: ORDEN })
  const valido = !!f.label.trim() && emailOk(f.email)

  return (
    <div className="grid gap-6">
      <PageHeader id="contador" title="Acceso de tu contador" description="Dale a tu contador acceso de solo lectura a tu información para la declaración de renta, sin enviarle archivos sueltos." />
      <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Cómo funciona">
        {PASOS.map(([i, t, d], n) => (
          <li key={t}>
            <Panel className="flex-row items-start gap-3 p-4">
              <span className="relative"><ToneIcon icon={i} tone="brand" /><span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{n + 1}</span></span>
              <div className="grid gap-0.5"><p className="font-semibold">{t}</p><p className="text-sm text-muted-foreground">{d}</p></div>
            </Panel>
          </li>
        ))}
      </ol>

      {owner ? (
        <Panel title="Crear un acceso" icon="link-2">
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Nombre de tu contador" htmlFor="ct-n" required tip={false}><Input id="ct-n" className="h-11" maxLength={80} placeholder="Ej. Marcela Rojas" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></FormField>
              <FormField label="Correo (opcional)" htmlFor="ct-e" hint="Si tienes un servicio de correo activo, le enviamos el enlace." tip={false} error={emailOk(f.email) ? undefined : "Escribe un correo válido"}><Input id="ct-e" type="email" className="h-11" aria-invalid={!emailOk(f.email)} placeholder="contador@correo.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></FormField>
            </div>
            <FormField label="¿Qué puede ver?" tip={false}><ChoiceCards value={f.perms} onChange={(v) => setF({ ...f, perms: v as "renta" })} items={[{ value: "renta", label: "Lo de la declaración de renta", desc: "Ingresos, bienes, deudas, dependientes y documentos", icon: "file-check", recommended: true }, { value: "todo", label: "Todo mi libro (solo lectura)", desc: "Además, todos tus gastos y movimientos", icon: "book-open" }]} /></FormField>
            <FormField label="¿Hasta cuándo?" tip={false}><div className="sm:w-80"><Combobox value={f.exp} onChange={(v) => setF({ ...f, exp: v as "90" })} options={[{ value: "30", label: "30 días" }, { value: "90", label: "3 meses" }, { value: "dic", label: `Hasta el 31 de diciembre de ${year}` }, { value: "nunca", label: "Hasta que yo lo quite" }]} /></div></FormField>
            <div><SubmitButton className="h-11" disabled={!valido} loading={busy === "new"} loadingText="Creando el enlace…" hint={!f.label.trim() ? "Escribe el nombre de tu contador" : "Revisa el correo"} onClick={async () => {
              if (!valido) return
              setBusy("new"); const r = await createShare({ ...f, label: f.label.trim(), email: f.email.trim() }); setBusy(null)
              if (!r.ok) return toast.error(r.msg)
              toast.success("Acceso creado", { description: r.msg }); copy(r.url!, f.label.trim())
              setF({ ...f, label: "", email: "" }); refresh()
            }}><Link2 /> Crear y copiar enlace</SubmitButton></div>
          </FieldGroup>
        </Panel>
      ) : <Notice tone="info" title="Solo el dueño del hogar puede crear accesos para el contador." />}

      <section className="grid gap-3">
        <SectionTitle icon="users" action={<Button variant="ghost" size="sm" onClick={refresh}><RefreshCw /> Actualizar</Button>}>Accesos creados</SectionTitle>
        {!!data?.shares.length && data.shares.length > 2 && <ListToolbar c={ctl} placeholder="Buscar por nombre o correo" filters={FILTROS} sorts={ORDEN} />}
        {isPending ? <Skeleton className="h-32 rounded-xl" /> : !data?.shares.length ? (
          <Panel><EmptyState iso="contador" title="Aún no has creado accesos" description="Crea un enlace arriba y envíaselo a tu contador por un medio seguro." /></Panel>
        ) : !ctl.rows.length ? <NoResults c={ctl} /> : ctl.rows.map((s) => {
          const vencido = !!s.expires_at && new Date(s.expires_at) < new Date()
          const off = !!s.revoked_at || vencido
          const notes = data.notes.filter((n) => n.share_id === s.id)
          return (
            <Panel key={s.id} className={cn("gap-3", off && "opacity-70")}>
              <div className="flex flex-wrap items-start gap-3">
                <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full font-semibold", off ? "bg-secondary text-muted-foreground" : "bg-brand-soft text-link")}>{s.label.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex flex-wrap items-center gap-2 font-semibold"><span className="min-w-0 break-words">{s.label}</span>{s.revoked_at ? <Tip label="Quitaste este acceso: el enlace ya no funciona."><span><StatusPill tone="vencido">Quitado</StatusPill></span></Tip> : vencido ? <Tip label="Pasó la fecha límite. Genera un enlace nuevo para reactivarlo."><span><StatusPill tone="vencido">Venció</StatusPill></span></Tip> : <Tip label="Tu contador puede entrar con el enlace."><span><StatusPill tone="pagado">Activo</StatusPill></span></Tip>}</p>
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
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><MessageCircle className="size-4 text-brand" aria-hidden /> Notas</p>
                <NotesThread notes={notes} me="titular" other={s.label.split(" ")[0]} limit={6} onSend={async (t) => { await ownerNote(s.id, t); refresh() }} />
              </div>
            </Panel>
          )
        })}
      </section>
      <p className="text-xs text-muted-foreground">El enlace es la llave de acceso: si crees que alguien más lo tiene, genera uno nuevo o quita el acceso. Por seguridad no guardamos el enlace; solo puedes copiarlo al crearlo o al generar uno nuevo.</p>
    </div>
  )
}
