"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNowStrict } from "date-fns"
import { es } from "date-fns/locale"
import { ArrowRight, Crown, Download, ExternalLink, LogOut, Trash2, UserX } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { EmptyState } from "@/components/mirai/empty-state"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { switchBook } from "@/components/app/actions"
import { deviceName, emailChangeState, eventText, signInMethods } from "@/lib/account/account"
import { nameMatches } from "@/lib/household/transfer"
import { Confirm, RolePill } from "@/features/household/roles-ui"
import { deleteHousehold, leaveHousehold, revokeSession, signOutEverywhere } from "@/features/account/actions"
import { IncomingTransfers, OutgoingTransfer, TransferDialog } from "@/features/account/transfer"
import { useAccount, useRefreshAccount } from "@/features/account/use-account"
import type { MyHousehold } from "@/features/account/types"
import { SettingRow, SettingSection, SettingSkeleton, SettingStack } from "../ui"

const ago = (iso: string | null | undefined) => (iso ? formatDistanceToNowStrict(new Date(iso), { locale: es, addSuffix: true }) : "—")

/**
 * Ajustes › Tu cuenta: resumen de las formas de entrar (se administran en Perfil › Cuentas conectadas), solicitudes
 * para ser dueño, tus hogares (abrir, pasar, salir o borrar), sesiones abiertas, actividad de seguridad y tus datos.
 */
export function CuentaTab() {
  const { data, isPending } = useAccount()
  const refresh = useRefreshAccount()
  const router = useRouter()
  const qc = useQueryClient()
  const [pasar, setPasar] = useState<MyHousehold | null>(null)
  const [salir, setSalir] = useState<MyHousehold | null>(null)
  const [borrar, setBorrar] = useState<MyHousehold | null>(null)
  const [typed, setTyped] = useState("")
  const [todas, setTodas] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [nEv, setNEv] = useState(10)
  if (isPending || !data) return <SettingSkeleton sections={4} />
  const { account, sessions, events, households, incoming } = data
  const methods = signInMethods(account).filter((m) => m.kind !== "magic")
  const pend = emailChangeState(account)

  const run = async (k: string, f: () => Promise<{ ok: boolean; msg: string }>, after?: () => void) => {
    setBusy(k)
    const r = await f().catch(() => ({ ok: false, msg: "Intenta de nuevo en un momento." }))
    setBusy(null)
    if (!r.ok) return toast.error(r.msg)
    toast.success(r.msg)
    refresh(); after?.()
  }
  const open = async (h: MyHousehold) => {
    if (!h.firstBook) return
    setBusy(`open:${h.id}`)
    try { await switchBook(h.firstBook); qc.clear(); router.push("/inicio"); router.refresh() } catch { toast.error("No pudimos abrir ese hogar.") }
    setBusy(null)
  }

  return (
    <SettingStack>
      <SettingSection icon="link" title="Formas de entrar y correo" desc="Cambia tu correo o tu cuenta de Google sin perder nada: tus datos están en tu cuenta, no en el correo.">
        <SettingRow title={account.email ?? ""} desc={<span className="flex flex-wrap gap-1.5 pt-1">{methods.map((m) => <StatusPill key={m.key} tone="gray">{m.kind === "google" ? `Google · ${m.detail}` : "Correo y contraseña"}</StatusPill>)}{pend.estado === "pendiente" && <StatusPill tone="porVencer">Cambio a {pend.to} pendiente</StatusPill>}</span>}>
          <Button variant="outline" asChild><Link href="/perfil#cuentas">Cambiar correo o cuentas <ArrowRight /></Link></Button>
        </SettingRow>
      </SettingSection>

      {!!incoming.length && (
        <SettingSection icon="crown" title="Te quieren pasar un hogar" desc="Si aceptas, serás el dueño del hogar.">
          <IncomingTransfers items={incoming} />
        </SettingSection>
      )}

      <SettingSection icon="house" title="Tus hogares" desc="Los hogares en los que estás. El dueño puede pasárselo a otra persona; los demás pueden salir cuando quieran.">
        <ul className="grid" aria-label="Tus hogares">
          {households.map((h) => (
            <li key={h.id} className="grid gap-2 border-b py-3 first:pt-0 last:border-0 last:pb-0" data-hogar={h.nombre}>
              <div className="flex flex-wrap items-center gap-3">
                <ToneIcon icon={h.access === "owner" ? "crown" : "house"} tone={h.access === "owner" ? "amber" : "gray"} className="rounded-[28%]" />
                <div className="grid min-w-0 flex-1 gap-1">
                  <p className="truncate font-medium">{h.nombre}</p>
                  <div className="flex flex-wrap items-center gap-1.5"><RolePill role={h.access} /><StatusPill tone="gray">{h.personas} {h.personas === 1 ? "persona" : "personas"} con cuenta</StatusPill>{h.active && <StatusPill tone="ok">Estás aquí</StatusPill>}</div>
                </div>
                <div className="flex flex-wrap gap-1 max-sm:w-full max-sm:justify-end">
                  {!h.active && h.firstBook && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => open(h)}>{busy === `open:${h.id}` ? <Spinner /> : <ExternalLink />} Abrir</Button>}
                  {h.access === "owner" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setPasar(h)}><Crown /> Pasar el hogar</Button>
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => { setTyped(""); setBorrar(h) }}><Trash2 /> Borrar</Button>
                    </>
                  ) : <Button size="sm" variant="ghost" className="text-danger" disabled={!!busy} onClick={() => setSalir(h)}><LogOut /> Salir</Button>}
                </div>
              </div>
              {h.outgoing && <OutgoingTransfer t={h.outgoing} />}
            </li>
          ))}
        </ul>
      </SettingSection>

      <SettingSection icon="smartphone" title="Sesiones abiertas" desc="Dónde tienes abierto Mirai. Si ves un dispositivo que no reconoces, ciérralo y cambia tu contraseña.">
        {!sessions.length ? <p className="text-sm text-muted-foreground">No encontramos sesiones abiertas.</p> : (
          <ul className="grid" aria-label="Sesiones abiertas">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 border-b py-2.5 first:pt-0 last:border-0">
                <ToneIcon icon={/iPhone|Android|Mobile/.test(s.user_agent ?? "") ? "smartphone" : "laptop"} tone={s.actual ? "green" : "gray"} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{deviceName(s.user_agent)}{s.actual && <span className="text-muted-foreground"> · este dispositivo</span>}</p>
                  <p className="text-xs text-muted-foreground">Entró {ago(s.created_at)} · activo {ago(s.last_active)}{s.ip ? ` · IP ${s.ip}` : ""}</p>
                </div>
                {s.actual ? <StatusPill tone="ok">Aquí estás</StatusPill> : <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => run(s.id, () => revokeSession(s.id))}>{busy === s.id ? <Spinner /> : <LogOut />} Cerrar</Button>}
              </li>
            ))}
          </ul>
        )}
        <div className="pt-3"><Button variant="outline" onClick={() => setTodas(true)}><LogOut /> Cerrar sesión en todos los dispositivos</Button></div>
      </SettingSection>

      <SettingSection icon="history" title="Actividad de seguridad" desc="Inicios de sesión y cambios de correo, contraseña, formas de entrar y dueño del hogar.">
        {!events.length ? <EmptyState iso="ajustes" title="Aún no hay actividad registrada" description="Desde ahora verás aquí cada inicio de sesión y cada cambio en tu cuenta." /> : (
          <ul className="grid" aria-label="Actividad de seguridad">
            {events.slice(0, nEv).map((e) => {
              const t = eventText(e)
              return (
                <li key={e.id} className="flex items-start gap-3 border-b py-2.5 text-sm first:pt-0 last:border-0">
                  <ToneIcon icon={t.icon} tone={t.tone === "warn" ? "amber" : t.tone === "ok" ? "green" : t.tone === "info" ? "blue" : "gray"} size="sm" />
                  <div className="min-w-0 flex-1"><p className="break-words">{t.text}</p>
                    <p className="text-xs text-muted-foreground"><time dateTime={e.created_at} title={new Date(e.created_at).toLocaleString("es-CO")}>{ago(e.created_at)}</time>{e.user_agent ? ` · ${deviceName(e.user_agent)}` : ""}</p></div>
                </li>
              )
            })}
          </ul>
        )}
        {events.length > nEv && <Button variant="outline" size="sm" className="mt-3 w-fit" onClick={() => setNEv(nEv + 20)}>Ver más</Button>}
      </SettingSection>

      <SettingSection icon="database" title="Tus datos" desc="Ley 1581 de 2012: puedes descargar y eliminar la información que Mirai guarda sobre ti.">
        <SettingRow title="Descargar todos mis datos" desc="Perfil, preferencias, consentimientos y tus libros en un archivo."><Button variant="outline" asChild><Link href="/ajustes?tab=respaldo"><Download /> Ir a descargar</Link></Button></SettingRow>
        <SettingRow title="Eliminar mi cuenta" desc={households.some((h) => h.access === "owner" && h.personas > 1) ? "Antes pásale a otra persona (o borra) los hogares donde eres dueño y hay más personas." : "Se borra tu cuenta y los hogares donde eres la única persona."}>
          <Button variant="outline" className="text-danger" asChild><Link href="/ajustes?tab=respaldo#eliminar"><UserX /> Eliminar cuenta</Link></Button>
        </SettingRow>
      </SettingSection>

      {pasar && <TransferDialog householdId={pasar.id} open={!!pasar} onOpenChange={(o) => !o && setPasar(null)} onDone={() => router.refresh()} />}
      <Confirm open={!!salir} onOpenChange={(o) => !o && setSalir(null)} danger title={`¿Salir de “${salir?.nombre ?? ""}”?`} action="Salir del hogar"
        desc="Dejarás de ver este hogar. Tus gastos e ingresos se quedan a tu nombre como integrante sin cuenta y los accesos del contador que creaste se cierran. Para volver, alguien tendrá que invitarte."
        onConfirm={() => { const h = salir; setSalir(null); if (h) run(`salir:${h.id}`, () => leaveHousehold(h.id), () => { qc.clear(); router.refresh() }) }} />
      <Confirm open={todas} onOpenChange={setTodas} danger title="¿Cerrar sesión en todos los dispositivos?" action="Cerrar en todos"
        desc="Se cierra Mirai en todos lados, también aquí. Tendrás que volver a entrar en cada dispositivo."
        onConfirm={async () => { setTodas(false); const r = await signOutEverywhere().catch(() => ({ ok: false, msg: "Intenta de nuevo." })); if (!r.ok) return toast.error(r.msg); qc.clear(); router.replace("/login?salida=todas") }} />
      <ResponsiveDialog open={!!borrar} onOpenChange={(o) => !o && setBorrar(null)} title={`Borrar “${borrar?.nombre ?? ""}”`}
        description="Se borran para siempre sus libros, movimientos, personas y archivos. Las demás personas dejan de verlo. Descarga antes una copia si la quieres."
        footer={<><Button variant="outline" onClick={() => setBorrar(null)}>Cancelar</Button>
          <Button variant="destructive" disabled={!borrar || !nameMatches(typed, borrar.nombre) || busy === "borrar"} onClick={() => { const h = borrar!; run("borrar", () => deleteHousehold(h.id, typed), () => { setBorrar(null); qc.clear(); router.refresh() }) }}>{busy === "borrar" && <Spinner />} Borrar para siempre</Button></>}>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="borrar-hogar">Para confirmar, escribe el nombre del hogar: <b>{borrar?.nombre}</b>
          <Input id="borrar-hogar" className="h-11" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
      </ResponsiveDialog>
    </SettingStack>
  )
}
