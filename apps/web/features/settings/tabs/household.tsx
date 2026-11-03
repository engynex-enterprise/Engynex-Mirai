"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CircleHelp, Crown } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { openHelpCenter } from "@/components/app/help-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SubmitButton } from "@/components/mirai/submit-button"
import { Tip } from "@/components/mirai/tip"
import { useApp, useCan } from "@/components/app/app-context"
import { deniedMsg, ROLE_INFO } from "@/lib/household/roles"
import { renameHousehold } from "@/features/household/api"
import { HouseholdPeople } from "@/features/household/people"
import { RolePill } from "@/features/household/roles-ui"
import { IncomingTransfers, OutgoingTransfer, TransferDialog } from "@/features/account/transfer"
import { useAccount } from "@/features/account/use-account"
import { SettingRow, SettingSection, SettingStack } from "../ui"

export function HogarTab() {
  const { household } = useApp()
  const router = useRouter()
  const canSet = useCan("ajustes")
  const [nombre, setNombre] = useState(household.nombre)
  const [busy, setBusy] = useState(false)
  const [pasar, setPasar] = useState(false)
  const { data: acc } = useAccount()
  const outgoing = acc?.households.find((h) => h.id === household.id)?.outgoing ?? null
  const incoming = (acc?.incoming ?? []).filter((t) => t.householdId === household.id)
  const t = nombre.trim()
  const changed = !!t && t !== household.nombre
  const rename = async () => {
    if (!changed || busy) return
    setBusy(true)
    const r = await renameHousehold(nombre)
    setBusy(false)
    if (!r.ok) return toast.error(r.msg)
    toast.success(r.msg); router.refresh()
  }
  const input = <Input className="h-10 w-60 max-sm:w-full" value={nombre} disabled={!canSet} maxLength={60} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del hogar" />

  return (
    <SettingStack>
      <SettingSection icon="house" title="Tu hogar" desc="Un hogar puede tener varios libros (personal, negocio…). Todos comparten las mismas personas.">
        <SettingRow title="Nombre del hogar" desc="Así lo ven las personas que invites.">
          {canSet ? (
            <form className="flex gap-2 max-sm:w-full" onSubmit={(e) => { e.preventDefault(); rename() }}>
              {input}
              <SubmitButton className="h-10" disabled={!changed} loading={busy} onClick={rename} hint={t ? "Cambia el nombre para guardar" : "Escribe un nombre"}>Guardar</SubmitButton>
            </form>
          ) : <Tip label={deniedMsg("ajustes")}><span tabIndex={0} className="block">{input}</span></Tip>}
        </SettingRow>
        <SettingRow title="Tu rol" desc={ROLE_INFO[household.access].desc}><RolePill role={household.access} /></SettingRow>
        {household.access === "owner" && (
          <SettingRow title="Dueño del hogar" desc="Pásale el hogar a otra persona con cuenta (por ejemplo, tu pareja). Ella decide si acepta y tú escoges qué rol quedas.">
            <Button variant="outline" onClick={() => setPasar(true)}><Crown /> Pasar el hogar</Button>
          </SettingRow>
        )}
        {outgoing && <div className="pt-3"><OutgoingTransfer t={outgoing} /></div>}
        {!!incoming.length && <div className="pt-3"><IncomingTransfers items={incoming} /></div>}
      </SettingSection>
      {pasar && <TransferDialog householdId={household.id} open={pasar} onOpenChange={setPasar} onDone={() => router.refresh()} />}
      <SettingSection icon="users" title="¿Quiénes hacen parte de tu hogar?"
        desc="Quienes usan Mirai, quienes solo registras tú (como un hijo pequeño) y las invitaciones que enviaste."
        action={<Button size="sm" variant="ghost" onClick={() => openHelpCenter("hogar")}><CircleHelp /> Cómo funciona</Button>}>
        <HouseholdPeople />
      </SettingSection>
    </SettingStack>
  )
}
