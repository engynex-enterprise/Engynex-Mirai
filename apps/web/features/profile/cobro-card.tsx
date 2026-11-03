"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { QRCodeSVG } from "qrcode.react"
import {
  ArrowDown, ArrowLeftRight, ArrowUp, Copy, CopyCheck, Eye, EyeOff, KeyRound, Landmark, Link2, MoreHorizontal, Pencil, Plus, QrCode,
  Share2, Smartphone, Star, Trash2,
} from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { FormField } from "@/components/mirai/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { SectionTitle } from "@/components/mirai/panel"
import { SubmitButton } from "@/components/mirai/submit-button"
import { IconButton } from "@/components/mirai/tip"
import {
  agrupar, cobroTexto, detectarLlave, entidad, entidadDeGrupo, ENTIDADES, enmascarar, etiqueta, GRUPOS, limpiarLlave, LLAVES,
  marcarPrincipal, mostrar, moverEntidad, moverItem, nombreEntidad, normalizarCobros, paraCopiar, principalDe, validarCuenta,
  validarEnlace, validarLlave, type Cobro, type CobroClase, type CuentaTipo, type LlaveTipo, type ModoCompartir,
} from "@/lib/domain/cobros"

export type { Cobro } from "@/lib/domain/cobros"
export { cobroTexto } from "@/lib/domain/cobros"

const DOCS = [{ v: "CC", n: "Cédula (CC)" }, { v: "CE", n: "Cédula de extranjería (CE)" }, { v: "NIT", n: "NIT" }, { v: "PA", n: "Pasaporte" }, { v: "PPT", n: "PPT" }]
const POPULARES = ["bancolombia", "nequi", "daviplata", "davivienda", "nubank", "breb"]
const OJO_KEY = "mirai-cobro-oculto"

// Ojo propio para ocultar los números (además del modo privado). Preferencia del navegador; si no hay almacenamiento, en memoria.
const noop = () => () => {}
const ojoSubs = new Set<() => void>()
let ojoMem = false
const ojoSub = (cb: () => void) => { ojoSubs.add(cb); return () => { ojoSubs.delete(cb) } }
const ojoGet = () => { try { const v = localStorage.getItem(OJO_KEY); return v == null ? ojoMem : v === "1" } catch { return ojoMem } }
function ojoSet(v: boolean) {
  ojoMem = v
  try { localStorage.setItem(OJO_KEY, v ? "1" : "0") } catch { /* sin almacenamiento */ }
  ojoSubs.forEach((f) => f())
}

/** Logo de la entidad (lib/brands); "Otra entidad" con un ícono de banco. */
function EntidadLogo({ k, size = 40 }: { k: string; size?: number }) {
  const e = entidad(k)
  if (e.brand) return <BrandLogo k={e.brand} size={size} />
  return <span aria-hidden className="grid shrink-0 place-items-center rounded-[28%] bg-secondary text-muted-foreground" style={{ width: size, height: size }}><Landmark className="size-[45%]" /></span>
}
function ClaseIcon({ c }: { c: Cobro }) {
  const I = c.clase === "llave" ? KeyRound : c.clase === "enlace" ? Link2 : entidad(c.entidad).cel ? Smartphone : Landmark
  return <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground"><I className="size-4" /></span>
}

/** "Llave … copiada" / "Número Nequi copiado". */
const oa = (c: Cobro) => (c.clase === "llave" || (c.clase === "cuenta" && !entidad(c.entidad).cel) ? "a" : "o")

async function copiar(t: string, msg = "Copiado") {
  try { await navigator.clipboard.writeText(t); toast.success(msg) } catch { toast.error("No se pudo copiar", { description: "Mantén presionado el texto para copiarlo a mano." }) }
}

// ——— Selector de entidad (con búsqueda y agrupado) ———
function EntidadPicker({ onPick }: { onPick: (k: string) => void }) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-2 text-[13px] font-semibold text-muted-foreground">Las más usadas</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {POPULARES.map((k) => (
            <button key={k} type="button" onClick={() => onPick(k)} aria-label={`Elegir ${entidad(k).n}`}
              className="grid w-[72px] shrink-0 justify-items-center gap-1.5 rounded-lg p-1.5 text-center text-[12px] leading-tight outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring">
              <EntidadLogo k={k} size={40} /><span className="line-clamp-2">{entidad(k).n}</span>
            </button>
          ))}
        </div>
      </div>
      <Command className="rounded-lg border">
        <CommandInput placeholder="Busca tu banco, billetera o cooperativa…" aria-label="Buscar entidad" />
        <CommandList className="max-h-[min(50dvh,340px)]">
          <CommandEmpty>No la encontramos. Elige «Otra entidad» y escribe su nombre.</CommandEmpty>
          {GRUPOS.map(({ g, n }) => (
            <CommandGroup key={g} heading={n}>
              {ENTIDADES.filter((e) => e.g === g).map((e) => (
                <CommandItem key={e.k} value={e.k} keywords={[e.n, n]} onSelect={() => onPick(e.k)} className="gap-3 py-2">
                  <EntidadLogo k={e.k} size={30} />
                  <span className="truncate">{e.n}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>
  )
}

// ——— Agregar o editar una llave o cuenta ———
/** En billeteras empieza por el número de celular; en bancos y cooperativas, por la llave Bre-B. */
const claseInicial = (k: string): CobroClase => { const e = entidad(k); return e.cel && e.clases.includes("cuenta") ? "cuenta" : e.clases[0] }
function CobroDialog({ open, onOpenChange, item, entidadInicial, titular, hayOtros, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; item: Cobro | null; entidadInicial: string | null; titular: string; hayOtros: boolean
  onSave: (c: Cobro) => void
}) {
  const [ent, setEnt] = useState<string | null>(item?.entidad ?? entidadInicial)
  const E = ent ? entidad(ent) : null
  const [clase, setClase] = useState<CobroClase>(item?.clase ?? (E ? claseInicial(E.k) : "llave"))
  const [detalle, setDetalle] = useState(item ? mostrar(item) : "")
  const [auto, setAuto] = useState(!item?.llave)
  const [llave, setLlave] = useState<LlaveTipo>(item?.llave ?? "celular")
  const [tipo, setTipo] = useState<CuentaTipo>(item?.tipo ?? "ahorros")
  const [banco, setBanco] = useState(item?.entidad === "otro" ? (item.banco ?? "") : "")
  const [nom, setNom] = useState(item ? (item.titular ?? "") : titular)
  const [docTipo, setDocTipo] = useState(item?.doc_tipo ?? "CC")
  const [doc, setDoc] = useState(item?.doc ?? "")
  const [alias, setAlias] = useState(item?.alias ?? "")
  const [principal, setPrincipal] = useState(item?.principal ?? !hayOtros)
  const [tried, setTried] = useState(false)
  // Los errores se muestran al salir del campo (o al intentar guardar), no mientras se escribe.
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const touch = (k: string) => () => setTouched((t) => (t[k] ? t : { ...t, [k]: true }))
  const show = (k: string) => tried || !!touched[k]

  const pick = (k: string) => { setEnt(k); if (!item || !entidad(k).clases.includes(clase)) setClase(claseInicial(k)) }
  const tipoLlave: LlaveTipo = auto ? (detectarLlave(detalle) ?? "celular") : llave
  const cel = !!E?.cel
  const err = !E ? null
    : clase === "llave" ? validarLlave(tipoLlave, detalle)
    : clase === "enlace" ? validarEnlace(detalle)
    : validarCuenta(detalle, cel)
  const errBanco = ent === "otro" && !banco.trim() ? "Escribe el nombre de la entidad" : null
  const errDoc = clase === "cuenta" && !cel && doc.trim() && !/^[\d\s.-]{5,15}$/.test(doc.trim()) && docTipo !== "PA" && docTipo !== "PPT" ? "El documento tiene solo números" : null

  const valid = !!E && !err && !errBanco && !errDoc
  const submit = () => {
    setTried(true)
    if (!E || err || errBanco || errDoc) return toast.error(errBanco ?? err ?? errDoc ?? "Revisa los datos")
    const base: Cobro = { id: item?.id ?? crypto.randomUUID(), medio: "", entidad: E.k, clase, detalle: "" }
    const extra: Partial<Cobro> = {
      ...(alias.trim() ? { alias: alias.trim() } : {}), ...(principal ? { principal: true } : {}), ...(ent === "otro" ? { banco: banco.trim() } : {}),
    }
    if (clase === "llave") onSave({ ...base, ...extra, llave: tipoLlave, detalle: limpiarLlave(tipoLlave, detalle) })
    else if (clase === "enlace") onSave({ ...base, ...extra, detalle: detalle.trim() })
    else if (cel) onSave({ ...base, ...extra, detalle: limpiarLlave("celular", detalle) })
    else onSave({ ...base, ...extra, detalle: detalle.trim(), tipo, ...(nom.trim() ? { titular: nom.trim() } : {}), ...(doc.trim() ? { doc_tipo: docTipo, doc: doc.trim() } : {}) })
    onOpenChange(false)
  }

  const claseItems = (E?.clases ?? []).map((c) => ({
    value: c, label: c === "llave" ? "Llave Bre-B" : c === "enlace" ? "Enlace de pago" : cel ? "Número de celular" : "Cuenta",
    icon: c === "llave" ? "key-round" : c === "enlace" ? "link" : cel ? "smartphone" : "landmark",
  }))

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={item ? "Editar medio de pago" : "Agregar un medio de pago"}
      description={!E ? "¿Dónde te pueden pagar? Busca tu banco, billetera o cooperativa." : "Solo tú y tu familia lo ven. Lo compartes cuando quieras."}
      onBack={E && !item && !entidadInicial ? () => setEnt(null) : undefined}
      footer={E ? <><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <SubmitButton onClick={submit} disabled={!valid} hint={errBanco ?? err ?? errDoc ?? "Completa los datos"}>{item ? "Guardar" : "Agregar"}</SubmitButton></> : undefined}>
      {!E ? <EntidadPicker onPick={pick} /> : (
        <FieldGroup>
          <div className="flex items-center gap-3 rounded-xl bg-secondary/60 p-3">
            <EntidadLogo k={E.k} size={44} />
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{ent === "otro" ? banco.trim() || "Otra entidad" : E.n}</p><p className="text-xs text-muted-foreground">{GRUPOS.find((x) => x.g === E.g)?.n}</p></div>
            <Button size="sm" variant="ghost" onClick={() => setEnt(null)}><ArrowLeftRight /> Cambiar</Button>
          </div>
          {ent === "otro" && (
            <FormField label="Nombre de la entidad" htmlFor="cb-banco" required tip={false} error={show("banco") ? errBanco ?? undefined : undefined}>
              <Input id="cb-banco" className="h-11" placeholder="Ej. Cooperativa de mi empresa" value={banco} onChange={(e) => setBanco(e.target.value)} onBlur={touch("banco")} />
            </FormField>
          )}
          {claseItems.length > 1 && (
            <FormField label="¿Qué quieres guardar?" tip={false}>
              <Segmented value={clase} onChange={(v) => { setClase(v as CobroClase); setTried(false); setTouched({}) }} items={claseItems} />
            </FormField>
          )}
          {clase === "llave" ? (
            <>
              <FormField label="Tu llave" htmlFor="cb-det" required error={show("det") ? err ?? undefined : undefined}
                tip="La llave que registraste en tu banco para Bre-B: tu celular, tu cédula, tu correo, una llave alfanumérica (empieza por @) o el código de tu comercio."
                hint={detalle.trim() && auto ? <>Detectamos: <b>{LLAVES.find((x) => x.v === tipoLlave)?.n}</b>. Si no es, cámbialo abajo.</> : undefined}>
                <Input id="cb-det" className="h-11" autoComplete="off" placeholder="Ej. @tunombre, 300 123 4567 o tu@correo.com" value={detalle} onChange={(e) => setDetalle(e.target.value)} onBlur={() => detalle.trim() && touch("det")()} />
              </FormField>
              <FormField label="Tipo de llave" tip={false}>
                <Segmented value={tipoLlave} onChange={(v) => { setAuto(false); setLlave(v as LlaveTipo) }} items={LLAVES.map((x) => ({ value: x.v, label: x.n }))} />
              </FormField>
            </>
          ) : clase === "enlace" ? (
            <FormField label="Enlace de pago" htmlFor="cb-det" required tip="El enlace o botón de pago que te dio tu banco o tu pasarela para que te paguen por PSE." error={show("det") ? err ?? undefined : undefined}>
              <Input id="cb-det" className="h-11" inputMode="url" placeholder="https://…" value={detalle} onChange={(e) => setDetalle(e.target.value)} onBlur={() => detalle.trim() && touch("det")()} />
            </FormField>
          ) : cel ? (
            <FormField label="Celular" htmlFor="cb-det" required tip={false} error={show("det") ? err ?? undefined : undefined}
              hint={E.k === "transfiya" ? "El celular que inscribiste en tu banco para recibir por Transfiya." : `El celular con el que tienes ${E.n}.`}>
              <Input id="cb-det" className="h-11" inputMode="tel" placeholder="Ej. 300 123 4567" value={detalle} onChange={(e) => setDetalle(e.target.value)} onBlur={() => detalle.trim() && touch("det")()} />
            </FormField>
          ) : (
            <>
              <FormField label="Tipo de cuenta" tip={false}>
                <ChoiceCards value={tipo} onChange={(v) => setTipo(v as CuentaTipo)} items={[{ value: "ahorros", label: "Ahorros", icon: "piggy-bank" }, { value: "corriente", label: "Corriente", icon: "landmark" }]} />
              </FormField>
              <FormField label="Número de cuenta" htmlFor="cb-det" required tip={false} error={show("det") ? err ?? undefined : undefined}>
                <Input id="cb-det" className="h-11" inputMode="numeric" placeholder="Ej. 123-456789-01" value={detalle} onChange={(e) => setDetalle(e.target.value)} onBlur={() => detalle.trim() && touch("det")()} />
              </FormField>
              <FormField label="A nombre de" htmlFor="cb-tit" tip={false}><Input id="cb-tit" className="h-11" value={nom} onChange={(e) => setNom(e.target.value)} /></FormField>
              <FormField label="Documento del titular (opcional)" htmlFor="cb-doc" tip="Algunos bancos lo piden para transferir desde otro banco." error={errDoc ?? undefined}>
                <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-2">
                  <Select value={docTipo} onValueChange={setDocTipo}>
                    <SelectTrigger className="h-11! w-full" aria-label="Tipo de documento"><SelectValue /></SelectTrigger>
                    <SelectContent>{DOCS.map((d) => <SelectItem key={d.v} value={d.v}>{d.n}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input id="cb-doc" className="h-11" inputMode="numeric" placeholder="Número" value={doc} onChange={(e) => setDoc(e.target.value)} />
                </div>
              </FormField>
            </>
          )}
          <FormField label="Nombre para reconocerla (opcional)" htmlFor="cb-alias" tip={false} hint="Solo lo ves tú; no se envía al compartir.">
            <Input id="cb-alias" className="h-11" maxLength={40} placeholder={clase === "llave" ? "Ej. Llave del negocio" : "Ej. Cuenta nómina"} value={alias} onChange={(e) => setAlias(e.target.value)} />
          </FormField>
          <label htmlFor="cb-pri" className="flex cursor-pointer items-center gap-3 rounded-xl bg-secondary/60 p-3">
            <Star className="size-5 shrink-0 text-[#E0A100]" aria-hidden />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Usar como principal</span><span className="block text-xs text-muted-foreground">Es la que se comparte cuando eliges «Solo la principal».</span></span>
            <Switch id="cb-pri" checked={principal} onCheckedChange={setPrincipal} />
          </label>
        </FieldGroup>
      )}
    </ResponsiveDialog>
  )
}

// ——— Compartir (vista previa del mensaje) y códigos QR ———
function ShareDialog({ open, onOpenChange, nombre, items }: { open: boolean; onOpenChange: (o: boolean) => void; nombre: string; items: Cobro[] }) {
  const [modo, setModo] = useState<ModoCompartir>("principal")
  const texto = cobroTexto(nombre, items, items.length > 1 ? modo : "todas")
  const canShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false)
  const share = async () => { try { await navigator.share({ title: `Para pagarle a ${nombre}`, text: texto }) } catch { /* canceló */ } }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Compartir tus datos de pago"
      description="Mira cómo queda el mensaje antes de enviarlo. Puedes mandar solo la principal o todas.">
      <div className="grid gap-4 pb-2">
        {items.length > 1 && <Segmented value={modo} onChange={(v) => setModo(v as ModoCompartir)} items={[{ value: "principal", label: "Solo la principal", icon: "star" }, { value: "todas", label: `Todas (${items.length})`, icon: "list" }]} />}
        <div className="rounded-2xl bg-[#E7FFDB] p-3 text-[14px] leading-relaxed text-[#111B21] shadow-card dark:bg-[#005C4B] dark:text-[#E9EDEF]">
          <p className="mb-1 text-[12px] font-semibold opacity-70">Vista previa</p>
          <pre className="font-sans whitespace-pre-wrap break-words" data-money aria-label="Mensaje que se envía">{texto}</pre>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button asChild className="bg-[#25D366] text-white hover:bg-[#1ebe5a]">
            <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"><BrandLogo k="whatsapp" size={20} bare /> WhatsApp</a>
          </Button>
          {canShare && <Button variant="outline" onClick={share}><Share2 /> Más opciones</Button>}
          <Button variant="outline" onClick={() => copiar(texto, "Mensaje copiado")}><Copy /> Copiar mensaje</Button>
        </div>
      </div>
    </ResponsiveDialog>
  )
}

function QrDialog({ open, onOpenChange, nombre, items, solo }: { open: boolean; onOpenChange: (o: boolean) => void; nombre: string; items: Cobro[]; solo: Cobro | null }) {
  const [modo, setModo] = useState<ModoCompartir>("todas")
  const texto = solo ? cobroTexto(nombre, [solo]) : cobroTexto(nombre, items, items.length > 1 ? modo : "todas")
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={solo ? `Código QR · ${nombreEntidad(solo)}` : "Tu código para recibir pagos"}
      description="Que la otra persona lo escanee con la cámara del celular: verá tus datos para pagarte. No es el QR de pagos de tu banco.">
      <div className="grid justify-items-center gap-4 pb-2">
        {!solo && items.length > 1 && <Segmented value={modo} onChange={(v) => setModo(v as ModoCompartir)} items={[{ value: "principal", label: "Solo la principal" }, { value: "todas", label: "Todas" }]} />}
        <div className="rounded-2xl bg-white p-4 shadow-card"><QRCodeSVG value={texto} size={220} level="M" marginSize={0} /></div>
        <pre className="w-full rounded-lg bg-secondary/60 p-3 text-[13px] whitespace-pre-wrap break-words" data-money>{texto}</pre>
        <Button variant="outline" onClick={() => copiar(texto)}><Copy /> Copiar texto</Button>
      </div>
    </ResponsiveDialog>
  )
}

// ——— Tarjeta ———
/**
 * "Recibe pagos": por cada banco, billetera o cooperativa, tus llaves Bre-B y cuentas. Una es la principal (la que se
 * comparte por defecto). Copiar con un toque, QR por llave o general, compartir por WhatsApp con vista previa.
 */
export function CobroCard({ nombre, items: raw, onChange, readOnly }: {
  nombre: string; items: Cobro[]
  /** `msg` es el aviso del guardado; `false` cuando la tarjeta ya mostró el suyo (Deshacer). */
  onChange: (items: Cobro[], msg?: string | false) => void
  readOnly?: boolean
}) {
  const items = useMemo(() => normalizarCobros(raw), [raw])
  const grupos = useMemo(() => agrupar(items), [items])
  // `open` aparte: al cerrar, la ventana sale con su animación mostrando lo mismo; `n` la reinicia al abrirla de nuevo.
  const [dlg, setDlgState] = useState<{ item: Cobro | null; entidad: string | null; open: boolean; n: number } | null>(null)
  const setDlg = (d: { item: Cobro | null; entidad: string | null }) => setDlgState((x) => ({ ...d, open: true, n: (x?.n ?? 0) + 1 }))
  const [share, setShare] = useState(false)
  const [qr, setQr] = useState<{ solo: Cobro | null } | null>(null)
  const oculto = useSyncExternalStore(ojoSub, ojoGet, () => false)
  const toggleOjo = () => ojoSet(!oculto)
  const commit = (next: Cobro[], msg?: string | false) => onChange(normalizarCobros(next), msg)

  const guardar = (c: Cobro) => {
    const existe = items.some((x) => x.id === c.id)
    let next = existe ? items.map((x) => (x.id === c.id ? c : x)) : (() => {
      // Nueva: queda al final de su entidad (o al final de la lista si la entidad es nueva)
      const last = items.map((x) => x.entidad === c.entidad && (c.entidad !== "otro" || x.banco === c.banco)).lastIndexOf(true)
      return last < 0 ? [...items, c] : [...items.slice(0, last + 1), c, ...items.slice(last + 1)]
    })()
    if (c.principal) next = marcarPrincipal(next, c.id)
    else if (existe && items.find((x) => x.id === c.id)?.principal) next = next.map((x) => (x.id === c.id ? { ...x, principal: true } : x))
    commit(next, existe ? "Medio de pago actualizado" : `${etiqueta(c)} agregad${oa(c)} en ${nombreEntidad(c)}`)
  }
  const eliminar = (c: Cobro) => {
    const prev = items
    commit(items.filter((x) => x.id !== c.id), false)
    toast(`${etiqueta(c)} eliminad${oa(c)}`, { description: nombreEntidad(c), action: { label: "Deshacer", onClick: () => commit(prev, "Recuperada") } })
  }
  const eliminarEntidad = (key: string, n: number, nom: string) => {
    const prev = items
    commit(agrupar(items).filter((g) => g.entidad !== key).flatMap((g) => g.items), false)
    toast(`${nom} eliminada`, { description: `${n} ${n === 1 ? "dato" : "datos"} de pago`, action: { label: "Deshacer", onClick: () => commit(prev, "Recuperada") } })
  }
  const principal = principalDe(items)
  const valor = (c: Cobro) => (oculto ? enmascarar(c) : mostrar(c))
  const todo = cobroTexto(nombre, items)

  return (
    <Card className="gap-4 p-5 shadow-card ring-0" id="cobro">
      <SectionTitle icon="hand-coins"
        description="Tus llaves Bre-B y cuentas por banco o billetera, para que te paguen un préstamo o te devuelvan plata. Compártelas con un toque."
        action={<>
          {items.length > 0 && (
            <IconButton icon={oculto ? <Eye /> : <EyeOff />} onClick={toggleOjo} label={oculto ? "Mostrar números" : "Ocultar números"} aria-pressed={oculto} />
          )}
          {!readOnly && <Button variant="outline" onClick={() => setDlg({ item: null, entidad: null })}><Plus /> Agregar</Button>}
        </>}>Recibe pagos</SectionTitle>

      {!items.length ? (
        <div className="grid justify-items-center gap-3 rounded-xl bg-secondary/60 px-4 py-6 text-center">
          <div className="flex -space-x-2" aria-hidden>{["bancolombia", "nequi", "daviplata", "breb"].map((k) => <span key={k} className="rounded-[30%] ring-2 ring-card"><EntidadLogo k={k} size={36} /></span>)}</div>
          <p className="font-semibold">Aún no tienes dónde recibir pagos</p>
          <p className="max-w-md text-sm text-muted-foreground">Agrega tus llaves Bre-B, tu Nequi o tu cuenta. Cuando alguien te deba, le mandas los datos sin buscarlos.</p>
          {!readOnly && <Button onClick={() => setDlg({ item: null, entidad: null })}><Plus /> Agregar mi primera llave o cuenta</Button>}
        </div>
      ) : (
        <div className="grid gap-3">
          {grupos.map((g, gi) => {
            const entKey = entidadDeGrupo(g.entidad)
            const llaves = g.items.filter((c) => c.clase === "llave").length
            const resumen = [llaves && `${llaves} ${llaves === 1 ? "llave" : "llaves"}`, g.items.length - llaves && `${g.items.length - llaves} ${g.items.length - llaves === 1 ? "cuenta" : "cuentas"}`].filter(Boolean).join(" · ")
            return (
              <section key={g.entidad} aria-label={g.nombre} className="overflow-hidden rounded-xl border bg-card">
                <header className="flex items-center gap-3 border-b bg-secondary/40 px-3 py-2.5">
                  <EntidadLogo k={entKey} size={40} />
                  <div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{g.nombre}</h3><p className="text-xs text-muted-foreground">{resumen}</p></div>
                  {!readOnly && (
                    <>
                      <IconButton size="icon-sm" icon={<Plus />} label={`Agregar en ${g.nombre}`} onClick={() => setDlg({ item: null, entidad: entKey })} />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`Opciones de ${g.nombre}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDlg({ item: null, entidad: entKey })}><Plus /> Agregar llave o cuenta</DropdownMenuItem>
                          <DropdownMenuItem disabled={gi === 0} onSelect={() => commit(moverEntidad(items, g.entidad, -1), "Orden actualizado")}><ArrowUp /> Subir entidad</DropdownMenuItem>
                          <DropdownMenuItem disabled={gi === grupos.length - 1} onSelect={() => commit(moverEntidad(items, g.entidad, 1), "Orden actualizado")}><ArrowDown /> Bajar entidad</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => eliminarEntidad(g.entidad, g.items.length, g.nombre)}><Trash2 /> Eliminar {g.nombre}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </header>
                <ul className="divide-y">
                  {g.items.map((c, i) => {
                    const lbl = etiqueta(c)
                    const nm = `${lbl} de ${g.nombre}`
                    return (
                      <li key={c.id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-hover sm:gap-3">
                        <ClaseIcon c={c} />
                        <div className="min-w-0 flex-1">
                          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-muted-foreground">
                            <span className="truncate">{c.alias ? <><b className="font-semibold text-foreground">{c.alias}</b> · {lbl}</> : lbl}</span>
                            {c.principal && <Badge className="h-5 gap-1 bg-brand-soft px-1.5 text-[11px] text-link"><Star className="size-3 fill-current" aria-hidden /> Principal</Badge>}
                          </p>
                          <button type="button" onClick={() => copiar(paraCopiar(c), `${lbl} copiad${oa(c)}`)} title="Toca para copiar"
                            className="block max-w-full truncate rounded text-left font-mono text-[15px] font-semibold tabular-nums outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring" data-money>
                            {valor(c)}
                          </button>
                          {c.clase === "cuenta" && c.titular && !entidad(c.entidad).cel && <p className="truncate text-xs text-muted-foreground">A nombre de {c.titular}</p>}
                        </div>
                        <IconButton size="icon-sm" icon={<Copy />} label={`Copiar ${nm}`} onClick={() => copiar(paraCopiar(c), `${lbl} copiad${oa(c)}`)} />
                        <IconButton size="icon-sm" icon={<QrCode />} label={`Código QR de ${nm}`} className="max-[359px]:hidden" onClick={() => setQr({ solo: c })} />
                        {!readOnly && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`Más opciones de ${nm}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setDlg({ item: c, entidad: null })}><Pencil /> Editar</DropdownMenuItem>
                              {!c.principal && <DropdownMenuItem onSelect={() => commit(marcarPrincipal(items, c.id), `${lbl} es ahora la principal`)}><Star /> Marcar como principal</DropdownMenuItem>}
                              <DropdownMenuItem onSelect={() => setQr({ solo: c })}><QrCode /> Código QR</DropdownMenuItem>
                              <DropdownMenuItem disabled={i === 0} onSelect={() => commit(moverItem(items, c.id, -1), "Orden actualizado")}><ArrowUp /> Subir</DropdownMenuItem>
                              <DropdownMenuItem disabled={i === g.items.length - 1} onSelect={() => commit(moverItem(items, c.id, 1), "Orden actualizado")}><ArrowDown /> Bajar</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => eliminar(c)}><Trash2 /> Eliminar</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      {items.length > 0 && (
        <>
          {principal && (
            <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
              <Star className="size-3.5 shrink-0 text-[#E0A100]" aria-hidden />
              <span className="truncate">Principal: {etiqueta(principal)} de {nombreEntidad(principal)}</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Button onClick={() => setShare(true)}><Share2 /> Compartir</Button>
            <Button variant="outline" onClick={() => setQr({ solo: null })}><QrCode /> Código QR</Button>
            <Button variant="outline" className="col-span-2 sm:col-span-1" onClick={() => copiar(todo, "Copiaste todos tus datos de pago")}><CopyCheck /> Copiar todo</Button>
          </div>
        </>
      )}

      {dlg && (
        <CobroDialog key={dlg.n} open={dlg.open} onOpenChange={(o) => setDlgState((x) => (x ? { ...x, open: o } : x))} item={dlg.item} entidadInicial={dlg.entidad}
          titular={nombre} hayOtros={items.length > 0} onSave={guardar} />
      )}
      <ShareDialog open={share} onOpenChange={setShare} nombre={nombre} items={items} />
      <QrDialog open={!!qr} onOpenChange={(o) => !o && setQr(null)} nombre={nombre} items={items} solo={qr?.solo ?? null} />
    </Card>
  )
}
