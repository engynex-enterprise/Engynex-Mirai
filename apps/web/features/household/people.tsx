"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Copy, Crown, Link2, LogOut, MailPlus, MessageCircle, MoreHorizontal, Pencil, Plus, RotateCw, Share2, ShieldCheck, Trash2, UserMinus, UserPlus, X } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Combobox } from "@/components/mirai/combobox"
import { Icon } from "@/components/mirai/icon"
import { Money } from "@/components/mirai/money"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { Tip } from "@/components/mirai/tip"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { ListToolbar, NoResults, useListControls, type ListFilter, type ListSort } from "@/components/mirai/list-toolbar"
import { useAccess, useApp, useCan } from "@/components/app/app-context"
import { assignableRoles, canManage, ROLE_INFO, type AccessRole } from "@/lib/household/roles"
import { haceCuanto } from "@/lib/household/invites"
import { cn } from "@/lib/utils"
import { cancelInvitation, changeRole, deleteFamilyMember, linkPerson, loadHouseholdPeople, markInvitationShared, removePerson, resendInvitation, shareInvitation } from "./api"
import { TransferDialog } from "@/features/account/transfer"
import { AddPersonDialog, DeliveryLines } from "./invite-dialog"
import { MemberDialog, parentescoIcon } from "./member-dialog"
import { Confirm, PermButton, RoleMatrix, RolePicker, RolePill } from "./roles-ui"
import type { HouseholdPeople as Data, Person } from "./types"

export function useHouseholdPeople() {
  const { household } = useApp()
  return useQuery({ queryKey: ["h", household.id, "people"], queryFn: () => loadHouseholdPeople() })
}

/** Estado en palabras simples. */
export function estadoText(p: Person) {
  if (p.estado === "miembro") return "Es parte del hogar"
  if (p.estado === "vencida") return "Venció"
  if (p.estado === "invitado") return `Invitación enviada ${haceCuanto(p.invite?.lastSentAt ?? p.invite?.createdAt ?? new Date().toISOString())}`
  return "No tiene cuenta (solo para registrar a quién corresponde)"
}
/** Qué significa cada estado (tooltip). */
const estadoTip = (p: Person) =>
  p.estado === "miembro" ? "Tiene su propia cuenta y ve este hogar."
    : p.estado === "invitado" ? `Le enviamos la invitación. Vence el ${new Date(p.invite?.expiresAt ?? Date.now()).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}.`
    : p.estado === "vencida" ? "Pasaron 7 días sin aceptarla. Envíala de nuevo desde el menú ⋯."
    : "Solo sirve para anotar sus gastos e ingresos. Puedes invitarla cuando quieras."
const estadoTone = (p: Person) => (p.estado === "miembro" ? "ok" : p.estado === "invitado" ? "porVencer" : p.estado === "vencida" ? "vencido" : "gray") as "ok" | "porVencer" | "vencido" | "gray"

const PEOPLE_FILTERS: ListFilter<Person>[] = [
  { value: "todas", label: "Todas" },
  { value: "cuenta", label: "Con cuenta", icon: "user-check", match: (p) => p.estado === "miembro" },
  { value: "sin", label: "Sin cuenta", icon: "user", match: (p) => p.estado === "sin_cuenta" },
  { value: "inv", label: "Invitaciones", icon: "send", match: (p) => p.estado === "invitado" || p.estado === "vencida" },
]
const ESTADO_ORDEN = { miembro: 0, sin_cuenta: 1, invitado: 2, vencida: 3 } as const
const PEOPLE_SORTS: ListSort<Person>[] = [
  { value: "hogar", label: "Como está el hogar", by: () => 0 },
  { value: "nombre", label: "Nombre (A-Z)", by: (a, b) => a.nombre.localeCompare(b.nombre, "es") },
  { value: "estado", label: "Estado", by: (a, b) => ESTADO_ORDEN[a.estado] - ESTADO_ORDEN[b.estado] },
]
const personText = (p: Person) => `${p.nombre} ${p.parentesco ?? ""} ${p.email ?? ""} ${p.invite?.destino ?? ""}`
/** La barra de búsqueda aparece cuando la lista ya no cabe de un vistazo. */
const TOOLBAR_FROM = 6

type Pending =
  | { k: "rol"; p: Person; to?: AccessRole; confirm?: boolean }
  | { k: "quitar"; p: Person }
  | { k: "salir"; p: Person }
  | { k: "pasar"; p: Person }
  | { k: "cancelar"; p: Person }
  | { k: "borrar"; p: Person }
  | { k: "vincular"; p: Person }

/**
 * "Tu hogar": integrantes sin cuenta, personas con cuenta e invitaciones pendientes en una sola lista, con un solo
 * botón "Agregar persona". `layout="grid"` es la vista de tarjetas del perfil (como los perfiles de Netflix).
 */
export function HouseholdPeople({ layout = "list", showMatrix = true }: { layout?: "list" | "grid"; showMatrix?: boolean }) {
  const { household, user } = useApp()
  const access = useAccess()
  const canInvite = useCan("invitar")
  const canPlan = useCan("planear")
  const router = useRouter()
  const qc = useQueryClient()
  const { data, isPending } = useHouseholdPeople()
  const c = useListControls(data?.people, { text: personText, filters: PEOPLE_FILTERS, sorts: PEOPLE_SORTS })
  const [adding, setAdding] = useState<null | { preset?: { familyId: string; nombre: string; parentesco: string | null } }>(null)
  const [editing, setEditing] = useState<Person | "new" | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ["h", household.id] })

  const run = async (key: string, f: () => Promise<{ ok: boolean; msg: string }>, after?: () => void, quiet = false) => {
    setBusy(key)
    try {
      const r = await f()
      if (!r.ok) toast.error(r.msg)
      else { if (r.msg && !quiet) toast.success(r.msg); refresh(); after?.() }
    } catch (e) { toast.error((e as Error).message) }
    setBusy(null)
  }

  const openWa = async (p: Person) => {
    const inv = p.invite!
    let share = inv.share
    const w = share ? null : window.open("about:blank", "_blank")
    if (!share) {
      const r = await shareInvitation(inv.id)
      if (!r.ok || !r.share) { w?.close(); return toast.error(r.msg) }
      share = r.share
    }
    if (w) w.location.href = share.wa; else window.open(share.wa, "_blank", "noopener")
    void markInvitationShared(inv.id).then(refresh)
  }
  const copyLink = async (p: Person) => {
    const inv = p.invite!
    const share = inv.share ?? (await shareInvitation(inv.id)).share
    if (!share) return toast.error("No pudimos obtener el enlace. Reenvía la invitación.")
    try { await navigator.clipboard.writeText(share.url); toast.success("Enlace copiado", { description: "Pégalo en el chat que quieras." }) } catch { toast.error("No pudimos copiar el enlace", { description: share.url }) }
  }
  const shareNative = async (p: Person) => {
    const inv = p.invite!
    const share = inv.share ?? (await shareInvitation(inv.id)).share
    if (share) navigator.share?.({ title: "Invitación a Mirai", text: share.text }).catch(() => {})
  }

  const confirmPending = () => {
    const x = pending
    if (!x) return
    setPending(null)
    const n = x.p.nombre
    if (x.k === "rol" && x.to) return run(x.p.key, () => changeRole(x.p.userId!, x.to!))
    if (x.k === "quitar") return run(x.p.key, () => removePerson(x.p.userId!))
    if (x.k === "salir") return run(x.p.key, () => removePerson(user.id), () => { router.push("/inicio"); router.refresh() })
    if (x.k === "cancelar") return run(x.p.key, () => cancelInvitation(x.p.invite!.id))
    if (x.k === "borrar") return run(x.p.key, () => deleteFamilyMember(x.p.familyId!), () => toast(`${n} ya no está en el hogar`, { action: { label: "Deshacer", onClick: () => run(x.p.key, () => deleteFamilyMember(x.p.familyId!, true)) } }), true)
  }

  const actions = (p: Person) => {
    const items: React.ReactNode[] = []
    const inv = p.invite
    if (inv && canInvite) {
      items.push(
        <DropdownMenuItem key="re" onSelect={() => run(p.key, () => resendInvitation(inv.id))}><RotateCw /> {inv.estado === "vencida" ? "Enviar de nuevo (renueva 7 días)" : "Reenviar invitación"}</DropdownMenuItem>,
        <DropdownMenuItem key="wa" onSelect={() => openWa(p)}><MessageCircle /> Enviar desde mi WhatsApp</DropdownMenuItem>,
        <DropdownMenuItem key="cp" onSelect={() => copyLink(p)}><Copy /> Copiar enlace</DropdownMenuItem>,
      )
      if (typeof navigator !== "undefined" && "share" in navigator) items.push(<DropdownMenuItem key="sh" onSelect={() => shareNative(p)}><Share2 /> Compartir</DropdownMenuItem>)
      items.push(<DropdownMenuItem key="cx" variant="destructive" onSelect={() => setPending({ k: "cancelar", p })}><X /> Cancelar invitación</DropdownMenuItem>)
    }
    if (p.estado === "sin_cuenta" && p.familyId && canInvite) items.push(<DropdownMenuItem key="inv" onSelect={() => setAdding({ preset: { familyId: p.familyId!, nombre: p.nombre, parentesco: p.parentesco } })}><MailPlus /> Invitarla a usar Mirai</DropdownMenuItem>)
    if (p.family && canPlan) items.push(<DropdownMenuItem key="ed" onSelect={() => setEditing(p)}><Pencil /> {p.me ? "Editar mis datos" : "Editar datos"}</DropdownMenuItem>)
    if (p.estado === "miembro" && !p.me && p.access) {
      if (canManage(access, p.access) && p.access !== "owner") items.push(<DropdownMenuItem key="rol" onSelect={() => setPending({ k: "rol", p })}><ShieldCheck /> Cambiar rol</DropdownMenuItem>)
      if (!p.familyId && canInvite && data?.sinCuenta.length) items.push(<DropdownMenuItem key="lk" onSelect={() => setPending({ k: "vincular", p })}><Link2 /> Es la misma persona que…</DropdownMenuItem>)
      if (access === "owner" && p.access !== "owner") items.push(<DropdownMenuItem key="pa" onSelect={() => setPending({ k: "pasar", p })}><Crown /> Pasarle el hogar</DropdownMenuItem>)
      if (canManage(access, p.access)) items.push(<DropdownMenuItem key="qt" variant="destructive" onSelect={() => setPending({ k: "quitar", p })}><UserMinus /> Quitar del hogar</DropdownMenuItem>)
    }
    if (p.estado === "sin_cuenta" && p.familyId && !p.titular && canInvite) items.push(<DropdownMenuItem key="del" variant="destructive" onSelect={() => setPending({ k: "borrar", p })}><Trash2 /> Quitar del hogar</DropdownMenuItem>)
    if (p.me && access !== "owner") items.push(<DropdownMenuItem key="out" variant="destructive" onSelect={() => setPending({ k: "salir", p })}><LogOut /> Salir del hogar</DropdownMenuItem>)
    if (!items.length) return null
    return (
      // modal={false}: las ventanas que abre una opción no quedan bloqueadas por el menú (dos Radix cruzados)
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`Opciones de ${p.nombre}`} disabled={busy === p.key}>{busy === p.key ? <Spinner /> : <MoreHorizontal />}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="truncate">{p.nombre}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const addButton = (
    <PermButton perm="invitar" onClick={() => setAdding({})}><UserPlus /> Agregar persona</PermButton>
  )

  return (
    <div className="grid gap-4">
      {isPending || !data ? <PeopleSkeleton layout={layout} /> : layout === "list" ? (
        <>
        {data.people.length >= TOOLBAR_FROM && <ListToolbar c={c} placeholder="Buscar persona" filters={PEOPLE_FILTERS} sorts={PEOPLE_SORTS} />}
        {!c.rows.length ? <NoResults c={c} /> : (
        <ul className="grid" aria-label="Personas del hogar">
          {c.rows.map((p) => (
            <li key={p.key} className="flex flex-wrap items-center gap-3 border-b py-3 last:border-0" data-person={p.nombre}>
              <UserAvatar src={p.avatar} name={p.nombre} square className="size-11" fallbackClassName="text-xs" />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <p className="truncate font-medium">{p.nombre}{p.me && <span className="text-muted-foreground"> (tú)</span>}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                  {p.parentesco && <span className="inline-flex items-center gap-1"><Icon name={parentescoIcon(p.parentesco)} className="size-3.5" />{p.parentesco}</span>}
                  {(p.invite?.destino || (p.email && p.estado === "miembro")) && <span className="truncate">{p.invite?.destino ?? p.email}</span>}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <Tip label={estadoTip(p)}><span className="inline-flex"><StatusPill tone={estadoTone(p)} className="h-auto min-h-6 py-0.5 whitespace-normal">{estadoText(p)}</StatusPill></span></Tip>
                  {p.access && <RolePill role={p.access} />}
                  {p.invite && <RolePill role={p.invite.access} className="opacity-80" />}
                </div>
                {p.invite && <DeliveryLines result={p.invite.result} className="pt-1" />}
              </div>
              {actions(p)}
            </li>
          ))}
        </ul>
        )}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 min-[480px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-6" aria-label="Personas del hogar" role="list">
          {data.people.map((p) => (
            <div key={p.key} role="listitem" className="group relative grid justify-items-center gap-2 text-center" data-person={p.nombre}>
              <button type="button" disabled={!(p.family && canPlan)} onClick={() => setEditing(p)} aria-label={`Editar ${p.nombre}`}
                className="rounded-[22%] outline-none transition-transform duration-200 hover:scale-[1.05] focus-visible:ring-2 focus-visible:ring-ring enabled:hover:ring-4 enabled:hover:ring-foreground/60 enabled:hover:ring-offset-2 enabled:hover:ring-offset-card">
                <UserAvatar src={p.avatar} name={p.nombre} square className={cn("size-24", p.estado !== "miembro" && p.estado !== "sin_cuenta" && "opacity-70")} fallbackClassName="text-2xl" />
              </button>
              <div className="grid gap-0.5">
                <p className="font-semibold">{p.nombre}{p.me && <span className="font-normal text-muted-foreground"> (tú)</span>}</p>
                {p.parentesco && <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><Icon name={parentescoIcon(p.parentesco)} className="size-3" />{p.parentesco}</p>}
                {p.access && <p className="text-xs font-medium text-link">{ROLE_INFO[p.access].label}</p>}
                {p.estado !== "miembro" && <p className="text-xs text-muted-foreground">{p.estado === "sin_cuenta" ? "Sin cuenta" : estadoText(p)}</p>}
                {p.family && +p.family.cupo > 0 && <p className="text-xs text-muted-foreground"><Money value={+p.family.cupo} /> al mes</p>}
              </div>
              <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">{actions(p)}</div>
            </div>
          ))}
          {canInvite && (
            <button type="button" onClick={() => setAdding({})} className="group grid justify-items-center gap-2 text-center outline-none">
              <span className="grid size-24 place-items-center rounded-[22%] border-2 border-dashed border-muted-foreground/40 text-muted-foreground transition group-hover:scale-[1.05] group-hover:border-foreground/60 group-hover:text-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring">
                <Plus className="size-9" />
              </span>
              <span className="font-semibold text-muted-foreground group-hover:text-foreground">Agregar persona</span>
            </button>
          )}
        </div>
      )}

      {layout === "list" && <div className="flex flex-wrap items-center gap-2">{addButton}<span className="text-xs text-muted-foreground">Invítala a usar Mirai o solo agrégala para asignarle gastos e ingresos.</span></div>}

      {showMatrix && (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-semibold text-link"><ChevronDown className="size-4 transition group-data-[state=open]:rotate-180" /> ¿Qué puede hacer cada rol?</CollapsibleTrigger>
          <CollapsibleContent className="pt-3"><RoleMatrix highlight={access} /></CollapsibleContent>
        </Collapsible>
      )}

      {adding && (
        <AddPersonDialog data={data} preset={adding.preset} onClose={() => setAdding(null)} onDone={refresh}
          onOnlyAdd={() => { setAdding(null); setEditing("new") }} />
      )}
      {editing && (
        <MemberDialog m={editing === "new" ? null : editing.family} titular={editing !== "new" && editing.me ? { avatar: editing.avatar } : undefined}
          onClose={() => setEditing(null)} onSaved={() => { refresh(); if (editing !== "new" && editing.me) router.refresh() }} />
      )}
      {pending?.k === "rol" && !pending.confirm && <RoleDialog p={pending.p} actor={access} onClose={() => setPending(null)} onSave={(to) => setPending({ k: "rol", p: pending.p, to, confirm: true })} />}
      {pending?.k === "vincular" && <LinkDialog p={pending.p} data={data} onClose={() => setPending(null)} onLink={(fid) => { const x = pending.p; setPending(null); run(x.key, () => linkPerson(x.userId!, fid)) }} />}
      {pending?.k === "pasar" && <TransferDialog householdId={household.id} open preselect={pending.p.userId} onOpenChange={(o) => !o && setPending(null)} onDone={refresh} />}
      <Confirm open={!!pending && (pending.k !== "rol" || !!pending.confirm) && pending.k !== "vincular" && pending.k !== "pasar"} onOpenChange={(o) => !o && setPending(null)}
        danger={pending?.k !== "rol" && pending?.k !== "pasar"} onConfirm={confirmPending}
        title={!pending ? "" : pending.k === "rol" ? `¿Cambiar el rol de ${pending.p.nombre}?` : pending.k === "quitar" ? `¿Quitar a ${pending.p.nombre} del hogar?` : pending.k === "salir" ? "¿Salir de este hogar?" : pending.k === "pasar" ? `¿Pasarle el hogar a ${pending.p.nombre}?` : pending.k === "cancelar" ? "¿Cancelar la invitación?" : `¿Quitar a ${pending.p.nombre}?`}
        action={!pending ? "" : pending.k === "rol" ? "Cambiar rol" : pending.k === "salir" ? "Salir del hogar" : pending.k === "pasar" ? "Pasarle el hogar" : pending.k === "cancelar" ? "Cancelar invitación" : "Quitar"}
        desc={!pending ? "" : pending.k === "rol" && pending.to ? <>Quedará como <b>{ROLE_INFO[pending.to].label}</b>: {ROLE_INFO[pending.to].desc} El cambio queda en el historial de cambios.</>
          : pending.k === "quitar" ? "Dejará de ver el hogar desde su cuenta. Sus gastos e ingresos se quedan a su nombre como integrante sin cuenta. El cambio queda en el historial."
          : pending.k === "salir" ? "Dejarás de ver este hogar. Para volver, alguien tendrá que invitarte de nuevo."
          : pending.k === "pasar" ? <>Será el <b>Dueño del hogar</b> (el plan y borrar el hogar quedan en sus manos) y tú quedarás como <b>Administra</b>.</>
          : pending.k === "cancelar" ? "El enlace que le llegó dejará de servir. Puedes invitarla de nuevo cuando quieras."
          : "Sale de la lista del hogar. Sus gastos e ingresos se quedan sin persona asignada. Puedes deshacerlo enseguida."} />
    </div>
  )
}

/** Cambiar rol: selector con descripción y tabla comparativa; la confirmación final la pide el AlertDialog. */
function RoleDialog({ p, actor, onClose, onSave }: { p: Person; actor: AccessRole; onClose: () => void; onSave: (r: AccessRole) => void }) {
  const [rol, setRol] = useState<AccessRole>(p.access ?? "viewer")
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} wide title={`Rol de ${p.nombre}`} description="Elige qué puede hacer esta persona en el hogar."
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><SubmitButton disabled={rol === p.access} onClick={() => onSave(rol)} hint="Elige un rol distinto al que tiene">Guardar rol</SubmitButton></>}>
      <div className="grid gap-4">
        <RolePicker value={rol} onChange={setRol} roles={assignableRoles(actor)} name="cambiar-rol" />
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-semibold text-link"><ChevronDown className="size-4 transition group-data-[state=open]:rotate-180" /> ¿Qué puede hacer cada rol?</CollapsibleTrigger>
          <CollapsibleContent className="pt-3"><RoleMatrix highlight={rol} /></CollapsibleContent>
        </Collapsible>
      </div>
    </ResponsiveDialog>
  )
}

/** Unir a una persona con cuenta con el integrante sin cuenta que ya la representaba (quita el duplicado). */
function LinkDialog({ p, data, onClose, onLink }: { p: Person; data: Data | undefined; onClose: () => void; onLink: (familyId: string) => void }) {
  const [fid, setFid] = useState("")
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={`¿Quién es ${p.nombre}?`} description="Si ya la tenías como integrante sin cuenta, únelas: queda una sola persona con su cuenta, sus gastos y sus ingresos."
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><SubmitButton disabled={!fid} onClick={() => onLink(fid)} hint="Elige el integrante">Unir</SubmitButton></>}>
      <label htmlFor="link-fam" className="sr-only">Integrante sin cuenta</label>
      <Combobox id="link-fam" value={fid} onChange={setFid} placeholder="Elige el integrante" options={(data?.sinCuenta ?? []).map((f) => ({ value: f.id, label: f.nombre, hint: f.parentesco, icon: "user" }))} />
    </ResponsiveDialog>
  )
}

/** Esqueleto con la forma de la lista (filas) o de la rejilla de perfiles. */
function PeopleSkeleton({ layout }: { layout: "list" | "grid" }) {
  if (layout === "grid") return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 min-[480px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-6" aria-busy="true" aria-label="Cargando personas">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="grid justify-items-center gap-2"><Skeleton className="size-24 rounded-[22%]" /><Skeleton className="h-4 w-20" /></div>)}
    </div>
  )
  return (
    <div className="grid" aria-busy="true" aria-label="Cargando personas">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b py-3 last:border-0">
          <Skeleton className="size-11 rounded-lg" />
          <div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-40" /><Skeleton className="h-5 w-56 rounded-full" /></div>
        </div>
      ))}
    </div>
  )
}
