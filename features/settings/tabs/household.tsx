"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, LogOut, MailPlus, Trash2, UserMinus } from "lucide-react"
import { toast } from "sonner"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Combobox } from "@/components/mirai/combobox"
import { StatusPill } from "@/components/mirai/status-pill"
import { useApp } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { fmtDate } from "@/lib/format"
import { inviteMember, removeMember, renameHousehold, revokeInvitation, setMemberRole } from "@/features/household/actions"
import { SettingRow, SettingSection } from "../ui"

const ROLES = [
  { value: "owner", label: "Dueño", hint: "Todo, incluidos ajustes, integraciones y personas", icon: "crown" },
  { value: "editor", label: "Editor", hint: "Registra y cambia movimientos", icon: "pencil" },
  { value: "viewer", label: "Lector", hint: "Solo puede ver", icon: "eye" },
]

function useHousehold() {
  const { household } = useApp()
  return useQuery({
    queryKey: ["h", household.id, "people"],
    queryFn: async () => {
      const sb = createClient()
      const { data: ms } = await sb.from("household_members").select("user_id,role,created_at").eq("household_id", household.id).order("created_at")
      const ids = (ms ?? []).map((m) => m.user_id)
      const [{ data: ps }, { data: invs }] = await Promise.all([
        sb.from("profiles").select("id,nombre,email,avatar_url").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
        household.role === "owner" ? sb.from("household_invitations").select("id,email,role,expires_at,accepted_at").eq("household_id", household.id).is("accepted_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
      ])
      const pm = new Map((ps ?? []).map((p) => [p.id, p]))
      return { members: (ms ?? []).map((m) => ({ ...m, p: pm.get(m.user_id) })), invitations: (invs ?? []) as { id: string; email: string; role: string; expires_at: string }[] }
    },
  })
}

export function HogarTab() {
  const { household, user } = useApp()
  const router = useRouter()
  const qc = useQueryClient()
  const { data, isPending } = useHousehold()
  const owner = household.role === "owner"
  const [nombre, setNombre] = useState(household.nombre)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"editor" | "viewer">("editor")
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ["h", household.id, "people"] })
  const run = async (f: () => Promise<unknown>, ok: string) => { try { await f(); toast.success(ok); refresh() } catch (e) { toast.error((e as Error).message) } }

  return (
    <div className="grid gap-4">
      <SettingSection icon="house" title="Tu hogar" desc="Un hogar agrupa a las personas que llevan juntas las cuentas. Cada hogar puede tener varios libros (personal, negocio…).">
        <SettingRow title="Nombre del hogar">
          <div className="flex gap-2"><Input className="h-10 w-60" value={nombre} disabled={!owner} maxLength={60} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del hogar" />
            {owner && nombre.trim() !== household.nombre && <Button className="h-10" onClick={() => run(async () => { await renameHousehold(nombre); router.refresh() }, "Nombre actualizado")}>Guardar</Button>}
          </div>
        </SettingRow>
        <SettingRow title="Tu rol" desc={ROLES.find((r) => r.value === household.role)?.hint}><StatusPill tone="info">{ROLES.find((r) => r.value === household.role)?.label}</StatusPill></SettingRow>
      </SettingSection>

      <SettingSection icon="users" title="Personas con acceso">
        {isPending ? <Skeleton className="h-32" /> : (
          <ul className="grid">
            {data?.members.map((m) => {
              const me = m.user_id === user.id
              const n = m.p?.nombre || m.p?.email || "Sin nombre"
              return (
                <li key={m.user_id} className="flex flex-wrap items-center gap-3 border-b py-3 last:border-0">
                  <UserAvatar src={m.p?.avatar_url} name={n} className="size-10" fallbackClassName="text-xs" />
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{n}{me && <span className="text-muted-foreground"> (tú)</span>}</p><p className="truncate text-sm text-muted-foreground">{m.p?.email}</p></div>
                  {owner ? (
                    <div className="w-40"><Combobox value={m.role} onChange={(v) => run(() => setMemberRole(m.user_id, v as "owner"), "Rol actualizado")} options={ROLES} /></div>
                  ) : <StatusPill tone="gray">{ROLES.find((r) => r.value === m.role)?.label}</StatusPill>}
                  {owner && !me && <Button size="icon" variant="ghost" className="text-danger" aria-label={`Quitar a ${n}`} onClick={() => run(() => removeMember(m.user_id), `${n} ya no tiene acceso`)}><UserMinus /></Button>}
                  {me && !owner && <Button size="sm" variant="ghost" className="text-danger" onClick={() => run(async () => { await removeMember(user.id); router.push("/inicio"); router.refresh() }, "Saliste del hogar")}><LogOut /> Salir del hogar</Button>}
                </li>
              )
            })}
          </ul>
        )}
      </SettingSection>

      {owner && (
        <SettingSection icon="mail-plus" title="Invitar a alguien" desc="Tu pareja, tus hijos o quien te ayude con las cuentas. La invitación vence en 7 días.">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input type="email" className="h-10 flex-1" placeholder="correo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Correo de la persona" />
            <div className="w-full sm:w-44"><Combobox value={role} onChange={(v) => setRole(v as "editor")} options={ROLES.slice(1)} /></div>
            <Button className="h-10" disabled={busy} onClick={async () => {
              setBusy(true); const r = await inviteMember({ email, role }); setBusy(false)
              if (!r.ok) return toast.error(r.msg)
              toast.success(r.msg); setEmail(""); setLink(r.url ?? null); refresh()
            }}>{busy ? <Spinner /> : <MailPlus />} Invitar</Button>
          </div>
          {link && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted p-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{link}</span>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(link); toast("Enlace copiado") }}><Copy /> Copiar</Button>
            </div>
          )}
          {!!data?.invitations.length && (
            <ul className="mt-3 grid">
              <li className="pb-1 text-xs font-semibold text-muted-foreground uppercase">Pendientes</li>
              {data.invitations.map((i) => (
                <li key={i.id} className="flex items-center gap-3 border-b py-2 last:border-0">
                  <span className="min-w-0 flex-1 truncate text-sm">{i.email}</span>
                  <StatusPill tone={new Date(i.expires_at) < new Date() ? "vencido" : "porVencer"}>{new Date(i.expires_at) < new Date() ? "Vencida" : `Vence ${fmtDate(i.expires_at.slice(0, 10))}`}</StatusPill>
                  <Button size="icon" variant="ghost" className="text-danger" aria-label={`Cancelar invitación de ${i.email}`} onClick={() => run(() => revokeInvitation(i.id), "Invitación cancelada")}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          )}
        </SettingSection>
      )}
    </div>
  )
}
