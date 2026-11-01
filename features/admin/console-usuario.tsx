"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNowStrict } from "date-fns"
import { es } from "date-fns/locale"
import { Ban, Crown, KeyRound, Mail, ShieldCheck, ShieldOff, Trash2, UserCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { useApp } from "@/components/app/app-context"
import { AdminHeader } from "@/components/admin/admin-shell"
import { fmtDate } from "@/lib/format"
import { precio } from "@/lib/plans"
import { ESTADOS, TIPOS, type FeedbackEstado, type FeedbackTipo } from "@/lib/content/opiniones"
import { AssignPlanDialog, usePlanOptions } from "./console-negocio"
import { adminAddNote, adminDeleteNote, adminDeleteUser, adminRecoveryLink, adminSetPlatformAdmin, adminSetSuspended, adminUser } from "./server"
import { tablaLabel } from "@/lib/admin-nav"

const rel = (d?: string | null) => (d ? formatDistanceToNowStrict(new Date(d), { locale: es, addSuffix: true }) : "Nunca")
const ROL: Record<string, string> = { owner: "Dueño", editor: "Editor", viewer: "Lector" }

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b py-2 text-sm last:border-0"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{v || "—"}</span></div>
}

/** Ficha de una persona: perfil, hogares, plan, pagos, actividad, opiniones, notas y acciones de cuenta. */
export function UserDetail() {
  const { id } = useParams<{ id: string }>()
  const { user: me } = useApp()
  const router = useRouter()
  const qc = useQueryClient()
  const { data: u, isPending, error } = useQuery({ queryKey: ["admin", "user", id], queryFn: () => adminUser(id), retry: false })
  const { data: plans = [] } = usePlanOptions()
  const [assign, setAssign] = useState<{ id: string; nombre: string } | null>(null)
  const [del, setDel] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState("")
  const [nota, setNota] = useState("")
  const [link, setLink] = useState<string | null>(null)
  const pn = (p: string) => plans.find((x) => x.value === p)?.label ?? p
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: ["admin"] }) } catch (e) { toast.error("No se pudo", { description: (e as Error).message }) }
  }
  if (isPending) return <Skeleton className="h-96" />
  if (error || !u) return <Card className="p-8 text-center shadow-card ring-0">No encontramos a esa persona. <Link href="/admin/usuarios" className="text-link underline">Volver a usuarios</Link></Card>
  const self = u.id === me.id
  return (
    <div className="grid gap-5">
      <AdminHeader title={u.perfil?.nombre || u.email} desc={u.email} back={{ href: "/admin/usuarios", label: "Usuarios" }}
        actions={<>
          <Button variant="outline" onClick={async () => { try { const r = await adminRecoveryLink(u.id); toast.success(r.msg); if (r.link) setLink(r.link) } catch (e) { toast.error((e as Error).message) } }}><KeyRound /> Enlace de contraseña</Button>
          {!self && <Button variant="outline" onClick={() => act(() => adminSetSuspended(u.id, !u.suspendido), u.suspendido ? "Cuenta reactivada" : "Cuenta suspendida")}>{u.suspendido ? <><UserCheck /> Reactivar</> : <><Ban /> Suspender</>}</Button>}
          {!self && <Button variant="outline" onClick={() => act(() => adminSetPlatformAdmin(u.id, !u.isAdmin), u.isAdmin ? "Ya no es administrador" : "Ahora es administrador")}>{u.isAdmin ? <><ShieldOff /> Quitar admin</> : <><ShieldCheck /> Hacer admin</>}</Button>}
          {!self && <Button variant="outline" className="text-danger" onClick={() => setDel(true)}><Trash2 /> Eliminar</Button>}
        </>} />
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <Card className="gap-3 p-5 shadow-card ring-0">
            <div className="flex items-center gap-3"><UserAvatar src={u.perfil?.avatar_url ?? null} name={u.perfil?.nombre || u.email} className="size-14" /><div className="grid gap-1"><p className="font-semibold">{u.perfil?.nombre || "Sin nombre"}</p><div className="flex flex-wrap gap-1">{u.suspendido && <StatusPill tone="vencido">Suspendida</StatusPill>}{u.isAdmin && <StatusPill tone="info">Administrador</StatusPill>}{!u.confirmado && <StatusPill tone="porVencer">Correo sin confirmar</StatusPill>}</div></div></div>
            <div>
              <Row k="Correo" v={u.email} /><Row k="Teléfono" v={u.perfil?.telefono} /><Row k="Ciudad" v={u.perfil?.ciudad} />
              <Row k="Documento" v={u.perfil?.doc ? `${u.perfil.doc_tipo} ${u.perfil.doc}` : ""} /><Row k="Ocupación" v={u.perfil?.ocupacion || u.perfil?.trabajo} />
              <Row k="Entra con" v={u.acceso} /><Row k="Verificación en dos pasos" v={u.mfa ? "Activa" : "No"} />
              <Row k="Registro" v={fmtDate(u.creado.slice(0, 10), { year: true })} /><Row k="Último ingreso" v={rel(u.ultimoIngreso)} />
              <Row k="Términos aceptados" v={u.terminos || "Sin registro"} />
              {u.perfil?.deletion_requested_at && <Row k="Pidió borrar su cuenta" v={fmtDate(u.perfil.deletion_requested_at.slice(0, 10))} />}
            </div>
          </Card>
          <Card className="gap-3 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Notas internas</h2>
            <div className="grid gap-2"><Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Solo las ven los administradores" aria-label="Nueva nota" /><Button size="sm" className="w-fit" disabled={!nota.trim()} onClick={() => act(async () => { await adminAddNote(u.id, nota); setNota("") }, "Nota guardada")}>Guardar nota</Button></div>
            <ul className="grid gap-2">{u.notas.map((n) => <li key={n.id} className="rounded-lg bg-secondary/60 p-2 text-sm"><p className="whitespace-pre-wrap">{n.texto}</p><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{rel(n.created_at)}</span><button type="button" className="hover:text-danger" onClick={() => act(() => adminDeleteNote(n.id), "Nota borrada")}>Borrar</button></div></li>)}</ul>
          </Card>
        </div>
        <div className="grid content-start gap-5">
          <Card className="gap-3 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Hogares</h2>
            {!u.hogares.length ? <p className="text-sm text-muted-foreground">No pertenece a ningún hogar.</p> : u.hogares.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-secondary/40 p-3">
                <div className="grid min-w-0 flex-1"><p className="font-medium">{h.nombre} <span className="text-sm font-normal text-muted-foreground">· {ROL[h.rol] ?? h.rol}</span></p><p className="text-xs text-muted-foreground">{h.integrantes} integrante{h.integrantes === 1 ? "" : "s"} · {h.libros.length} libro{h.libros.length === 1 ? "" : "s"}: {h.libros.join(", ") || "—"}</p></div>
                <StatusPill tone={h.plan === "gratis" ? "gray" : "pagado"}>{pn(h.plan)}</StatusPill>
                <Button size="sm" variant="outline" onClick={() => setAssign({ id: h.id, nombre: h.nombre })}><Crown /> Asignar plan</Button>
              </div>
            ))}
          </Card>
          <Card className="gap-3 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Suscripciones y pagos</h2>
            {!u.suscripciones.length && !u.pagos.length ? <p className="text-sm text-muted-foreground">Sin suscripciones ni pagos.</p> : (
              <div className="grid gap-3 text-sm">
                {u.suscripciones.map((s) => <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"><span>{pn(s.plan)} · {s.proveedor === "manual" ? "asignado por Mirai" : s.proveedor} · {s.periodo === "anio" ? "anual" : "mensual"}{s.nota ? ` · ${s.nota}` : ""}</span><span className="text-muted-foreground">{s.estado} · vence {s.vence_at ? fmtDate(s.vence_at.slice(0, 10), { year: true }) : "—"}</span></div>)}
                {u.pagos.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2"><span>{fmtDate((p.paid_at ?? p.created_at).slice(0, 10))} · {pn(p.plan ?? "premium")} · {p.proveedor}{p.cupon ? ` · cupón ${p.cupon}` : ""}{p.factura_ref ? ` · factura ${p.factura_ref}` : ""}</span><span className="font-semibold tabular-nums">{precio(p.monto)} <span className="font-normal text-muted-foreground">({p.estado})</span></span></div>)}
              </div>
            )}
          </Card>
          <Card className="gap-3 p-5 shadow-card ring-0">
            <div className="flex items-baseline justify-between"><h2 className="font-semibold">Actividad</h2><span className="text-sm text-muted-foreground">{u.actividad.total30} acciones en 30 días</span></div>
            <div className="flex flex-wrap gap-2">{u.actividad.porTabla.map(([t, n]) => <StatusPill key={t} tone="gray">{tablaLabel(t)}: {n}</StatusPill>)}</div>
            <ul className="grid gap-1 text-sm">{u.actividad.ultimas.map((a, i) => <li key={i} className="flex justify-between gap-2"><span>{a.accion} en {tablaLabel(a.tabla)}</span><span className="text-muted-foreground">{rel(a.created_at)}</span></li>)}</ul>
            <p className="text-xs text-muted-foreground">Por privacidad no se muestran montos ni detalles de sus movimientos.</p>
          </Card>
          <Card className="gap-3 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Opiniones</h2>
            {!u.opiniones.length ? <p className="text-sm text-muted-foreground">No ha enviado opiniones.</p> : u.opiniones.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-2 text-sm"><StatusPill tone="info">{TIPOS[f.tipo as FeedbackTipo]?.label ?? f.tipo}</StatusPill>{f.rating && <span>{"★".repeat(f.rating)}</span>}<span className="min-w-0 flex-1 truncate">{f.mensaje}</span><StatusPill tone={ESTADOS[f.estado as FeedbackEstado]?.tone ?? "gray"}>{ESTADOS[f.estado as FeedbackEstado]?.label ?? f.estado}</StatusPill></div>
            ))}
            {!!u.opiniones.length && <Link href="/admin/opiniones" className="text-sm text-link hover:underline">Responder en Opiniones</Link>}
          </Card>
        </div>
      </div>
      {assign && <AssignPlanDialog householdId={assign.id} nombre={assign.nombre} open onOpenChange={(o) => !o && setAssign(null)} />}
      <ResponsiveDialog open={!!link} onOpenChange={(o) => !o && setLink(null)} title="Enlace para crear contraseña" description="Compártelo solo con la persona, por un canal seguro. Vence en 1 hora.">
        <div className="grid gap-3 pb-2"><Input readOnly value={link ?? ""} aria-label="Enlace" onFocus={(e) => e.target.select()} /><Button onClick={() => { navigator.clipboard.writeText(link ?? ""); toast.success("Enlace copiado") }}><Mail /> Copiar enlace</Button></div>
      </ResponsiveDialog>
      <ResponsiveDialog open={del} onOpenChange={setDel} title="Eliminar cuenta" description="Se borra la cuenta y los hogares donde es la única persona, con todos sus datos. No se puede deshacer.">
        <div className="grid gap-3 pb-2">
          <p className="text-sm">Escribe <b>{u.email}</b> para confirmar.</p>
          <Input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} aria-label="Correo para confirmar" />
          <Button variant="destructive" disabled={confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()} onClick={async () => { try { await adminDeleteUser(u.id, confirmEmail); toast.success("Cuenta eliminada"); router.push("/admin/usuarios") } catch (e) { toast.error((e as Error).message) } }}><Trash2 /> Eliminar definitivamente</Button>
        </div>
      </ResponsiveDialog>
    </div>
  )
}
