"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@/lib/query"
import { Check, Crown, X } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Notice } from "@/components/mirai/notice"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { ROLE_INFO, type AccessRole } from "@/lib/household/roles"
import { DEFAULT_FROM_ROLE, FROM_ROLES, nameMatches, transferSummary } from "@/lib/household/transfer"
import { fmtVence } from "@/lib/household/invites"
import { Confirm, RolePicker } from "@/features/household/roles-ui"
import { cancelTransfer, loadTransferCandidates, requestTransfer, respondTransfer } from "./api"
import { useRefreshAccount } from "./use-account"
import type { TransferView } from "./types"

/**
 * "Pasar el hogar": escoger a la persona (solo quien ya tiene cuenta y es del hogar), qué rol quedas tú (por defecto
 * Administra), qué pasa con el pago del plan, escribir el nombre del hogar y confirmar. Queda pendiente hasta que
 * la otra persona acepte (7 días).
 */
export function TransferDialog({ householdId, open, onOpenChange, preselect, onDone }: { householdId: string; open: boolean; onOpenChange: (o: boolean) => void; preselect?: string | null; onDone?: () => void }) {
  const refresh = useRefreshAccount()
  const { data, isPending } = useQuery({ queryKey: ["transfer-candidates", householdId], queryFn: () => loadTransferCandidates(householdId), enabled: open })
  const [to, setTo] = useState(preselect ?? "")
  const [rol, setRol] = useState<AccessRole>(DEFAULT_FROM_ROLE)
  const [plan, setPlan] = useState<"seguir" | "cancelar">("seguir")
  const [typed, setTyped] = useState("")
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const people = (data?.people ?? []).filter((p) => p.ok)
  const sel = people.find((p) => p.userId === to)
  const hogar = data?.hogar ?? ""
  const ready = !!sel && nameMatches(typed, hogar)

  const send = async () => {
    if (!sel) return
    setBusy(true)
    const r = await requestTransfer({ householdId, userId: sel.userId, fromRole: rol as Exclude<AccessRole, "owner">, planAction: plan, confirm: typed }).catch(() => ({ ok: false, msg: "No pudimos enviar la solicitud. Intenta de nuevo." }))
    setBusy(false)
    if (!r.ok) return toast.error(r.msg)
    toast.success(r.msg)
    onOpenChange(false)
    refresh(); onDone?.()
  }

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange} wide title="Pasar el hogar a otra persona"
        description="La otra persona será la dueña: el plan y borrar el hogar quedarán en sus manos. Tú sigues en el hogar con el rol que escojas."
        footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!ready} loading={busy} loadingText="Enviando…" onClick={() => setAsk(true)} hint={!sel ? "Escoge a quién le pasas el hogar" : "Escribe el nombre del hogar para confirmar"}>Pasar el hogar</SubmitButton></>}>
        {isPending || !data ? <div className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-32" /></div> : !data.ok ? <Notice tone="warn" title="No puedes pasar este hogar">{data.msg}</Notice> : !people.length ? (
          <Notice tone="info" title="Aún no hay a quién pasárselo">Solo puedes pasarle el hogar a alguien que ya tenga su cuenta y haga parte del hogar. <Link className="text-link underline" href="/ajustes?tab=hogar">Invítala primero</Link> y, cuando acepte, vuelve aquí.</Notice>
        ) : (
          <div className="grid gap-5">
            <section className="grid gap-2" aria-label="A quién">
              <h3 className="text-sm font-semibold">1. ¿A quién le pasas el hogar?</h3>
              <ChoiceCards name="pasar-a" value={to} onChange={setTo} cols={2}
                items={people.map((p) => ({ value: p.userId, label: p.nombre, desc: `${p.email ?? ""} · Hoy: ${ROLE_INFO[p.access].label}`, icon: "user-round" }))} />
            </section>
            <section className="grid gap-2" aria-label="Tu rol">
              <h3 className="text-sm font-semibold">2. ¿Qué rol quedas tú?</h3>
              <RolePicker name="mi-rol" value={rol} onChange={setRol} roles={FROM_ROLES} />
            </section>
            {data.tienePago && (
              <section className="grid gap-2" aria-label="Pago del plan">
                <h3 className="text-sm font-semibold">3. Tú pagas la renovación automática del plan. ¿Qué hacemos?</h3>
                <ChoiceCards name="pago-plan" value={plan} onChange={(v) => setPlan(v as typeof plan)} cols={2} items={[
                  { value: "seguir", label: "Sigo pagándola yo", desc: "Se sigue cobrando a tu tarjeta hasta que la canceles en Mi plan.", icon: "credit-card" },
                  { value: "cancelar", label: "Cancelarla al aceptar", desc: "El plan sigue hasta su fecha y luego el dueño nuevo decide si lo paga.", icon: "ban" },
                ]} />
              </section>
            )}
            {sel && (
              <Notice tone="info" title="Qué cambia">
                <ul className="ml-4 grid list-disc gap-1">{transferSummary({ hogar, para: sel.nombre, fromRole: rol, planAction: plan, tienePago: data.tienePago }).map((l) => <li key={l}>{l}</li>)}</ul>
              </Notice>
            )}
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="pasar-confirma">Para confirmar, escribe el nombre del hogar: <b>{hogar}</b>
              <Input id="pasar-confirma" className="h-11" autoComplete="off" placeholder={hogar} value={typed} onChange={(e) => setTyped(e.target.value)} />
            </label>
          </div>
        )}
      </ResponsiveDialog>
      <Confirm open={ask} onOpenChange={setAsk} title={`¿Pasarle el hogar a ${sel?.nombre ?? ""}?`} action="Sí, pasarle el hogar"
        desc={<>Le llegará un aviso para aceptar o rechazar (tiene 7 días). Cuando acepte, será el <b>Dueño del hogar</b> y tú quedarás como <b>{ROLE_INFO[rol].label}</b>. El cambio queda en el historial.</>}
        onConfirm={() => { setAsk(false); send() }} />
    </>
  )
}

/** Solicitudes que te hicieron para ser dueño: Aceptar o Rechazar. */
export function IncomingTransfers({ items }: { items: TransferView[] }) {
  const refresh = useRefreshAccount()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [ask, setAsk] = useState<{ t: TransferView; accept: boolean } | null>(null)
  if (!items.length) return null
  const go = async (t: TransferView, accept: boolean) => {
    setBusy(t.id)
    const r = await respondTransfer(t.id, accept).catch(() => ({ ok: false, msg: "Intenta de nuevo en un momento." }))
    setBusy(null)
    if (!r.ok) toast.error(r.msg); else toast.success(r.msg)
    refresh(); router.refresh()
  }
  return (
    <div className="grid gap-3">
      {items.map((t) => (
        <div key={t.id} className="grid gap-3 rounded-xl border border-brand/40 bg-brand-soft/40 p-4" data-transfer="entrante">
          <p className="flex items-start gap-2"><Crown className="mt-0.5 size-5 shrink-0 text-brand" /><span><b>{t.de}</b> quiere pasarte el hogar <b>“{t.hogar}”</b>. Serás el dueño: el plan y borrar el hogar quedarán en tus manos; {t.de} quedará como {ROLE_INFO[t.fromRole].label}.</span></p>
          <p className="text-xs text-muted-foreground">Tienes hasta el {fmtVence(t.expiresAt)} para responder.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy === t.id} onClick={() => setAsk({ t, accept: true })}>{busy === t.id ? <Spinner /> : <Check />} Aceptar</Button>
            <Button variant="outline" disabled={busy === t.id} onClick={() => setAsk({ t, accept: false })}><X /> Rechazar</Button>
          </div>
        </div>
      ))}
      <Confirm open={!!ask} onOpenChange={(o) => !o && setAsk(null)} danger={ask ? !ask.accept : false}
        title={ask?.accept ? `¿Ser el dueño de “${ask.t.hogar}”?` : "¿Rechazar la solicitud?"} action={ask?.accept ? "Aceptar" : "Rechazar"}
        desc={ask?.accept ? "Desde ahora tú cambias o pagas el plan y puedes borrar el hogar. Nada se borra al aceptar." : `${ask?.t.de ?? ""} sigue siendo el dueño del hogar. Le avisaremos que no aceptaste.`}
        onConfirm={() => { const x = ask; setAsk(null); if (x) go(x.t, x.accept) }} />
    </div>
  )
}

/** Solicitud que enviaste y aún no responden: con Cancelar. */
export function OutgoingTransfer({ t }: { t: TransferView }) {
  const refresh = useRefreshAccount()
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/60 p-3 text-sm" data-transfer="saliente">
      <StatusPill tone="porVencer">Esperando respuesta</StatusPill>
      <span className="min-w-0 flex-1">Le pediste a <b>{t.para}</b> que sea el dueño. Tiene hasta el {fmtVence(t.expiresAt)}.</span>
      <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={async () => {
        setBusy(true)
        const r = await cancelTransfer(t.id).catch(() => ({ ok: false, msg: "Intenta de nuevo." }))
        setBusy(false)
        if (!r.ok) return toast.error(r.msg)
        toast.success(r.msg); refresh()
      }}>{busy ? <Spinner /> : <X />} Cancelar solicitud</Button>
    </div>
  )
}

/** Botones Aceptar/Rechazar dentro de la campana (aviso "quiere pasarte el hogar"). */
export function TransferBellActions({ transferId, onDone }: { transferId: string; onDone: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState<"si" | "no" | null>(null)
  const go = async (accept: boolean) => {
    setBusy(accept ? "si" : "no")
    const r = await respondTransfer(transferId, accept).catch(() => ({ ok: false, msg: "Intenta de nuevo en un momento." }))
    setBusy(null)
    if (!r.ok) toast.error(r.msg); else toast.success(r.msg)
    onDone(); router.refresh()
  }
  return (
    <div className="flex gap-2 pb-2 pl-[70px]">
      <Button size="sm" disabled={!!busy} onClick={() => go(true)}>{busy === "si" ? <Spinner /> : <Check />} Aceptar</Button>
      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => go(false)}>{busy === "no" ? <Spinner /> : <X />} Rechazar</Button>
    </div>
  )
}
