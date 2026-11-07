"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { Ban, Copy, Crown, KeyRound, ShieldCheck, ShieldOff, Trash2, UserCheck } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { Panel } from "@/components/mirai/panel"
import { StatusPill, type PillTone } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { IconButton, Tip } from "@/components/mirai/tip"
import { ToneIcon, toneFor } from "@/components/mirai/tone-icon"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { useApp } from "@/components/app/app-context"
import { AdminHeader } from "@/components/admin/admin-shell"
import { fmtDate } from "@/lib/format"
import { precio } from "@/lib/plans"
import { ESTADOS, TIPOS, type FeedbackEstado, type FeedbackTipo } from "@/lib/content/opiniones"
import { AssignPlanDialog, usePlanOptions } from "./console-negocio"
import { adminAddNote, adminDeleteNote, adminDeleteUser, adminRecoveryLink, adminSetPlatformAdmin, adminSetSuspended, adminUser } from "./api"
import { tablaLabel } from "@/lib/admin-nav"
import { AdminSkeleton, Empty, InfoRow, rel, SeeAll, useAsk, useDialogTarget } from "./ui"

const ROL: Record<string, string> = { owner: "Dueño", editor: "Editor", viewer: "Lector" }
const SUB_N: Record<string, string> = { activa: "Activa", cortesia: "Cortesía", cancelada: "No se renueva", vencida: "Vencida", pendiente: "Pendiente" }
const PAY_N: Record<string, [PillTone, string]> = { aprobado: ["pagado", "Aprobado"], rechazado: ["vencido", "Rechazado"], reembolsado: ["gray", "Devuelto"], anulado: ["gray", "Anulado"], pendiente: ["porVencer", "Pendiente"] }
const PROV: Record<string, string> = { mercadopago: "Mercado Pago", wompi: "Wompi", manual: "asignado por Mirai" }

/** Ficha de una persona: perfil, hogares, plan, pagos, actividad, opiniones, notas y acciones de cuenta. */
export function UserDetail() {
  const { id } = useParams<{ id: string }>()
  const { user: me } = useApp()
  const router = useRouter()
  const qc = useQueryClient()
  const ask = useAsk()
  const { data: u, isPending, error } = useQuery({ queryKey: ["admin", "user", id], queryFn: () => adminUser(id), retry: false })
  const { data: plans = [] } = usePlanOptions()
  const assign = useDialogTarget<{ id: string; nombre: string }>()
  const [del, setDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState("")
  const [nota, setNota] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const pn = (p: string) => plans.find((x) => x.value === p)?.label ?? p
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: ["admin"] }); return true } catch (e) { toast.error("No se pudo", { description: (e as Error).message }); return false }
  }
  if (isPending) return <AdminSkeleton kind="split" />
  if (error || !u) return (
    <Card className="items-center gap-3 p-8 text-center shadow-card ring-0">
      <ToneIcon icon="user-x" tone="gray" size="lg" />
      <p className="font-semibold">No encontramos a esa persona.</p>
      <Button variant="outline" asChild><Link href="/admin/usuarios">Volver a usuarios</Link></Button>
    </Card>
  )
  const self = u.id === me.id
  const nombre = u.perfil?.nombre || u.email
  const suspender = async () => {
    if (!u.suspendido && !(await ask.confirm({ title: `¿Suspender la cuenta de ${nombre}?`, description: "No podrá entrar a Mirai hasta que la reactives. Sus datos no se borran.", confirmLabel: "Suspender", destructive: true }))) return
    void act(() => adminSetSuspended(u.id, !u.suspendido), u.suspendido ? "Cuenta reactivada" : "Cuenta suspendida")
  }
  const toggleAdmin = async () => {
    if (!(await ask.confirm(u.isAdmin
      ? { title: `¿Quitarle la administración a ${nombre}?`, description: "Ya no podrá entrar a la consola.", confirmLabel: "Quitar admin", destructive: true }
      : { title: `¿Hacer administrador a ${nombre}?`, description: "Verá la consola completa: clientes, pagos e integraciones. Dalo solo a personas de confianza.", confirmLabel: "Hacer admin" }))) return
    void act(() => adminSetPlatformAdmin(u.id, !u.isAdmin), u.isAdmin ? "Ya no es administrador" : "Ahora es administrador")
  }
  const saveNote = async () => { setSavingNote(true); if (await act(() => adminAddNote(u.id, nota.trim()), "Nota guardada")) setNota(""); setSavingNote(false) }
  const borrar = async () => {
    setDeleting(true)
    try { await adminDeleteUser(u.id, confirmEmail); toast.success("Cuenta eliminada"); router.push("/admin/usuarios") }
    catch (e) { toast.error((e as Error).message) }
    finally { setDeleting(false) }
  }
  return (
    <div className="grid gap-6">
      <AdminHeader title={nombre} desc={u.email} back={{ href: "/admin/usuarios", label: "Usuarios" }}
        media={<UserAvatar src={u.perfil?.avatar_url ?? null} name={nombre} className="size-12" />}
        actions={<>
          <Button variant="outline" onClick={async () => { try { const r = await adminRecoveryLink(u.id); toast.success(r.msg); if (r.link) setLink(r.link) } catch (e) { toast.error((e as Error).message) } }}><KeyRound /> Enlace de contraseña</Button>
          {!self && <Button variant="outline" onClick={suspender}>{u.suspendido ? <><UserCheck /> Reactivar</> : <><Ban /> Suspender</>}</Button>}
          {!self && <Button variant="outline" onClick={toggleAdmin}>{u.isAdmin ? <><ShieldOff /> Quitar admin</> : <><ShieldCheck /> Hacer admin</>}</Button>}
          {!self && <Button variant="outline" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => { setConfirmEmail(""); setDel(true) }}><Trash2 /> Eliminar</Button>}
        </>} />
      <div className="grid items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="grid gap-6">
          <Panel title="Perfil" icon="user-round" action={<div className="flex flex-wrap justify-end gap-1">{u.suspendido && <StatusPill tone="vencido">Suspendida</StatusPill>}{u.isAdmin && <StatusPill tone="info">Administrador</StatusPill>}{!u.confirmado && <Tip label="Aún no abre el enlace de confirmación que le llegó al correo"><span className="inline-flex"><StatusPill tone="porVencer">Correo sin confirmar</StatusPill></span></Tip>}</div>}>
            <div>
              <InfoRow k="Correo" v={u.email} /><InfoRow k="Teléfono" v={u.perfil?.telefono} /><InfoRow k="Ciudad" v={u.perfil?.ciudad} />
              <InfoRow k="Documento" v={u.perfil?.doc ? `${u.perfil.doc_tipo} ${u.perfil.doc}` : ""} /><InfoRow k="Ocupación" v={u.perfil?.ocupacion || u.perfil?.trabajo} />
              <InfoRow k="Entra con" v={u.acceso} /><InfoRow k="Verificación en dos pasos" v={u.mfa ? "Activa" : "No"} />
              <InfoRow k="Registro" v={fmtDate(u.creado.slice(0, 10), { year: true })} /><InfoRow k="Último ingreso" v={rel(u.ultimoIngreso)} />
              <InfoRow k="Términos aceptados" v={u.terminos || "Sin registro"} />
              {u.perfil?.deletion_requested_at && <InfoRow k="Pidió borrar su cuenta" v={fmtDate(u.perfil.deletion_requested_at.slice(0, 10))} />}
            </div>
          </Panel>
          <Panel title="Notas internas" icon="sticky-note" description="Solo las ven los administradores.">
            <div className="grid gap-2">
              <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Llamó a soporte por el cobro de octubre" aria-label="Nueva nota" />
              <SubmitButton className="w-fit" disabled={!nota.trim()} loading={savingNote} hint="Escribe la nota" onClick={saveNote}>Guardar nota</SubmitButton>
            </div>
            {u.notas.length > 0 && <ul className="grid gap-2">{u.notas.map((n) => (
              <li key={n.id} className="flex items-start gap-2 rounded-lg bg-secondary/60 p-3 text-sm">
                <div className="grid min-w-0 flex-1 gap-1"><p className="whitespace-pre-wrap break-words">{n.texto}</p><span className="text-xs text-muted-foreground">{rel(n.created_at)}</span></div>
                <IconButton label="Borrar nota" icon="trash-2" size="icon-sm" destructive onClick={async () => { if (await ask.confirm({ title: "¿Borrar esta nota?", confirmLabel: "Borrar", destructive: true })) void act(() => adminDeleteNote(n.id), "Nota borrada") }} />
              </li>
            ))}</ul>}
          </Panel>
        </div>
        <div className="grid gap-6">
          <Panel title="Hogares" icon="house">
            {!u.hogares.length ? <Empty>No pertenece a ningún hogar.</Empty> : <ul className="grid gap-2">{u.hogares.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-secondary/40 p-3">
                <ToneIcon icon="house" tone={toneFor(h.nombre)} />
                <div className="grid min-w-0 flex-1"><p className="font-medium">{h.nombre} <span className="text-sm font-normal text-muted-foreground">· {ROL[h.rol] ?? h.rol}</span></p><p className="text-xs text-muted-foreground">{h.integrantes} integrante{h.integrantes === 1 ? "" : "s"} · {h.libros.length} libro{h.libros.length === 1 ? "" : "s"}: {h.libros.join(", ") || "—"}</p></div>
                <StatusPill tone={h.plan === "gratis" ? "gray" : "pagado"}>{pn(h.plan)}</StatusPill>
                <Button size="sm" variant="outline" onClick={() => assign.show({ id: h.id, nombre: h.nombre })}><Crown /> Asignar plan</Button>
              </li>
            ))}</ul>}
          </Panel>
          <Panel title="Suscripciones y pagos" icon="receipt" description="Pagos del plan a Mirai (no son movimientos del hogar).">
            {!u.suscripciones.length && !u.pagos.length ? <Empty>Sin suscripciones ni pagos.</Empty> : (
              <ul className="grid divide-y text-sm">
                {u.suscripciones.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <ToneIcon icon="repeat" tone="blue" size="sm" />
                    <span className="min-w-0 flex-1">{pn(s.plan)} · {PROV[s.proveedor] ?? s.proveedor} · {s.periodo === "anio" ? "anual" : "mensual"}{s.nota ? ` · ${s.nota}` : ""}</span>
                    <span className="text-muted-foreground">{SUB_N[s.estado] ?? s.estado} · vence {s.vence_at ? fmtDate(s.vence_at.slice(0, 10), { year: true }) : "—"}</span>
                  </li>
                ))}
                {u.pagos.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <ToneIcon icon="banknote" tone="green" size="sm" />
                    <span className="min-w-0 flex-1">{fmtDate((p.paid_at ?? p.created_at).slice(0, 10))} · {pn(p.plan ?? "premium")} · {PROV[p.proveedor] ?? p.proveedor}{p.cupon ? ` · cupón ${p.cupon}` : ""}{p.factura_ref ? ` · factura ${p.factura_ref}` : ""}</span>
                    <span className="flex items-center gap-2"><span className="font-semibold tabular-nums">{precio(p.monto)}</span><StatusPill tone={PAY_N[p.estado]?.[0] ?? "gray"}>{PAY_N[p.estado]?.[1] ?? p.estado}</StatusPill></span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Actividad" icon="activity" action={<span className="text-sm text-muted-foreground">{u.actividad.total30} acciones en 30 días</span>}>
            {!u.actividad.total30 && !u.actividad.ultimas.length ? <Empty>Sin actividad reciente.</Empty> : <>
              <div className="flex flex-wrap gap-2">{u.actividad.porTabla.map(([t, n]) => <StatusPill key={t} tone="gray">{tablaLabel(t)}: {n}</StatusPill>)}</div>
              <ul className="grid divide-y text-sm">{u.actividad.ultimas.map((a, i) => <li key={i} className="flex justify-between gap-2 py-1.5"><span>{a.accion} en {tablaLabel(a.tabla)}</span><span className="shrink-0 text-muted-foreground">{rel(a.created_at)}</span></li>)}</ul>
            </>}
            <p className="text-xs text-muted-foreground">Por privacidad no se muestran montos ni detalles de sus movimientos.</p>
          </Panel>
          <Panel title="Opiniones" icon="message-square-heart" action={u.opiniones.length ? <SeeAll href="/admin/opiniones">Responder en Opiniones</SeeAll> : undefined}>
            {!u.opiniones.length ? <Empty>No ha enviado opiniones.</Empty> : <ul className="grid divide-y">{u.opiniones.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 py-2 text-sm"><StatusPill tone="info">{TIPOS[f.tipo as FeedbackTipo]?.label ?? f.tipo}</StatusPill>{f.rating && <span aria-label={`${f.rating} estrellas`} className="text-amber-500">{"★".repeat(f.rating)}</span>}<span className="min-w-0 flex-1 truncate">{f.mensaje}</span><StatusPill tone={ESTADOS[f.estado as FeedbackEstado]?.tone ?? "gray"}>{ESTADOS[f.estado as FeedbackEstado]?.label ?? f.estado}</StatusPill></li>
            ))}</ul>}
          </Panel>
        </div>
      </div>
      <AssignPlanDialog key={assign.key} householdId={assign.value?.id ?? ""} nombre={assign.value?.nombre ?? ""} open={assign.open} onOpenChange={assign.onOpenChange} />
      <ResponsiveDialog open={!!link} onOpenChange={(o) => !o && setLink(null)} title="Enlace para crear contraseña" description="Compártelo solo con la persona, por un canal seguro. Vence en 1 hora."
        footer={<><Button variant="outline" onClick={() => setLink(null)}>Cerrar</Button><Button onClick={() => { navigator.clipboard.writeText(link ?? ""); toast.success("Enlace copiado") }}><Copy /> Copiar enlace</Button></>}>
        <Input readOnly value={link ?? ""} aria-label="Enlace" className="h-11 font-mono text-xs" onFocus={(e) => e.target.select()} />
      </ResponsiveDialog>
      <ResponsiveDialog open={del} onOpenChange={setDel} title="Eliminar cuenta" description="Se borra la cuenta y los hogares donde es la única persona, con todos sus datos. No se puede deshacer."
        footer={<><Button variant="outline" onClick={() => setDel(false)}>Cancelar</Button><SubmitButton className="bg-danger text-white hover:bg-danger/90" disabled={confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()} loading={deleting} loadingText="Eliminando…" hint="Escribe el correo exacto para confirmar" onClick={borrar}><Trash2 /> Eliminar definitivamente</SubmitButton></>}>
        <div className="grid gap-3">
          <p className="text-sm">Escribe <b className="break-all">{u.email}</b> para confirmar.</p>
          <Input className="h-11" autoComplete="off" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} aria-label="Correo para confirmar" />
        </div>
      </ResponsiveDialog>
      {ask.node}
    </div>
  )
}
