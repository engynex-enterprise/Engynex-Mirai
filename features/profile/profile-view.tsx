"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDownToLine, Pencil, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { AddressFields, emptyAddress, type Address } from "@/components/mirai/address-fields"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { FormField } from "@/components/mirai/field"
import { Icon } from "@/components/mirai/icon"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { ingresoMensual, totales } from "@/lib/domain"
import { todayISO } from "@/lib/format"
import PARENT_IC from "@/lib/data/legacy-parent_ic.json"
import { useBookData } from "@/features/book/use-book-data"
import { useMembers, useSettings } from "@/features/catalogs/hooks"
import { useBookSettingsSave } from "@/features/settings/prefs"
import type { Row } from "@/lib/supabase/tables"

const PARENTESCOS = Object.entries(PARENT_IC as Record<string, string>).filter(([k]) => k !== "Cónyuge" && k !== "Hijo/a")
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"
const DOCS = [{ value: "CC", label: "Cédula de ciudadanía" }, { value: "CE", label: "Cédula de extranjería" }, { value: "PA", label: "Pasaporte" }, { value: "PPT", label: "Permiso por protección temporal" }]

/** Texto que guarda al salir. */
function Blur({ id, value, onSave, ...rest }: { id: string; value: string; onSave: (v: string) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "onBlur">) {
  const [v, setV] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) { setPrev(value); setV(value) }
  return <Input id={id} className="h-11" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} {...rest} />
}

function MemberDialog({ m, onClose }: { m: Partial<Row<"family_members">> | null; onClose: () => void }) {
  const { household } = useApp()
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(m?.nombre ?? "")
  const [rol, setRol] = useState(m?.rol ?? "")
  const [tiene, setTiene] = useState(+(m?.cupo ?? 0) > 0 ? "si" : "no")
  const [cupo, setCupo] = useState(+(m?.cupo ?? 0))
  const [busy, setBusy] = useState(false)
  const opts = [...PARENTESCOS, ...(rol && !PARENTESCOS.some(([k]) => k === rol) ? [[rol, (PARENT_IC as Record<string, string>)[rol] ?? "user"]] : [])].map(([k, i]) => ({ value: k, label: k, icon: i }))
  const save = async () => {
    if (!nombre.trim()) return toast.error("Escribe el nombre")
    setBusy(true)
    const row = { nombre: nombre.trim(), rol: rol || "Otro familiar", cupo: tiene === "si" ? cupo : 0 }
    const sb = createClient()
    const { error } = m?.id ? await sb.from("family_members").update(row).eq("id", m.id) : await sb.from("family_members").insert({ ...row, household_id: household.id })
    setBusy(false)
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    toast.success(m?.id ? `Se actualizaron los datos de ${row.nombre}.` : `${row.nombre} ya hace parte de tu familia en Mirai.`)
    qc.invalidateQueries({ queryKey: ["h", household.id, "family_members"] })
    onClose()
  }
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={m?.id ? "Editar integrante" : "Agregar integrante"} mdesc="miembro"
      description="Agrega a las personas del hogar. Así puedes registrar quién hizo cada gasto y, si quieres, darle a cada uno un presupuesto mensual."
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy && <Spinner />}{m?.id ? "Guardar cambios" : "Agregar"}</Button></>}>
      <FieldGroup>
        <FormField label="Nombre" htmlFor="mm-n" required tip={false}><Input id="mm-n" className="h-11" placeholder="Ej. Sofía" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /></FormField>
        <FormField label="¿Qué es para ti?" htmlFor="mm-rol" tip="El parentesco o la relación de esta persona contigo."><Combobox id="mm-rol" value={rol} onChange={setRol} options={opts} placeholder="Elige el parentesco" /></FormField>
        <FormField label="¿Quieres darle un presupuesto mensual?" tip={false} hint="Si tiene un límite, Mirai te avisa cuando se acerque o se pase.">
          <ChoiceCards value={tiene} onChange={setTiene} items={[{ value: "no", label: "No, gasta del dinero de la casa", icon: "house" }, { value: "si", label: "Sí, tiene un límite al mes", icon: "wallet" }]} />
        </FormField>
        {tiene === "si" && <FormField label="Presupuesto al mes" htmlFor="mm-c" tip="Lo máximo que esta persona puede gastar al mes en sus cosas. Mirai te avisa si se pasa."><MoneyInput id="mm-c" value={cupo} onChange={setCupo} /></FormField>}
      </FieldGroup>
    </ResponsiveDialog>
  )
}

export function ProfileView() {
  const { user, household } = useApp()
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const { data: book } = useBookData()
  const { data: members = [] } = useMembers()
  const { data: cfg } = useSettings()
  const saveCfg = useBookSettingsSave()
  const [edit, setEdit] = useState<Partial<Row<"family_members">> | null | undefined>(undefined)
  const key = ["profile-full", user.id]
  const { data: p } = useQuery({ queryKey: key, queryFn: async () => (await createClient().from("profiles").select("*").eq("id", user.id).single()).data })
  const { data: counts } = useQuery({
    queryKey: ["b", bookId, "profile-counts"],
    queryFn: async () => {
      const sb = createClient()
      const [c, g] = await Promise.all([sb.from("contacts").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null), sb.from("goals").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null)])
      return { contactos: c.count ?? 0, metas: g.count ?? 0 }
    },
  })
  if (!p || !book) return <PageSkeleton kpis={0} />
  const save = async (patch: Partial<Row<"profiles">>) => {
    qc.setQueryData(key, { ...p, ...patch })
    const { error } = await createClient().from("profiles").update(patch).eq("id", user.id)
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    toast("Guardado"); qc.invalidateQueries({ queryKey: ["profile", user.id] })
  }
  const T = totales(book, todayISO())
  const ing = ingresoMensual(book.incomes, book.settings.trm)
  const addr = { ...emptyAddress, ...((p.direccion as Address) ?? {}), ciudad: p.ciudad || (p.direccion as Address)?.ciudad || "" }
  const del = async (m: Row<"family_members">) => {
    const sb = createClient()
    await sb.from("family_members").update({ deleted_at: new Date().toISOString() }).eq("id", m.id)
    qc.invalidateQueries({ queryKey: ["h", household.id, "family_members"] })
    toast("Integrante eliminado", { description: `“${m.nombre}”`, action: { label: "Deshacer", onClick: async () => { await sb.from("family_members").update({ deleted_at: null }).eq("id", m.id); qc.invalidateQueries({ queryKey: ["h", household.id, "family_members"] }) } } })
  }

  return (
    <div className="grid gap-6">
      <Card className="gap-0 overflow-hidden p-0 shadow-card ring-0">
        <div className="h-36 bg-[linear-gradient(120deg,#1F2B4B_0%,#3F7A1E_70%,#9EDB4E_100%)]" />
        <div className="-mt-11 flex flex-wrap items-end gap-4 px-5 pb-4">
          <Avatar className="size-[84px] ring-4 ring-card">{p.avatar_url && <AvatarImage src={p.avatar_url} alt="" />}<AvatarFallback className="bg-brand-gradient text-2xl text-white">{initials(p.nombre)}</AvatarFallback></Avatar>
          <div className="min-w-48 flex-1 pb-1"><h1 className="text-2xl font-semibold">{p.nombre || "Tu nombre"}</h1><p className="text-sm text-muted-foreground">{[p.ocupacion, p.ciudad].filter(Boolean).join(" · ") || "Completa tus datos"} · {members.length} integrantes</p></div>
          <StatusPill tone="info">Perfil {p.riesgo}</StatusPill>
        </div>
      </Card>

      <section className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="gap-4 p-5 shadow-card ring-0">
          <h2 className="font-semibold">Tus datos</h2>
          <FieldGroup>
            <FormField label="Nombre completo" htmlFor="pf-n" tip={false}><Blur id="pf-n" value={p.nombre} onSave={(v) => save({ nombre: v.trim() })} /></FormField>
            <AddressFields idPrefix="pf" value={addr} onChange={(a) => save({ direccion: a as never, ciudad: a.ciudad })} />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Ocupación" htmlFor="pf-o" tip={false}><Blur id="pf-o" value={p.ocupacion} onSave={(v) => save({ ocupacion: v })} /></FormField>
              <FormField label="Teléfono" htmlFor="pf-t" tip={false}><Blur id="pf-t" type="tel" inputMode="tel" value={p.telefono} onSave={(v) => save({ telefono: v })} /></FormField>
              <FormField label="Tipo de documento" htmlFor="pf-dt" tip={false}><Combobox id="pf-dt" value={p.doc_tipo} onChange={(v) => save({ doc_tipo: v })} options={DOCS} /></FormField>
              <FormField label="Número de documento" htmlFor="pf-doc" tip="Se usa en los acuerdos de pago que generes."><Blur id="pf-doc" inputMode="numeric" value={p.doc} onSave={(v) => save({ doc: v.replace(/[^\dA-Za-z-]/g, "") })} /></FormField>
              <FormField label="Últimos 2 dígitos de tu cédula" htmlFor="pf-d" tip="La DIAN asigna la fecha de tu declaración de renta según estos dígitos."><Blur id="pf-d" inputMode="numeric" maxLength={2} placeholder="Para fechas DIAN" value={p.digitos} onSave={(v) => { if (/^\d{0,2}$/.test(v)) save({ digitos: v }); else toast.error("Escribe solo dos números") }} /></FormField>
            </div>
            <FormField label="¿Cómo te sientes con el riesgo?" tip={false}>
              <ChoiceCards cols={3} value={p.riesgo} onChange={(v) => save({ riesgo: v })} items={[{ value: "conservador", label: "Conservador", desc: "Prefiero no perder", icon: "shield-check" }, { value: "moderado", label: "Moderado", desc: "Algo de riesgo", icon: "scale" }, { value: "arriesgado", label: "Arriesgado", desc: "Busco ganar más", icon: "zap" }]} />
            </FormField>
            <FormField label="Tu meta financiera principal" htmlFor="pf-m" tip={false}><Blur id="pf-m" disabled={!canEdit} placeholder="Ej. Comprar casa en 5 años" value={cfg?.meta ?? ""} onSave={(v) => saveCfg.mutate({ meta: v })} /></FormField>
          </FieldGroup>
        </Card>
        <Card className="gap-3 p-5 shadow-card ring-0">
          <h2 className="font-semibold">Resumen</h2>
          <div className="grid grid-cols-2 gap-2">
            {([[<Money key="i" value={ing} className="text-success" />, "Ingreso mensual"], [<Money key="p" value={T.pat} />, "Patrimonio"], [counts?.contactos ?? "—", "Contactos"], [counts?.metas ?? "—", "Metas"]] as [React.ReactNode, string][]).map(([v, l]) => <div key={l} className="rounded-lg bg-muted/60 p-3"><p className="text-lg font-semibold tabular-nums">{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>)}
          </div>
          <Button variant="soft" asChild><Link href="/ingresos"><ArrowDownToLine /> Ver mis ingresos</Link></Button>
          <p className="text-xs text-muted-foreground">Tu correo de acceso: {user.email}. Cámbialo o protege tu cuenta en <Link className="underline" href="/ajustes?tab=seguridad">Ajustes › Seguridad</Link>.</p>
        </Card>
      </section>

      <Card className="gap-4 p-5 shadow-card ring-0" id="famCard">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-semibold">Integrantes de la familia</h2><p className="text-sm text-muted-foreground">Las personas con las que compartes el dinero de la casa. Te sirve para saber quién gasta qué y para darle a cada uno un presupuesto.</p></div>
          {canEdit && <Button onClick={() => setEdit(null)}><UserPlus /> Agregar integrante</Button>}
        </div>
        {!members.length ? <p className="text-sm text-muted-foreground">Aún no agregas integrantes. Agrega a tu pareja, hijos u otras personas del hogar.</p> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border p-3">
                <Avatar className="size-11"><AvatarFallback className="bg-brand-soft text-link">{initials(m.nombre)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.nombre}</p>
                  <StatusPill tone="gray"><Icon name={(PARENT_IC as Record<string, string>)[m.rol] ?? "user"} className="size-3" />{m.rol}</StatusPill>
                  <p className="mt-0.5 text-xs text-muted-foreground">{+m.cupo > 0 ? <>Presupuesto: <Money value={+m.cupo} /> al mes</> : "Sin presupuesto propio"}</p>
                </div>
                {canEdit && <div className="flex flex-col"><Button size="icon-sm" variant="ghost" aria-label={`Editar ${m.nombre}`} onClick={() => setEdit(m)}><Pencil /></Button>{!m.es_titular && <Button size="icon-sm" variant="ghost" className="text-danger" aria-label={`Eliminar ${m.nombre}`} onClick={() => del(m)}><Trash2 /></Button>}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>
      {edit !== undefined && <MemberDialog m={edit} onClose={() => setEdit(undefined)} />}
    </div>
  )
}
