"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDownToLine, ArrowRight, Cake, Camera, CircleCheck, CircleDashed, Flame, Gift, Mail, Medal, Palette, Pencil, Plus, Sparkles, Trash2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { AddressFields, emptyAddress, type Address } from "@/components/mirai/address-fields"
import { AvatarPicker } from "@/components/mirai/avatar-picker"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { DatePicker } from "@/components/mirai/date-picker"
import { FormField } from "@/components/mirai/field"
import { Icon } from "@/components/mirai/icon"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { ingresoMensual, totales } from "@/lib/domain"
import { digitosDian, edad, monthName, proxCumple, todayISO } from "@/lib/format"
import { BANNER_THEMES, type BannerThemeKey } from "@/lib/content/banners"
import PARENT_IC from "@/lib/data/legacy-parent_ic.json"
import { useBookData } from "@/features/book/use-book-data"
import { useMembers, useSettings } from "@/features/catalogs/hooks"
import { useBookSettingsSave } from "@/features/settings/prefs"
import { useGami } from "@/features/gami/use-gami"
import type { Row } from "@/lib/supabase/tables"
import { CobroCard, type Cobro } from "./cobro-card"

const PARENTESCOS = Object.entries(PARENT_IC as Record<string, string>).filter(([k]) => k !== "Cónyuge" && k !== "Hijo/a")
const DOCS = [{ value: "CC", label: "Cédula de ciudadanía" }, { value: "CE", label: "Cédula de extranjería" }, { value: "PA", label: "Pasaporte" }, { value: "PPT", label: "Permiso por protección temporal" }]
const TRABAJO = [
  { value: "empleado", label: "Empleado (con contrato)", icon: "briefcase" }, { value: "independiente", label: "Independiente o por prestación de servicios", icon: "laptop" },
  { value: "empresario", label: "Tengo mi negocio", icon: "store" }, { value: "pensionado", label: "Pensionado", icon: "armchair" },
  { value: "estudiante", label: "Estudiante", icon: "graduation-cap" }, { value: "hogar", label: "Me dedico al hogar", icon: "house" },
  { value: "buscando", label: "Buscando trabajo", icon: "search" },
]
const PORTADAS: [BannerThemeKey, string][] = [["verde", "Verde"], ["menta", "Menta"], ["teal", "Turquesa"], ["cyan", "Cielo"], ["azul", "Azul"], ["navy", "Noche"], ["lavanda", "Lavanda"], ["morado", "Morado"], ["rosa", "Rosa"], ["naranja", "Naranja"], ["amarillo", "Sol"]]

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
  const [avatar, setAvatar] = useState<string | null>(m?.avatar || null)
  const [nac, setNac] = useState<string | null>(m?.nacimiento ?? null)
  const [pick, setPick] = useState(false)
  const [tiene, setTiene] = useState(+(m?.cupo ?? 0) > 0 ? "si" : "no")
  const [cupo, setCupo] = useState(+(m?.cupo ?? 0))
  const [busy, setBusy] = useState(false)
  const opts = [...PARENTESCOS, ...(rol && !PARENTESCOS.some(([k]) => k === rol) ? [[rol, (PARENT_IC as Record<string, string>)[rol] ?? "user"]] : [])].map(([k, i]) => ({ value: k, label: k, icon: i }))
  const save = async () => {
    if (!nombre.trim()) return toast.error("Escribe el nombre")
    setBusy(true)
    const row = { nombre: nombre.trim(), rol: rol || "Otro familiar", cupo: tiene === "si" ? cupo : 0, avatar: avatar ?? "", nacimiento: nac }
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
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setPick(true)} aria-label="Elegir avatar del integrante" className="group relative rounded-[22%] outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <UserAvatar src={avatar} name={nombre || "?"} square className="size-20" fallbackClassName="text-xl" />
            <span className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full bg-secondary ring-2 ring-popover"><Pencil className="size-3.5" /></span>
          </button>
          <p className="text-sm text-muted-foreground">Escoge un avatar para reconocer a esta persona de un vistazo.</p>
        </div>
        <FormField label="Nombre" htmlFor="mm-n" required tip={false}><Input id="mm-n" className="h-11" placeholder="Ej. Sofía" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /></FormField>
        <FormField label="¿Qué es para ti?" htmlFor="mm-rol" tip="El parentesco o la relación de esta persona contigo."><Combobox id="mm-rol" value={rol} onChange={setRol} options={opts} placeholder="Elige el parentesco" /></FormField>
        <FormField label="Fecha de nacimiento (opcional)" htmlFor="mm-nac" tip="Te recordamos su cumpleaños con tiempo para planear el regalo."><DatePicker id="mm-nac" quick="ninguno" clearable years={[1920, new Date().getFullYear()]} startAt="2010-01-01" placeholder="Elige la fecha" value={nac} onChange={setNac} /></FormField>
        <FormField label="¿Quieres darle un presupuesto mensual?" tip={false} hint="Si tiene un límite, Mirai te avisa cuando se acerque o se pase.">
          <ChoiceCards value={tiene} onChange={setTiene} items={[{ value: "no", label: "No, gasta del dinero de la casa", icon: "house" }, { value: "si", label: "Sí, tiene un límite al mes", icon: "wallet" }]} />
        </FormField>
        {tiene === "si" && <FormField label="Presupuesto al mes" htmlFor="mm-c" tip="Lo máximo que esta persona puede gastar al mes en sus cosas. Mirai te avisa si se pasa."><MoneyInput id="mm-c" value={cupo} onChange={setCupo} /></FormField>}
      </FieldGroup>
      <AvatarPicker open={pick} onOpenChange={setPick} value={avatar} name={nombre || "?"} onPick={setAvatar} title={`Avatar de ${nombre || "este integrante"}`} />
    </ResponsiveDialog>
  )
}

/** Portada del perfil con el degradado elegido y figuras suaves (sin logos ni fotos). */
function Cover({ theme, children }: { theme: BannerThemeKey; children?: React.ReactNode }) {
  const t = BANNER_THEMES[theme] ?? BANNER_THEMES.verde
  return (
    <div className="banner-bg relative h-36 overflow-hidden sm:h-44" style={{ "--bn-bg": t.bg, "--bn-dark": t.dark } as React.CSSProperties}>
      <svg viewBox="0 0 800 180" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden>
        <circle cx="690" cy="40" r="120" fill={t.c} className="opacity-70 dark:opacity-20" />
        <circle cx="690" cy="40" r="150" fill="none" stroke={t.b} strokeWidth="2" strokeDasharray="3 10" className="opacity-60 dark:opacity-30" />
        <circle cx="120" cy="190" r="90" fill={t.c} className="opacity-50 dark:opacity-15" />
        {Array.from({ length: 15 }).map((_, i) => <circle key={i} cx={470 + (i % 5) * 18} cy={40 + Math.floor(i / 5) * 18} r="3" fill={t.a} className="opacity-25 dark:opacity-40" />)}
        <circle cx="600" cy="120" r="16" fill="#FFC83D" /><circle cx="600" cy="120" r="9" fill="none" stroke="#FFF1BF" strokeWidth="3.5" />
        <path d="M760 130l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill={t.b} />
      </svg>
      {children}
    </div>
  )
}

export function ProfileView() {
  const { user, household } = useApp()
  const router = useRouter()
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const { data: book } = useBookData()
  const { data: members = [] } = useMembers()
  const { data: cfg } = useSettings()
  const saveCfg = useBookSettingsSave()
  const gami = useGami()
  const [edit, setEdit] = useState<Partial<Row<"family_members">> | null | undefined>(undefined)
  const [picker, setPicker] = useState(false)
  const [linking, setLinking] = useState(false)
  const key = ["profile-full", user.id]
  const { data: p } = useQuery({ queryKey: key, queryFn: async () => (await createClient().from("profiles").select("*").eq("id", user.id).single()).data })
  const { data: identities } = useQuery({ queryKey: ["identities", user.id], queryFn: async () => (await createClient().auth.getUserIdentities()).data?.identities ?? [] })
  const { data: counts } = useQuery({
    queryKey: ["b", bookId, "profile-counts"],
    queryFn: async () => {
      const sb = createClient()
      const [c, g] = await Promise.all([sb.from("contacts").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null), sb.from("goals").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null)])
      return { contactos: c.count ?? 0, metas: g.count ?? 0 }
    },
  })
  if (!p || !book) return <PageSkeleton kpis={0} />

  const save = async (patch: Partial<Row<"profiles">>, msg = "Guardado") => {
    qc.setQueryData(key, { ...p, ...patch })
    const { error } = await createClient().from("profiles").update(patch).eq("id", user.id)
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    toast(msg); qc.invalidateQueries({ queryKey: ["profile", user.id] })
    // El menú lateral, el saludo y la presencia leen el perfil en el servidor
    if ("avatar_url" in patch || "nombre" in patch || "apodo" in patch || "nacimiento" in patch) router.refresh()
  }
  const saveDoc = (doc: string, tipo = p.doc_tipo) => save({ doc, doc_tipo: tipo, ...(tipo === "CC" ? { digitos: digitosDian(doc) } : {}) })
  const google = identities?.find((i) => i.provider === "google")
  const googlePhoto = (google?.identity_data?.avatar_url ?? google?.identity_data?.picture ?? null) as string | null
  const linkGoogle = async () => {
    setLinking(true)
    const { error } = await createClient().auth.linkIdentity({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback?next=/perfil` } })
    if (error) { setLinking(false); toast.error("No se pudo vincular Google", { description: error.message }) }
  }
  const T = totales(book, todayISO())
  const ing = ingresoMensual(book.incomes, book.settings.trm)
  const addr = { ...emptyAddress, ...((p.direccion as Address) ?? {}), ciudad: p.ciudad || (p.direccion as Address)?.ciudad || "" }
  const age = edad(p.nacimiento)
  const portada = (p.portada || "verde") as BannerThemeKey
  const desde = `${monthName(Number(p.created_at.slice(5, 7)), false)} ${p.created_at.slice(0, 4)}`
  const cumples = [{ id: "yo", nombre: p.apodo || p.nombre.split(" ")[0] || "Tú", avatar: p.avatar_url, nacimiento: p.nacimiento }, ...members.filter((m) => !m.es_titular).map((m) => ({ id: m.id, nombre: m.nombre, avatar: m.avatar || null, nacimiento: m.nacimiento }))]
    .map((x) => ({ ...x, c: proxCumple(x.nacimiento) }))
    .filter((x): x is typeof x & { c: NonNullable<typeof x.c> } => !!x.c)
    .sort((a, b) => a.c.dias - b.c.dias)

  // Qué tan completo está el perfil (cada dato mejora avisos, fechas DIAN o consejos)
  const checks: [boolean, string, string][] = [
    [!!p.avatar_url, "Elige tu avatar o foto", "avatar"],
    [!!p.nombre.trim(), "Tu nombre completo", "pf-n"],
    [!!p.apodo.trim(), "Cómo quieres que te digamos", "pf-a"],
    [!!p.nacimiento, "Tu fecha de nacimiento", "pf-nac"],
    [!!p.ciudad, "Tu ciudad", "pf-ciudad"],
    [!!p.telefono, "Tu teléfono", "pf-t"],
    [!!p.doc, "Tu número de documento", "pf-doc"],
    [/^\d{2}$/.test(p.digitos), p.doc_tipo === "CC" ? "Tu cédula (de ahí salen tus fechas DIAN)" : "Los 2 últimos dígitos de tu NIT (fechas DIAN)", p.doc_tipo === "CC" ? "pf-doc" : "pf-d"],
    [!!p.trabajo, "Tu situación laboral", "pf-tr"],
    [(p.cobro as Cobro[]).length > 0, "Un medio para recibir pagos", "cobro"],
    [!!cfg?.meta, "Tu meta financiera principal", "pf-m"],
  ]
  const done = checks.filter(([ok]) => ok).length
  const pct = Math.round((done / checks.length) * 100)
  const focus = (id: string) => {
    if (id === "avatar") return setPicker(true)
    if (id === "cobro") return document.getElementById("cobro")?.scrollIntoView({ behavior: "smooth", block: "center" })
    const el = document.getElementById(id) ?? document.querySelector<HTMLElement>(`[id^="${id}"]`)
    el?.scrollIntoView({ behavior: "smooth", block: "center" }); el?.focus()
  }
  const del = async (m: Row<"family_members">) => {
    const sb = createClient()
    await sb.from("family_members").update({ deleted_at: new Date().toISOString() }).eq("id", m.id)
    qc.invalidateQueries({ queryKey: ["h", household.id, "family_members"] })
    toast("Integrante eliminado", { description: `“${m.nombre}”`, action: { label: "Deshacer", onClick: async () => { await sb.from("family_members").update({ deleted_at: null }).eq("id", m.id); qc.invalidateQueries({ queryKey: ["h", household.id, "family_members"] }) } } })
  }

  return (
    <div className="grid gap-6">
      {/* Portada y avatar */}
      <Card className="gap-0 overflow-hidden p-0 shadow-card ring-0">
        <Cover theme={portada}>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="absolute top-3 right-3 bg-white/80 backdrop-blur hover:bg-white dark:bg-black/30 dark:hover:bg-black/40"><Palette /> Portada</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <p className="text-sm font-semibold">Color de la portada</p>
              <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Color de la portada">
                {PORTADAS.map(([k, n]) => (
                  <button key={k} type="button" role="radio" aria-checked={portada === k} aria-label={n} title={n} onClick={() => save({ portada: k }, "Portada actualizada")}
                    className={`size-9 rounded-full ring-offset-2 ring-offset-popover outline-none focus-visible:ring-2 focus-visible:ring-ring ${portada === k ? "ring-2 ring-primary" : ""}`}
                    style={{ background: `linear-gradient(135deg, ${BANNER_THEMES[k].c}, ${BANNER_THEMES[k].b})` }} />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </Cover>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 px-5 pb-5 sm:px-6">
          <button type="button" onClick={() => setPicker(true)} aria-label="Cambiar avatar" className="group relative -mt-14 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring sm:-mt-16">
            <UserAvatar src={p.avatar_url} name={p.nombre || user.email} className="size-28 ring-4 ring-card sm:size-32" fallbackClassName="text-3xl" />
            <span className="absolute right-1 bottom-1 grid size-9 place-items-center rounded-full bg-secondary shadow-card ring-2 ring-card transition-transform group-hover:scale-110"><Camera className="size-4" /></span>
          </button>
          <div className="min-w-0 flex-1 pt-3 pb-1 max-sm:basis-full max-sm:pt-0">
            <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em]">{p.nombre || "Tu nombre"}</h1>
            <p className="text-[15px] text-muted-foreground">
              {[p.apodo && `Te decimos ${p.apodo}`, p.ocupacion, p.ciudad, age && `${age.años} años`].filter(Boolean).join(" · ") || "Completa tus datos"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusPill tone="info">Perfil {p.riesgo}</StatusPill>
              {gami && <StatusPill tone="ok"><Medal className="size-3" />Nivel {gami.L.n} · {gami.L.name}</StatusPill>}
              <StatusPill tone="gray">{members.length} integrantes</StatusPill>
              {gami && gami.racha > 1 && <StatusPill tone="warn"><Flame className="size-3" />Racha de {gami.racha} días</StatusPill>}
              <StatusPill tone="gray"><Sparkles className="size-3" />En Mirai desde {desde}</StatusPill>
              {age?.cumple && <StatusPill tone="warn"><Cake className="size-3" />¡Feliz cumpleaños!</StatusPill>}
            </div>
          </div>
          <Button variant="outline" className="max-sm:w-full" onClick={() => setPicker(true)}><Pencil /> Cambiar avatar</Button>
        </div>
      </Card>
      <AvatarPicker open={picker} onOpenChange={setPicker} value={p.avatar_url} name={p.nombre || user.email} googlePhoto={googlePhoto} uploadFor={user.id}
        onPick={(v) => save({ avatar_url: v }, "Avatar actualizado")} />

      <section className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="gap-4 p-5 shadow-card ring-0">
          <h2 className="font-semibold">Tus datos</h2>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Nombre completo" htmlFor="pf-n" tip={false}><Blur id="pf-n" value={p.nombre} onSave={(v) => save({ nombre: v.trim() })} /></FormField>
              <FormField label="¿Cómo quieres que te digamos?" htmlFor="pf-a" tip="Mirai te saluda con este nombre en Inicio y en los avisos."><Blur id="pf-a" placeholder="Ej. Alber" maxLength={30} value={p.apodo} onSave={(v) => save({ apodo: v.trim() })} /></FormField>
              <FormField label="Fecha de nacimiento" htmlFor="pf-nac" tip="Para saludarte en tu cumpleaños y darte consejos según tu edad (pensión, ahorro)."><DatePicker id="pf-nac" quick="ninguno" years={[1920, new Date().getFullYear()]} startAt="1990-01-01" placeholder="Elige tu fecha" value={p.nacimiento} onChange={(v) => save({ nacimiento: v })} /></FormField>
              <FormField label="Situación laboral" htmlFor="pf-tr" tip="Ayuda al consejero y a la renta: un empleado, un independiente y un pensionado tienen reglas distintas."><Combobox id="pf-tr" value={p.trabajo} onChange={(v) => save({ trabajo: v })} options={TRABAJO} placeholder="Elige tu situación" /></FormField>
              <FormField label="Ocupación" htmlFor="pf-o" tip={false}><Blur id="pf-o" placeholder="Ej. Contadora, conductor, docente" value={p.ocupacion} onSave={(v) => save({ ocupacion: v })} /></FormField>
              <FormField label="Teléfono" htmlFor="pf-t" tip={false}><Blur id="pf-t" type="tel" inputMode="tel" value={p.telefono} onSave={(v) => save({ telefono: v })} /></FormField>
            </div>
            <AddressFields idPrefix="pf" value={addr} onChange={(a) => save({ direccion: a as never, ciudad: a.ciudad })} />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Tipo de documento" htmlFor="pf-dt" tip={false}><Combobox id="pf-dt" value={p.doc_tipo} onChange={(v) => saveDoc(p.doc, v)} options={DOCS} /></FormField>
              <FormField label="Número de documento" htmlFor="pf-doc" tip="Se usa en los acuerdos de pago que generes."><Blur id="pf-doc" inputMode="numeric" value={p.doc} onSave={(v) => saveDoc(v.replace(/[^\dA-Za-z-]/g, ""))} /></FormField>
{p.doc_tipo === "CC" ? (
                <div className="grid content-center gap-0.5 rounded-lg bg-secondary/60 px-4 py-3 sm:col-span-2">
                  <p className="text-sm">Fechas DIAN: <b className="tabular-nums">{p.digitos ? `termina en ${p.digitos}` : "escribe tu cédula"}</b></p>
                  <p className="text-xs text-muted-foreground">Los 2 últimos dígitos se toman solos de tu cédula. La DIAN asigna tu fecha de declaración según ellos.</p>
                </div>
              ) : (
                <FormField label="Últimos 2 dígitos de tu NIT" htmlFor="pf-d" tip="Con cédula de extranjería o pasaporte, tu NIT lo asigna la DIAN y es otro número. La fecha de tu declaración depende de sus 2 últimos dígitos."><Blur id="pf-d" inputMode="numeric" maxLength={2} placeholder="Para fechas DIAN" value={p.digitos} onSave={(v) => { if (/^\d{0,2}$/.test(v)) save({ digitos: v }); else toast.error("Escribe solo dos números") }} /></FormField>
              )}
            </div>
            <FormField label="¿Cómo te sientes con el riesgo?" tip={false}>
              <ChoiceCards cols={3} value={p.riesgo} onChange={(v) => save({ riesgo: v })} items={[{ value: "conservador", label: "Conservador", desc: "Prefiero no perder", icon: "shield-check" }, { value: "moderado", label: "Moderado", desc: "Algo de riesgo", icon: "scale" }, { value: "arriesgado", label: "Arriesgado", desc: "Busco ganar más", icon: "zap" }]} />
            </FormField>
            <FormField label="Tu meta financiera principal" htmlFor="pf-m" tip={false}><Blur id="pf-m" disabled={!canEdit} placeholder="Ej. Comprar casa en 5 años" value={cfg?.meta ?? ""} onSave={(v) => saveCfg.mutate({ meta: v })} /></FormField>
          </FieldGroup>
        </Card>

        <div className="grid gap-6">
          <Card className="gap-3 p-5 shadow-card ring-0">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">Tu perfil está al {pct} %</h2>
              <span className="text-sm text-muted-foreground">{done} de {checks.length}</span>
            </div>
            <Progress value={pct} className="h-2" aria-label={`Perfil completo al ${pct} %`} />
            {pct < 100 ? (
              <ul className="grid gap-0.5">
                {checks.map(([ok, label, id]) => (
                  <li key={id}>
                    <button type="button" disabled={ok} onClick={() => focus(id)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-hover disabled:hover:bg-transparent">
                      {ok ? <CircleCheck className="size-4 shrink-0 text-success" /> : <CircleDashed className="size-4 shrink-0 text-muted-foreground" />}
                      <span className={ok ? "text-muted-foreground line-through" : ""}>{label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">¡Todo listo! Con tu perfil completo, los avisos, las fechas DIAN y los consejos son más precisos.</p>}
          </Card>

          <Card className="gap-3 p-5 shadow-card ring-0">
            <h2 className="flex items-center gap-2 font-semibold"><Gift className="size-4 text-brand" /> Próximos cumpleaños</h2>
            {!cumples.length ? <p className="text-sm text-muted-foreground">Agrega tu fecha de nacimiento y la de cada integrante para recordarte sus cumpleaños con tiempo.</p> : (
              <ul className="grid gap-1">
                {cumples.slice(0, 5).map((x) => (
                  <li key={x.id} className="flex items-center gap-3 rounded-lg p-1.5">
                    <UserAvatar src={x.avatar} name={x.nombre} square className="size-10" fallbackClassName="text-xs" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{x.nombre}</p><p className="text-xs text-muted-foreground">Cumple {x.c.años} años</p></div>
                    <StatusPill tone={x.c.dias === 0 ? "warn" : x.c.dias <= 15 ? "info" : "gray"}>{x.c.dias === 0 ? "¡Hoy!" : x.c.dias === 1 ? "Mañana" : `En ${x.c.dias} días`}</StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="gap-3 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Cuentas conectadas</h2>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-[28%] bg-secondary"><Mail className="size-5" /></span>
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">Correo</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div>
              <StatusPill tone="ok">Activa</StatusPill>
            </div>
            <div className="flex items-center gap-3">
              <BrandLogo k="google" size={40} />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">Google</p><p className="truncate text-xs text-muted-foreground">{google ? (google.identity_data?.email as string) ?? "Conectada" : "Entra con un toque y usa tu foto de Google"}</p></div>
              {google ? <StatusPill tone="ok">Conectada</StatusPill> : <Button size="sm" variant="outline" onClick={linkGoogle} disabled={linking}>{linking && <Spinner />}Vincular</Button>}
            </div>
            <p className="text-xs text-muted-foreground">Contraseña, verificación en dos pasos y sesiones abiertas en <Link className="underline" href="/ajustes?tab=seguridad">Ajustes › Seguridad</Link>.</p>
          </Card>

          <Card className="gap-3 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Resumen</h2>
            <div className="grid grid-cols-2 gap-2">
              {([[<Money key="i" value={ing} className="text-success" />, "Ingreso mensual"], [<Money key="p" value={T.pat} />, "Patrimonio"], [counts?.contactos ?? "—", "Contactos"], [counts?.metas ?? "—", "Metas"]] as [React.ReactNode, string][]).map(([v, l]) => <div key={l} className="rounded-lg bg-secondary/70 p-3"><p className="text-lg font-semibold tabular-nums">{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>)}
            </div>
            {gami && (
              <Link href="/logros" className="flex items-center gap-3 rounded-lg bg-brand-soft/60 p-3 hover:bg-brand-soft">
                <Medal className="size-5 text-brand" />
                <span className="flex-1 text-sm"><b>{Object.keys(gami.st.unl).length} insignias</b> · {gami.X.total} puntos</span>
                <ArrowRight className="size-4" />
              </Link>
            )}
            <Button variant="outline" asChild><Link href="/ingresos"><ArrowDownToLine /> Ver mis ingresos</Link></Button>
          </Card>
        </div>
      </section>

      <CobroCard nombre={p.nombre || user.email} items={(p.cobro as Cobro[]) ?? []} onChange={(items) => save({ cobro: items as never }, "Medios de pago actualizados")} />

      {/* Integrantes como perfiles de Netflix */}
      <Card className="gap-5 p-5 shadow-card ring-0" id="famCard">
        <div><h2 className="text-[17px] font-bold">¿Quiénes hacen parte de tu hogar?</h2><p className="text-sm text-muted-foreground">Las personas con las que compartes el dinero de la casa. Te sirve para saber quién gasta qué y para darle a cada uno un presupuesto.</p></div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 min-[480px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {members.map((m) => (
            <div key={m.id} className="group relative grid justify-items-center gap-2 text-center">
              <button type="button" disabled={!canEdit} onClick={() => setEdit(m)} aria-label={`Editar ${m.nombre}`}
                className="rounded-[22%] outline-none transition-transform duration-200 hover:scale-[1.05] focus-visible:ring-2 focus-visible:ring-ring enabled:hover:ring-4 enabled:hover:ring-foreground/60 enabled:hover:ring-offset-2 enabled:hover:ring-offset-card">
                <UserAvatar src={m.avatar || (m.es_titular ? p.avatar_url : null)} name={m.nombre} square className="size-24" fallbackClassName="text-2xl" />
              </button>
              <div className="grid gap-0.5">
                <p className="font-semibold">{m.nombre}</p>
                <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><Icon name={(PARENT_IC as Record<string, string>)[m.rol] ?? "user"} className="size-3" />{m.rol}</p>
                <p className="text-xs text-muted-foreground">{+m.cupo > 0 ? <><Money value={+m.cupo} /> al mes</> : "Sin presupuesto propio"}</p>
                {(() => { const c = proxCumple(m.es_titular ? p.nacimiento : m.nacimiento); return c && c.dias <= 30 ? <p className="flex items-center justify-center gap-1 text-xs font-semibold text-brand"><Cake className="size-3" />{c.dias === 0 ? "¡Cumple hoy!" : `Cumple en ${c.dias} días`}</p> : null })()}
              </div>
              {canEdit && !m.es_titular && (
                <Button size="icon-sm" variant="ghost" className="absolute top-0 right-0 text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100" aria-label={`Eliminar ${m.nombre}`} onClick={() => del(m)}><Trash2 /></Button>
              )}
            </div>
          ))}
          {canEdit && (
            <button type="button" onClick={() => setEdit(null)} className="group grid justify-items-center gap-2 text-center outline-none">
              <span className="grid size-24 place-items-center rounded-[22%] border-2 border-dashed border-muted-foreground/40 text-muted-foreground transition group-hover:scale-[1.05] group-hover:border-foreground/60 group-hover:text-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring">
                <Plus className="size-9" />
              </span>
              <span className="font-semibold text-muted-foreground group-hover:text-foreground">Agregar integrante</span>
            </button>
          )}
        </div>
      </Card>
      {edit !== undefined && <MemberDialog m={edit} onClose={() => setEdit(undefined)} />}
    </div>
  )
}
