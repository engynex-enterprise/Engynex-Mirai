"use client"

import { useState } from "react"
import { ChevronDown, Copy, MessageCircle, Send, Share2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { FormField } from "@/components/mirai/field"
import { Notice } from "@/components/mirai/notice"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { useAccess } from "@/components/app/app-context"
import { assignableRoles, type AccessRole } from "@/lib/household/roles"
import { deliverySummary, normalizeDest, type LastResult } from "@/lib/household/invites"
import { cn } from "@/lib/utils"
import { invitePerson, markInvitationShared, resendInvitation } from "./actions"
import { parentescoOptions } from "./member-dialog"
import { RoleMatrix, RolePicker } from "./roles-ui"
import type { HouseholdPeople, InviteResult, Share } from "./types"

/** Acciones para hacer llegar la invitación: WhatsApp propio (wa.me), copiar enlace y compartir. */
export function ShareActions({ share, invitationId, compact }: { share: Share; invitationId: string; compact?: boolean }) {
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function"
  return (
    <div className={cn("grid gap-2", compact ? "sm:grid-cols-3" : "sm:grid-cols-3")}>
      <Button asChild className="h-10 bg-[#1F7A4D] text-white hover:bg-[#1F7A4D]/90">
        <a href={share.wa} target="_blank" rel="noopener noreferrer" onClick={() => { void markInvitationShared(invitationId) }}><MessageCircle /> Enviar desde mi WhatsApp</a>
      </Button>
      <Button variant="outline" className="h-10" onClick={async () => {
        try { await navigator.clipboard.writeText(share.url); toast.success("Enlace copiado", { description: "Pégalo en el chat que quieras." }) } catch { toast.error("No pudimos copiar el enlace", { description: share.url }) }
      }}><Copy /> Copiar enlace</Button>
      {canShare && (
        <Button variant="outline" className="h-10" onClick={() => navigator.share({ title: "Invitación a Mirai", text: share.text }).catch(() => {})}><Share2 /> Compartir</Button>
      )}
    </div>
  )
}

/** Cómo salió cada canal (se muestra después de invitar y en la fila de la persona). */
export function DeliveryLines({ result, className }: { result: LastResult | undefined; className?: string }) {
  const lines = deliverySummary(result)
  if (!lines.length) return null
  return (
    <ul className={cn("grid gap-1", className)}>
      {lines.map((l) => <li key={l.text}><StatusPill tone={l.tone === "ok" ? "ok" : l.tone === "bad" ? "bad" : "gray"} className="h-auto py-0.5 whitespace-normal">{l.text}</StatusPill></li>)}
    </ul>
  )
}

type Preset = { familyId: string; nombre: string; parentesco: string | null }

/**
 * "Agregar persona": dos caminos. Invitarla para que use Mirai (correo o celular, con rol) o solo agregarla al hogar
 * (sin cuenta). Con `preset` invita a un integrante sin cuenta desde su fila (al aceptar se vincula a ese mismo).
 */
export function AddPersonDialog({ data, preset, onClose, onOnlyAdd, onDone }: {
  data: HouseholdPeople | undefined; preset?: Preset | null; onClose: () => void; onOnlyAdd: () => void; onDone: () => void
}) {
  const access = useAccess()
  const roles = assignableRoles(access)
  const [step, setStep] = useState<"elegir" | "invitar" | "listo">(preset ? "invitar" : "elegir")
  const [modo, setModo] = useState("invitar")
  const [nombre, setNombre] = useState(preset?.nombre ?? "")
  const [parentesco, setParentesco] = useState(preset?.parentesco ?? "")
  const [destino, setDestino] = useState("")
  const [rol, setRol] = useState<AccessRole>("editor")
  const [familyId, setFamilyId] = useState<string>(preset?.familyId ?? "nueva")
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState<InviteResult | null>(null)
  const [done, setDone] = useState<InviteResult | null>(null)
  const [destErr, setDestErr] = useState<string | null>(null)
  const sinCuenta = data?.sinCuenta ?? []

  const submit = async (extra: { familyId?: string; nueva?: boolean } = {}) => {
    const d = normalizeDest(destino)
    if ("error" in d) return setDestErr(d.error)
    setBusy(true); setIssue(null)
    const fid = extra.familyId ?? (familyId !== "nueva" ? familyId : null)
    const r = await invitePerson({ destino, nombre: nombre || null, parentesco: parentesco || null, access: rol as Exclude<AccessRole, "owner">, familyId: fid, nueva: extra.nueva })
    setBusy(false)
    if (extra.familyId) setFamilyId(extra.familyId)
    if (!r.ok) return setIssue(r)
    setDone(r); setStep("listo"); onDone()
  }
  const resend = async (id: string) => {
    setBusy(true)
    const r = await resendInvitation(id)
    setBusy(false)
    if (!r.ok) return setIssue({ ...r, code: undefined })
    setDone(r); setStep("listo"); onDone()
  }

  const enviada = !!(done?.delivery?.email?.ok || done?.delivery?.whatsapp?.ok)
  const footer = step === "elegir"
    ? <><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => (modo === "invitar" ? setStep("invitar") : onOnlyAdd())}>Continuar</Button></>
    : step === "invitar"
      ? <><Button variant="outline" onClick={preset ? onClose : () => setStep("elegir")}>{preset ? "Cancelar" : "Atrás"}</Button>
        <SubmitButton onClick={() => submit()} disabled={!destino.trim() || !!destErr} loading={busy} loadingText="Enviando…" hint={destErr ?? "Escribe el correo o el celular"}><Send /> Enviar invitación</SubmitButton></>
      : <><span /><Button onClick={onClose}>Listo</Button></>

  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} wide={step === "invitar"} footer={footer}
      title={step === "listo" ? (enviada ? "Invitación enviada" : "Invitación lista") : preset ? `Invitar a ${preset.nombre}` : "Agregar persona"}
      description={step === "elegir" ? "¿Esta persona va a usar Mirai o solo quieres anotar sus gastos e ingresos?" : step === "invitar" ? "Le llega un enlace para unirse a tu hogar. Si no tiene cuenta, la crea en un minuto." : undefined}>
      {step === "elegir" && (
        <ChoiceCards name="camino" value={modo} onChange={setModo} items={[
          { value: "invitar", label: "Invitarla para que use Mirai", desc: "Tu pareja o un hijo mayor: tendrá su propia cuenta y verá el hogar desde su celular. Le enviamos un correo o un WhatsApp.", icon: "user-plus", recommended: true },
          { value: "agregar", label: "Solo agregarla al hogar", desc: "Un hijo pequeño o alguien que no usa Mirai: es solo para asignarle gastos e ingresos y darle un presupuesto.", icon: "baby" },
        ]} />
      )}

      {step === "invitar" && (
        <FieldGroup>
          {issue && (
            <Notice tone={issue.code === "pendiente" || issue.code === "mismo_nombre" ? "warn" : "bad"} title={issue.code === "miembro" ? "Ya está en tu hogar" : issue.code === "pendiente" ? "Ya la invitaste" : issue.code === "mismo_nombre" ? "¿Es la misma persona?" : "No pudimos invitarla"}
              action={issue.code === "pendiente" && issue.invitationId ? <Button size="sm" onClick={() => resend(issue.invitationId!)} disabled={busy}>Reenviar invitación</Button>
                : issue.code === "mismo_nombre" && issue.familyId ? <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => submit({ familyId: issue.familyId })} disabled={busy}>Sí, es la misma</Button><Button size="sm" variant="outline" onClick={() => submit({ nueva: true })} disabled={busy}>No, es otra persona</Button></div>
                : undefined}>
              {issue.msg}
            </Notice>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Correo o celular" htmlFor="inv-dest" required tip="Le enviamos la invitación ahí. Con celular, la envías desde tu WhatsApp (o Mirai la envía si está configurado)." error={destErr ?? undefined}>
              <Input id="inv-dest" className="h-11" inputMode="email" autoComplete="off" placeholder="ana@gmail.com o 315 123 4567" value={destino} onChange={(e) => { setDestino(e.target.value); setDestErr(null); setIssue(null) }} autoFocus />
            </FormField>
            <FormField label="Nombre" htmlFor="inv-nombre" tip="Así aparece en tu hogar mientras acepta." hint="Opcional">
              <Input id="inv-nombre" className="h-11" placeholder="Ej. Ana" maxLength={60} value={nombre} disabled={!!preset} onChange={(e) => { setNombre(e.target.value); setIssue(null) }} />
            </FormField>
            {!preset && (
              <FormField label="¿Qué es para ti?" htmlFor="inv-par" tip="El parentesco o la relación de esta persona contigo." hint="Opcional">
                <Combobox id="inv-par" value={parentesco} onChange={setParentesco} options={parentescoOptions(parentesco)} placeholder="Elige el parentesco" />
              </FormField>
            )}
            {!preset && sinCuenta.length > 0 && (
              <FormField label="¿Ya la agregaste al hogar?" htmlFor="inv-fam" tip="Si ya la tienes como integrante sin cuenta, elígela: al aceptar se une a ese mismo integrante y no queda repetida.">
                <Combobox id="inv-fam" value={familyId} onChange={(v) => { setFamilyId(v); setIssue(null); const f = sinCuenta.find((x) => x.id === v); if (f) { setNombre(f.nombre); setParentesco(f.parentesco) } }}
                  options={[{ value: "nueva", label: "No, es una persona nueva", icon: "user-plus" }, ...sinCuenta.map((f) => ({ value: f.id, label: f.nombre, hint: f.parentesco, icon: "user" }))]} />
              </FormField>
            )}
          </div>
          <FormField label="¿Qué podrá hacer?" tip={false}>
            <RolePicker value={rol} onChange={setRol} roles={roles} name="inv-rol" />
          </FormField>
          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-semibold text-link"><ChevronDown className="size-4 transition group-data-[state=open]:rotate-180" /> ¿Qué puede hacer cada rol?</CollapsibleTrigger>
            <CollapsibleContent className="pt-3"><RoleMatrix highlight={rol} /></CollapsibleContent>
          </Collapsible>
        </FieldGroup>
      )}

      {step === "listo" && done?.share && (
        <div className="grid gap-4">
          <p className="text-[15px]">{done.msg}</p>
          <DeliveryLines result={done.delivery} />
          <div className="grid gap-2 rounded-lg bg-secondary/60 p-3">
            <p className="text-sm font-medium">También puedes enviársela tú (es lo más rápido):</p>
            <ShareActions share={done.share} invitationId={done.invitationId!} />
          </div>
          <p className="text-xs text-muted-foreground">El enlace vence en 7 días. Puedes reenviarla o cancelarla desde la lista de tu hogar.</p>
        </div>
      )}
    </ResponsiveDialog>
  )
}
