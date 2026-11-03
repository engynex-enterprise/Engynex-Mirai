"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDownToLine, ArrowRight, Cake, Camera, CircleCheck, CircleDashed, Flame, Medal, Palette, Pencil, Sparkles } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { AddressFields, emptyAddress, type Address } from "@/components/mirai/address-fields"
import { AvatarPicker } from "@/components/mirai/avatar-picker"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { DatePicker } from "@/components/mirai/date-picker"
import { FormField } from "@/components/mirai/field"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { Panel, SectionTitle } from "@/components/mirai/panel"
import { Tip } from "@/components/mirai/tip"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { isMiraiAuth } from "@/lib/auth/provider"
import { ingresoMensual, totales } from "@/lib/domain"
import { digitosDian, edad, monthName, proxCumple, todayISO } from "@/lib/format"
import { BANNER_THEMES, type BannerThemeKey } from "@/lib/content/banners"
import { useBookData } from "@/features/book/use-book-data"
import { useMembers, useSettings } from "@/features/catalogs/hooks"
import { useBookSettingsSave } from "@/features/settings/prefs"
import { useGami } from "@/features/gami/use-gami"
import type { Row } from "@/lib/supabase/tables"
import { normalizarCobros } from "@/lib/domain/cobros"
import { CobroCard } from "./cobro-card"
import { HouseholdPeople } from "@/features/household/people"
import { ConnectedAccounts } from "@/features/account/connected-accounts"

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
  const { user } = useApp()
  const router = useRouter()
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const { data: book } = useBookData()
  const { data: members = [] } = useMembers()
  const { data: cfg } = useSettings()
  const saveCfg = useBookSettingsSave()
  const gami = useGami()
  const [picker, setPicker] = useState(false)
  // Los guardados van en fila: dos seguidos (Deshacer y luego otro cambio) no se pisan en la base.
  const cola = useRef<Promise<unknown>>(Promise.resolve())
  const key = ["profile-full", user.id]
  const { data: p } = useQuery({ queryKey: key, queryFn: async () => (await createClient().from("profiles").select("*").eq("id", user.id).single()).data })
  const { data: identities } = useQuery({
    queryKey: ["identities", user.id],
    // v7: con AUTH_PROVIDER=mirai las formas de entrar salen de Better Auth (listAccounts).
    queryFn: async () => (isMiraiAuth() ? (await import("@/lib/auth/mirai")).identities() : ((await createClient().auth.getUserIdentities()).data?.identities ?? [])),
  })
  const { data: counts } = useQuery({
    queryKey: ["b", bookId, "profile-counts"],
    queryFn: async () => {
      const sb = createClient()
      const [c, g] = await Promise.all([sb.from("contacts").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null), sb.from("goals").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null)])
      return { contactos: c.count ?? 0, metas: g.count ?? 0 }
    },
  })
  if (!p || !book) return <PageSkeleton kpis={0} />

  const save = async (patch: Partial<Row<"profiles">>, msg: string | false = "Guardado") => {
    // Una lectura vieja que llegue tarde no debe deshacer el cambio optimista; y se aplica sobre lo último, no sobre `p`.
    await qc.cancelQueries({ queryKey: key })
    qc.setQueryData(key, (old: typeof p) => ({ ...(old ?? p), ...patch }))
    const run = cola.current.then(() => createClient().from("profiles").update(patch).eq("id", user.id))
    cola.current = run.catch(() => null)
    const { error } = await run
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    if (msg) toast(msg)
    qc.invalidateQueries({ queryKey: ["profile", user.id] })
    // El menú lateral, el saludo y la presencia leen el perfil en el servidor
    if ("avatar_url" in patch || "nombre" in patch || "apodo" in patch || "nacimiento" in patch) router.refresh()
  }
  const saveDoc = (doc: string, tipo = p.doc_tipo) => save({ doc, doc_tipo: tipo, ...(tipo === "CC" ? { digitos: digitosDian(doc) } : {}) })
  const google = identities?.find((i) => i.provider === "google")
  const googlePhoto = (google?.identity_data?.avatar_url ?? google?.identity_data?.picture ?? null) as string | null
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
    [!!(p.nombre ?? "").trim(), "Tu nombre completo", "pf-n"],
    [!!(p.apodo ?? "").trim(), "Cómo quieres que te digamos", "pf-a"],
    [!!p.nacimiento, "Tu fecha de nacimiento", "pf-nac"],
    [!!p.ciudad, "Tu ciudad", "pf-ciudad"],
    [!!p.telefono, "Tu teléfono", "pf-t"],
    [!!p.doc, "Tu número de documento", "pf-doc"],
    [/^\d{2}$/.test(p.digitos), p.doc_tipo === "CC" ? "Tu cédula (de ahí salen tus fechas DIAN)" : "Los 2 últimos dígitos de tu NIT (fechas DIAN)", p.doc_tipo === "CC" ? "pf-doc" : "pf-d"],
    [!!p.trabajo, "Tu situación laboral", "pf-tr"],
    [normalizarCobros(p.cobro).length > 0, "Un medio para recibir pagos", "cobro"],
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
        <Panel title="Tus datos" icon="id-card" description="Se guardan solos al salir de cada campo." className="h-auto">
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
        </Panel>

        <div className="grid gap-6">
          <Panel className="h-auto">
            <SectionTitle icon="circle-check" action={<span className="text-sm text-muted-foreground tabular-nums">{done} de {checks.length}</span>}>Tu perfil está al {pct} %</SectionTitle>
            <Progress value={pct} className="h-2" aria-label={`Perfil completo al ${pct} %`} />
            {pct < 100 ? (
              <ul className="grid gap-0.5">
                {checks.map(([ok, label, id]) => (
                  // Dos pasos pueden llevar al mismo campo (documento y dígitos DIAN): la clave es el texto, no el campo.
                  <li key={`${id}-${label}`}>
                    <button type="button" disabled={ok} onClick={() => focus(id)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-hover disabled:hover:bg-transparent">
                      {ok ? <CircleCheck className="size-4 shrink-0 text-success" /> : <CircleDashed className="size-4 shrink-0 text-muted-foreground" />}
                      <span className={ok ? "text-muted-foreground line-through" : ""}>{label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">¡Todo listo! Con tu perfil completo, los avisos, las fechas DIAN y los consejos son más precisos.</p>}
          </Panel>

          <Panel title="Próximos cumpleaños" icon="gift" className="h-auto">
            {!cumples.length ? <p className="text-sm text-muted-foreground">Agrega tu fecha de nacimiento y la de cada integrante para recordarte sus cumpleaños con tiempo.</p> : (
              <ul className="grid gap-1">
                {cumples.slice(0, 5).map((x) => (
                  <li key={x.id} className="flex items-center gap-3 rounded-lg p-1.5">
                    <UserAvatar src={x.avatar} name={x.nombre} square className="size-10" fallbackClassName="text-xs" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{x.nombre}</p><p className="text-xs text-muted-foreground">Cumple {x.c.años} años</p></div>
                    <Tip label={x.nacimiento ? `Cumple el ${new Date(`${x.nacimiento}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}` : undefined}><span><StatusPill tone={x.c.dias === 0 ? "warn" : x.c.dias <= 15 ? "info" : "gray"}>{x.c.dias === 0 ? "¡Hoy!" : x.c.dias === 1 ? "Mañana" : `En ${x.c.dias} días`}</StatusPill></span></Tip>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <ConnectedAccounts />

          <Panel title="Resumen" icon="chart-pie" className="h-auto">
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
          </Panel>
        </div>
      </section>

      <CobroCard nombre={p.nombre || user.email} items={normalizarCobros(p.cobro)} onChange={(items, msg) => save({ cobro: items as never }, msg ?? "Medios de pago actualizados")} />

      {/* Integrantes como perfiles de Netflix */}
      <Panel id="famCard" title="¿Quiénes hacen parte de tu hogar?" icon="users" className="h-auto gap-5"
        description="Las personas con las que compartes el dinero de la casa. Te sirve para saber quién gasta qué y para darle a cada uno un presupuesto."
        action={<Button variant="ghost" size="sm" asChild><Link href="/ajustes?tab=hogar">Roles e invitaciones</Link></Button>}>
        <HouseholdPeople layout="grid" showMatrix={false} />
      </Panel>
    </div>
  )
}
