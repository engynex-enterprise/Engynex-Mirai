"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ArrowRight, Camera } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { Money } from "@/components/mirai/money"
import { Icon } from "@/components/mirai/icon"
import { Notice } from "@/components/mirai/notice"
import { Barcode, ReceiptArt, ReceiptCard, ReceiptRow } from "@/components/mirai/receipt"
import { AddressFields, emptyAddress, type Address } from "@/components/mirai/address-fields"
import { SubmitButton } from "@/components/mirai/submit-button"
import { FormSkeleton } from "@/components/skeletons/form-skeleton"
import { useApp, useBookId } from "@/components/app/app-context"
import { invalidateBook, useSave } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import {
  CASA_EMPENO, FRECS, SISTEMAS, addPeriod, TASA_EMPENO, TIPOS_CREDITO, camposLoan, faltantesLoan, findContact, findEntity, histPlan, loanEngine, norm, normProv, previewLoan,
  rateFromCuota, sistemaDe,
  textosLoan, tipoDef, tipoDefaults, tiposDe,
  type Campos, type HistMode, type InteresModo, type LoanTipo, type PagoModo, type Sistema, type TextosLoan,
} from "@/lib/domain"
import { fmtDate, fmtMoney, fmtPct, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { contactOptions, entityOptions, useCatalogsReady, useContacts, useEntities, useProviders, useSettings } from "@/features/catalogs/hooks"
import { ProviderSelect } from "@/features/providers/provider-select"
import { suggestLoanProvider } from "@/lib/domain/proveedor-pagos"
import { DOC_TIPOS } from "@/features/contacts/contact-form"
import { EntityDialog } from "@/features/catalogs/entity-dialog"
import { readLoanDoc } from "@/features/ai/actions"
import { descargarAcuerdo } from "./acuerdo"

export type LoanKind = "cobrar" | "pagar"
type Props = {
  kind: LoanKind; open: boolean; onOpenChange: (o: boolean) => void; contactId?: string | null; onSaved?: (id: string) => void
  /** Proveedor ya escogido (desde Proveedores › "Registrar una deuda con este proveedor"): abre el tipo Fiado. */
  providerId?: string | null
  /** Tipo ya escogido (p. ej. ?empeno=1 o ?tipo=fiado). */
  tipo?: LoanTipo | null
}
/** Lo que el pie de la ventana necesita saber del formulario. */
type Foot = { titulo: string; boton: string; valido: boolean; busy: boolean; hint: string }

const plusDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
/** Suma meses sin desbordar el día (31 de enero + 1 mes = 28 o 29 de febrero). */
const plusMonths = (iso: string, m: number) => {
  const [y, mo, d] = iso.split("-").map(Number)
  const t = new Date(Date.UTC(y, mo - 1 + m, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(d, last))
  return t.toISOString().slice(0, 10)
}
/** Fecha del préstamo para que la primera cuota caiga en la fecha escogida (el motor la pone un periodo después). */
const menosPeriodo = (iso: string, frec: string) => {
  if (frec === "quincenal") return plusDays(iso, -15)
  if (frec === "semanal") return plusDays(iso, -7)
  if (frec === "diario") return plusDays(iso, -1)
  if (frec === "diariohab") { const p = plusDays(iso, -1); return new Date(p + "T12:00:00").getDay() === 0 ? plusDays(p, -1) : p }
  return plusMonths(iso, -1)
}
const num = (s: string) => +s.replace(",", ".") || 0
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/** Orden de los bloques del formulario en cada tipo (cada bloque se dibuja solo si aplica). */
type Bloque = "riesgo" | "foto" | "quien" | "credito" | "obj" | "monto" | "inicial" | "concepto" | "inicio" | "primera" | "pago" | "cuotas" | "desde" | "vence"
  | "interes" | "extra" | "empeno" | "prenda" | "nota" | "pdf" | "hist" | "provlink"
const ORDEN: Record<LoanTipo, Bloque[]> = {
  banco: ["foto", "quien", "credito", "monto", "inicio", "interes", "cuotas", "desde", "extra", "concepto", "hist", "provlink"],
  empeno: ["quien", "obj", "monto", "inicio", "interes", "cuotas", "empeno", "hist", "provlink"],
  fiado: ["quien", "monto", "concepto", "inicio", "pago", "vence", "interes"],
  persona: ["quien", "monto", "concepto", "inicio", "pago", "cuotas", "desde", "vence", "interes", "nota", "pdf", "hist", "provlink"],
  cuotas: ["foto", "quien", "concepto", "monto", "inicial", "cuotas", "primera", "interes", "extra", "hist"],
  gota: ["riesgo", "quien", "monto", "inicio", "cuotas", "interes", "nota", "hist"],
  presto: ["quien", "monto", "concepto", "inicio", "pago", "cuotas", "desde", "vence", "interes", "prenda", "nota", "pdf", "hist", "provlink"],
  vendi: ["quien", "concepto", "monto", "inicio", "pago", "cuotas", "desde", "vence", "interes", "nota", "pdf", "hist", "provlink"],
  otro: ["foto", "quien", "monto", "concepto", "inicio", "pago", "cuotas", "desde", "vence", "interes", "prenda", "nota", "hist", "provlink"],
}

export function LoanForm(props: Props) {
  // Con un proveedor ya escogido, espera la lista de proveedores para llenar sus datos.
  const provs = useProviders()
  const ready = useCatalogsReady() && !(props.providerId && provs.isPending)
  const T0 = textosLoan(null, props.kind)
  const [foot, setFoot] = useState<Foot>({ titulo: T0.titulo, boton: T0.boton, valido: false, busy: false, hint: "" })
  // Vista de detalle dentro de la misma ventana (como Agregar ingreso): oculta el formulario sin desmontarlo.
  const [detalle, setDetalle] = useState(false)
  const submitRef = useRef<() => void>(() => {})
  // Al cerrar vuelve al título y al botón de partida (la próxima vez se abre sin tipo escogido).
  const close = (o: boolean) => { if (!o) { setDetalle(false); setFoot({ titulo: T0.titulo, boton: T0.boton, valido: false, busy: false, hint: "" }) } props.onOpenChange(o) }
  const isC = props.kind === "cobrar"
  return (
    <ResponsiveDialog open={props.open} onOpenChange={close} wide="xl" split
      title={detalle ? (isC ? "Detalle del préstamo" : "Detalle de la deuda") : foot.titulo}
      description={detalle ? "Todas las cuotas con su fecha, interés y abono a la deuda, los totales y la explicación en palabras."
        : isC ? "A la izquierda nos cuentas cómo fue el préstamo; a la derecha ves el resumen de lo que te van a pagar." : "A la izquierda nos cuentas cómo es la deuda; a la derecha ves el resumen de lo que vas a pagar."}
      onBack={detalle ? () => setDetalle(false) : undefined}
      footer={<>
        {detalle ? <Button variant="outline" onClick={() => setDetalle(false)}><ArrowLeft /> Volver</Button> : <Button variant="outline" onClick={() => close(false)}>Cancelar</Button>}
        <SubmitButton disabled={!foot.valido} loading={foot.busy} hint={foot.hint || "Completa los campos obligatorios para guardar"} onClick={() => submitRef.current()}>{foot.boton}</SubmitButton>
      </>}>
      {props.open && (ready ? <Body {...props} onOpenChange={close} detalle={detalle} onDetalle={() => setDetalle(true)} onFoot={setFoot} submitRef={submitRef} /> : <FormSkeleton fields={8} />)}
    </ResponsiveDialog>
  )
}

function Body({ kind, onOpenChange, contactId, onSaved, providerId, tipo: tipoProp, detalle, onDetalle, onFoot, submitRef }: Props & {
  detalle: boolean; onDetalle: () => void; onFoot: (f: Foot) => void; submitRef: React.RefObject<() => void>
}) {
  const bookId = useBookId()
  const { user } = useApp()
  const qc = useQueryClient()
  const router = useRouter()
  const today = todayISO()
  const isC = kind === "cobrar"
  const { data: contacts = [] } = useContacts()
  const { data: entities = [] } = useEntities()
  const { data: cfg } = useSettings()
  const { data: providers = [] } = useProviders()
  const defs = (cfg?.defaults ?? {}) as { sistema?: string; frec?: string; plazo?: number }
  const usura = Number(cfg?.usura ?? 26)
  const preProv = providerId ? providers.find((p) => p.id === providerId) : undefined
  // Con un proveedor en Me deben: su contacto con el mismo nombre o "Alguien nuevo" con sus datos.
  const preCt = preProv && isC ? suggestLoanProvider(preProv.nombre, contacts, normProv) : undefined

  // Nada viene marcado salvo que llegue preseleccionado: empeño (?empeno=1), proveedor (fiado) o contacto (persona).
  const tipo0: LoanTipo | null = tipoProp ?? (preProv ? (isC ? "otro" : "fiado") : contactId ? (isC ? "presto" : "persona") : null)
  const d0 = tipo0 ? tipoDefaults(tipo0, kind, defs) : null

  const [tipo, setTipoS] = useState<LoanTipo | null>(tipo0)
  const [quien, setQuien] = useState<"ex" | "new" | "ent">(contactId || preCt ? "ex" : preProv ? "new" : contacts.length ? "ex" : "new")
  const [contact, setContact] = useState<string | null>(contactId ?? preCt?.id ?? null)
  const [entity, setEntity] = useState<string | null>(null)
  const [nc, setNc] = useState({ nombre: preProv && isC && !preCt ? preProv.nombre : "", docTipo: "CC", doc: "", telefono: preProv?.telefono ?? "", email: preProv?.correo ?? "", relacion: "" })
  const [prov, setProv] = useState<string | null>(providerId ?? null)
  const [addr, setAddr] = useState<Address>(emptyAddress)
  const [monto, setMonto] = useState(0)
  const [inicial, setInicial] = useState(0)
  const [concepto, setConcepto] = useState("")
  const [credito, setCredito] = useState("")
  const [inicio, setInicio] = useState(today)
  const [primera, setPrimera] = useState(plusMonths(today, 1))
  // Desde cuándo se empieza a pagar (null = un periodo después del préstamo, lo de siempre).
  const [desde, setDesde] = useState<string | null>(null)
  const [pago, setPago] = useState<PagoModo>(d0?.pago ?? "cuotas")
  const [frec, setFrec] = useState(d0?.frec ?? "mensual")
  const [vence, setVence] = useState(plusDays(today, 30))
  const [plazo, setPlazo] = useState(String(d0?.plazo ?? 12))
  const [extra, setExtra] = useState(0)
  const [modoInt, setModoInt] = useState<InteresModo>(d0?.interes ?? "no")
  const [tasa, setTasa] = useState(d0?.tasa ?? "")
  const [ea, setEa] = useState("")
  const [cuotaV, setCuotaV] = useState(0)
  const [sistema, setSistema] = useState<Sistema>(d0?.sistema ?? "frances")
  const [prenda, setPrenda] = useState("no")
  const [pr, setPr] = useState({ obj: "", valor: 0, ref: "" })
  const [limite, setLimite] = useState<string | null>(null)
  const [hist, setHist] = useState<HistMode>("nuevo")
  const [ncuotas, setNcuotas] = useState("")
  const [saldoHoy, setSaldoHoy] = useState(0)
  const [fult, setFult] = useState(today)
  const [nota, setNota] = useState("")
  const [pdf, setPdf] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Ventana de nueva entidad abierta con lo escrito (null = cerrada). */
  const [newEnt, setNewEnt] = useState<string | null>(null)
  const [ocr, setOcr] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null })
  const fotoRef = useRef<HTMLInputElement>(null)
  const sbSave = useSave("entities")

  /** Al escoger el tipo se ponen sus valores por defecto (lo ya escrito —quién, valor, fechas— se conserva). */
  const setTipo = (t: LoanTipo) => {
    const d = tipoDefaults(t, kind, defs)
    setTipoS(t); setPago(d.pago); setModoInt(d.interes); setFrec(d.frec); setSistema(d.sistema)
    setPlazo(String(t === "banco" ? TIPOS_CREDITO.find((x) => x.value === credito)?.plazo ?? d.plazo : d.plazo))
    // La tasa sugerida (empeño) solo reemplaza una vacía o la de otro tipo.
    if (!tasa || tasa === String(tipoDefaults(tipo ?? t, kind, defs).tasa)) setTasa(d.tasa)
    if (d.pago !== "cuotas") setVence(plusDays(inicio, d.pago === "libre" ? 90 : 30))
    if (camposLoan(t, kind).quien === "ct" && quien === "ent") setQuien(contacts.length ? "ex" : "new")
  }

  /** Lee extracto, pagaré o factura con IA y llena el formulario (ocrLoan de la v4). */
  const onFoto = async (f?: File) => {
    if (!f) return
    setOcr({ busy: true, msg: "Leyendo el documento…" })
    const fd = new FormData(); fd.append("file", f)
    const r = await readLoanDoc(fd, kind).catch((e) => ({ ok: false as const, msg: (e as Error).message }))
    if (!r.ok) return setOcr({ busy: false, msg: r.msg })
    const d = r.d, got: string[] = []
    if (tipo === "cuotas" && d.acreedor) {
      const p = providers.find((x) => normProv(x.nombre) === normProv(d.acreedor!))
      if (p) { setProv(p.id); got.push(p.nombre) } else got.push(`el almacén “${d.acreedor}” (escógelo o agrégalo arriba)`)
    } else if (!isC && d.acreedor && !d.acreedor_es_persona) {
      const nit = (d.acreedor_nit ?? "").replace(/\D/g, "")
      let e = findEntity(entities, { nombre: d.acreedor, nit }) ?? entities.find((x) => x.nombre.length > 4 && norm(d.acreedor!).includes(norm(x.nombre)))
      if (!e) { const row = await sbSave.mutateAsync({ nombre: d.acreedor.slice(0, 60), nit, tipo: "Banco" } as never); e = row as never; got.push(`creamos la entidad “${d.acreedor}”`) }
      setQuien("ent"); setEntity(e!.id); got.push(e!.nombre)
    } else {
      const who = isC ? d.deudor : d.acreedor
      const c = who ? findContact(contacts, { nombre: who, doc: isC ? d.deudor_documento : null }) : null
      if (c) { setQuien("ex"); setContact(c.id); got.push(c.nombre) }
      else if (who) { setQuien("new"); setNc((x) => ({ ...x, nombre: who, doc: (isC ? d.deudor_documento : d.acreedor_nit) ?? "" })); got.push(who) }
    }
    if (d.monto) { setMonto(Math.round(d.monto)); got.push(`valor ${fmtMoney(d.monto)}`) }
    if (d.concepto) setConcepto(d.concepto.slice(0, 80))
    if (d.fecha_inicio && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha_inicio)) setInicio(d.fecha_inicio)
    if (d.frecuencia && FRECS[d.frecuencia] && d.frecuencia !== "unico") setFrec(d.frecuencia)
    if (d.plazo_cuotas) { setPlazo(String(Math.round(d.plazo_cuotas))); got.push(`${d.plazo_cuotas} cuotas`) }
    if (d.seguros_por_cuota && !isC) setExtra(Math.round(d.seguros_por_cuota))
    if (d.tasa_mensual || d.tasa_ea) { setModoInt("tasa"); if (d.tasa_mensual) { setTasa(String(d.tasa_mensual).replace(".", ",")); setEa("") } else setEa(String(d.tasa_ea).replace(".", ",")); got.push("tasa") }
    else if (d.valor_cuota) { setModoInt("cuota"); setCuotaV(Math.round(d.valor_cuota)); got.push("cuota") }
    if (d.saldo_actual && d.monto && d.saldo_actual < d.monto) { setHist("saldo"); setSaldoHoy(Math.round(d.saldo_actual)); if (d.fecha_ultimo_pago && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha_ultimo_pago)) setFult(d.fecha_ultimo_pago) }
    else if (d.cuotas_pagadas) { setHist("cuotas"); setNcuotas(String(Math.round(d.cuotas_pagadas))) }
    setOcr({ busy: false, msg: got.length ? `Leímos: ${got.join(", ")}. Revisa los datos antes de guardar.${d.tipo_documento === "recibo_pago" ? " Parece un comprobante de pago: después de guardar, regístralo en “Registrar pago”." : ""}` : "No encontramos datos del crédito en el documento. Escríbelos a mano." })
  }

  // Lo que aplica al tipo escogido (campos, forma de pago y modo de interés efectivos).
  const C: Campos | null = tipo ? camposLoan(tipo, kind, { pago, interes: modoInt }) : null
  const pagoEf: PagoModo = C ? (C.pagos.includes(pago) ? pago : C.pagos[0]) : "cuotas"
  const intEf: InteresModo = C ? (C.intereses.includes(modoInt) ? modoInt : C.intereses[0]) : "no"
  const unico = pagoEf !== "cuotas"
  const frecEf = unico ? "unico" : C?.frecs.length ? (C.frecs.includes(frec) ? frec : C.frecs[0]) : "mensual"
  const T = textosLoan(tipo, kind, { frec: frecEf, pago: pagoEf })
  const def = tipoDef(tipo)
  const inicioEf = tipo === "cuotas" ? menosPeriodo(primera, frecEf) : inicio
  // La fecha del préstamo y la de la primera cuota pueden ser muy distintas ("me prestó en marzo y empiezo a pagar en junio").
  const desdeAuto = isoLocal(addPeriod(inicioEf, frecEf, 1))
  const conDesde = !!tipo && !unico && ORDEN[tipo].includes("desde")
  const primeraEf = conDesde && desde && desde !== desdeAuto ? desde : null
  const financiado = Math.max(0, monto - (C?.inicial ? inicial : 0))
  const sis: Sistema = tipo && C ? sistemaDe(tipo, intEf, sistema, C) : "sin"

  /** loanParams de la v4 */
  const params = (() => {
    const n = unico ? 1 : Math.max(1, Math.round(+plazo || 1))
    let t = 0
    if (intEf === "tasa") { const e = num(ea); t = e && C?.ea ? (sis === "simple" ? e / 12 : (Math.pow(1 + e / 100, 1 / 12) - 1) * 100) : num(tasa) }
    else if (intEf === "cuota") t = rateFromCuota(financiado, cuotaV, n, frecEf)
    return { monto: financiado, plazo: n, frec: frecEf, tasa: +t.toFixed(4), sistema: sis, inicio: inicioEf, extra: C?.extra ? extra : 0, vence: unico ? vence : null, primera: primeraEf }
  })()

  const prev = tipo && financiado > 0 ? previewLoan(params, today) : null
  const limiteEf = limite ?? plusMonths(inicioEf, params.plazo)
  const conHist = !!C?.hist && hist !== "nuevo"
  const histPays = !financiado || !conHist ? []
    : histPlan({ ...params, payments: [] }, { mode: hist, ncuotas: +ncuotas || 0, saldoHoy: hist === "saldo" ? saldoHoy || null : null, fultPago: fult }, today)
  const histE = financiado && conHist ? loanEngine({ ...params, payments: histPays.map((p) => ({ ...p, valor: p.valor ?? 0 })) }, today) : null

  // Quién: siempre un registro que se escoge (contacto guardado o nuevo, entidad, casa de empeño o proveedor).
  const usaPersona = !!C && (C.quien === "ct" || (C.quien === "libre" && quien !== "ent"))
  const usaEntidad = !!C && (C.quien === "ent" || C.quien === "casa" || (C.quien === "libre" && quien === "ent" && !isC))
  // "Alguien nuevo" que ya está en Contactos (mismo nombre o documento): se sugiere escogerlo y, si no, se usa al guardar.
  const ctYa = usaPersona && quien === "new" && nc.nombre.trim() ? findContact(contacts, { nombre: nc.nombre, doc: nc.doc }) : undefined
  const quienNombre = !C ? "" : C.quien === "prov" ? providers.find((p) => p.id === prov)?.nombre ?? ""
    : usaEntidad ? entities.find((x) => x.id === entity)?.nombre ?? ""
    : quien === "new" ? nc.nombre.trim() : contacts.find((c) => c.id === contact)?.nombre ?? ""
  // Si el contacto o la entidad se llama igual que un proveedor, se sugiere enlazarlo (sin hacerlo solo).
  const sugerido = !prov && C?.quien !== "prov" ? suggestLoanProvider(quienNombre, providers, normProv) : undefined
  const faltan0 = faltantesLoan({
    tipo, kind, quien: C?.quien === "libre" && isC && quien === "ent" ? "ex" : quien, entity, contact, nombreNuevo: nc.nombre, prov,
    monto, inicial, pago: pagoEf, interes: intEf, tasa: num(tasa), ea: C?.ea ? num(ea) : 0, cuota: cuotaV, plazo: +plazo, inicio: inicioEf, vence, obj: pr.obj,
  })
  const faltan = primeraEf && primeraEf < inicioEf ? [...faltan0, { campo: "desde", msg: "La primera cuota debe ser después de la fecha del préstamo" }] : faltan0
  const conPrenda = C?.prenda === "si" || (C?.prenda === "opcional" && prenda === "si")
  const verPdf = !!C?.pdf && usaPersona

  const submit = async () => {
    if (!tipo || !C) return
    if (faltan.length) return toast.error(faltan[0].msg)
    setBusy(true)
    const sb = createClient()
    let cid: string | null = null
    let ctRow: Row<"contacts"> | null = null
    if (usaPersona) {
      if (quien === "new" && ctYa) {
        // Ya existía: se usa ese contacto y se completan los datos que le faltaban (sin borrar los que tenía).
        cid = ctYa.id; ctRow = ctYa
        const doc = nc.doc.replace(/\D/g, "")
        const patch = { ...(!ctYa.telefono && nc.telefono.trim() ? { telefono: nc.telefono.trim() } : {}), ...(!ctYa.email && nc.email.trim() ? { email: nc.email.trim() } : {}), ...(!ctYa.doc && doc ? { doc, doc_tipo: nc.docTipo } : {}) }
        if (Object.keys(patch).length) await sb.from("contacts").update(patch).eq("id", ctYa.id)
        toast(`Ya tenías a “${ctYa.nombre}” en Contactos: lo usamos`, { description: "No creamos otro contacto igual." })
      } else if (quien === "new") {
        const { data, error } = await sb.from("contacts").insert({ book_id: bookId, tipo: "persona", nombre: nc.nombre.trim(), doc_tipo: nc.docTipo, doc: nc.doc.replace(/\D/g, ""), telefono: nc.telefono, email: nc.email, relacion: nc.relacion, direccion: addr, ciudad: addr.ciudad }).select("*").single()
        if (error) { setBusy(false); return toast.error("No se pudo crear el contacto", { description: error.message }) }
        cid = data.id; ctRow = data as Row<"contacts">
      } else { cid = contact; ctRow = contacts.find((c) => c.id === contact) as Row<"contacts"> | undefined ?? null }
    }
    const prendaObj = conPrenda ? { obj: pr.obj.trim() || "Objeto en garantía", valor: pr.valor, limite: limiteEf, ref: pr.ref.trim() } : null
    const cred = TIPOS_CREDITO.find((x) => x.value === credito)
    const conceptoF = concepto.trim() || (tipo === "empeno" ? prendaObj?.obj : tipo === "banco" ? cred?.concepto : tipo === "fiado" ? "Fiado" : tipo === "cuotas" ? "Compra a cuotas" : tipo === "vendi" ? "Venta fiada" : tipo === "gota" ? "Gota a gota" : "") || ""
    const notaF = [nota.trim(), C.inicial && inicial > 0 ? `Valor de la compra ${fmtMoney(monto)} con cuota inicial de ${fmtMoney(inicial)}.` : ""].filter(Boolean).join(" ")
    const { data: L, error } = await sb.from("loans").insert({
      book_id: bookId, kind, tipo, concepto: conceptoF, monto: financiado, sistema: params.sistema, tasa: params.tasa, frec: params.frec, plazo: params.plazo, inicio: inicioEf,
      extra: params.extra, contact_id: cid, entity_id: usaEntidad ? entity : null, prenda: prendaObj, cuota_fija: intEf === "cuota" ? cuotaV : null,
      tasa_ea: intEf === "tasa" && C.ea ? num(ea) || null : null, provider_id: prov, vence: unico ? vence : null, fiado: tipo === "fiado", ...(primeraEf ? { primera: primeraEf } : {}),
      ...(notaF ? { nota: notaF } : {}),
    }).select("id").single()
    if (error) { setBusy(false); return toast.error("No se pudo guardar", { description: error.message }) }
    if (histPays.length) await sb.from("loan_payments").insert(histPays.map((p) => ({ book_id: bookId, loan_id: L.id, fecha: p.fecha, tipo: p.tipo, valor: p.valor ?? 0, modo: p.modo ?? null, nota: "Pago anterior a Mirai" })))
    if (pdf && verPdf) {
      const e = loanEngine({ ...params, payments: histPays.map((p) => ({ ...p, valor: p.valor ?? 0 })) }, today)
      await descargarAcuerdo({ kind, hoy: today, user, contact: ctRow, nombre: quienNombre || "Otra persona", monto: financiado, concepto: conceptoF, inicio: inicioEf, plazo: params.plazo, frec: params.frec, sistema: params.sistema, tasa: params.tasa, e })
        .catch(() => toast.error("No se pudo generar el acuerdo en PDF", { description: "Descárgalo desde el detalle con “Acuerdo de pago (PDF)”." }))
    }
    setBusy(false)
    const hx = !conHist ? "" : histPays.length
      ? ` Registramos ${histPays.filter((p) => p.tipo === "cuota").length} cuota(s) ya pagada(s)${histPays.some((p) => p.tipo === "abono") ? " y un abono para cuadrar el saldo" : ""}. Saldo actual: ${fmtMoney(histE?.saldo ?? 0)}.`
      : " No había cuotas para marcar como pagadas."
    toast.success(T.toast, { description: hx || undefined })
    invalidateBook(qc, bookId, "loans"); invalidateBook(qc, bookId, "contacts"); invalidateBook(qc, bookId, "loan_payments")
    onSaved?.(L.id)
    onOpenChange(false)
    router.push(`/${isC ? "me-deben" : "le-debo"}?id=${L.id}`)
  }

  // El pie de la ventana (fuera de este componente) muestra el botón del tipo y por qué está inactivo.
  const foot: Foot = { titulo: T.titulo, boton: T.boton, valido: !faltan.length && !busy, busy, hint: faltan[0]?.msg ?? "" }
  useEffect(() => { onFoot(foot) }, [foot.titulo, foot.boton, foot.valido, foot.busy, foot.hint]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { submitRef.current = () => { void submit() } })

  const diaria = frecEf === "diario" || frecEf === "diariohab"
  const quick = tipo === "empeno" ? [1, 2, 3, 4, 6] : diaria ? [20, 30, 45, 60, 90, 120] : tipo === "banco" ? (credito === "vivienda" ? [120, 180, 240, 360] : [12, 24, 36, 48, 60, 72]) : [1, 3, 6, 12, 24, 36, 48]
  const PAGO_ITEMS: Record<PagoModo, { label: string; desc: string; icon: string }> = {
    unico: { label: "En una sola fecha", desc: isC ? "Te paga todo de una vez el día que acordaron." : "Pagas todo de una vez el día que acordaron.", icon: "calendar-check" },
    cuotas: { label: "En cuotas", desc: "Un valor fijo cada mes, quincena, semana o día.", icon: "calendar-range" },
    libre: { label: isC ? "Abonos cuando pueda" : "Abonos cuando pueda(s)", desc: "Sin cuotas fijas: registras cada abono cuando se haga.", icon: "piggy-bank" },
  }

  /** Escribió un nombre en "Escoge el contacto": si ya existe lo escoge; si no, pasa a "Alguien nuevo" con ese nombre. */
  const crearContacto = (t: string) => {
    const ya = t ? findContact(contacts, { nombre: t }) : undefined
    if (ya) { setContact(ya.id); return toast(`Ya tenías a “${ya.nombre}”: lo escogimos`) }
    setQuien("new"); setNc((x) => ({ ...x, nombre: t }))
  }
  /** Crear entidad o casa de empeño desde el selector: si ya existe una igual, la escoge en vez de abrir la ventana. */
  const crearEntidad = (t: string) => {
    const ya = t ? findEntity(entities, { nombre: t, nit: /^\d{6,}$/.test(t) ? t : null }) : undefined
    if (ya) { if (C?.quien === "libre") setQuien("ent"); setEntity(ya.id); return toast(`Ya tenías “${ya.nombre}”: la usamos`, { description: "No creamos otra igual." }) }
    setNewEnt(t || " ")
  }
  const corto = !!C?.ctCorto
  const personaFields = (
    <>
      {quien === "ex" && (
        <FormField label="Contacto" htmlFor="l-ct" required>
          <Combobox id="l-ct" value={contact} onChange={setContact} options={contactOptions(contacts)} emptyText="No está en tus contactos." createLabel="Agregar a" onCreate={crearContacto} />
        </FormField>
      )}
      {quien === "new" && (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={corto ? "Nombre o apodo" : "Nombre completo"} htmlFor="l-cn" required tip={false}
            hint={ctYa ? <>Ya tienes a <b>“{ctYa.nombre}”</b> en Contactos. <button type="button" className="font-semibold text-link hover:underline" onClick={() => { setQuien("ex"); setContact(ctYa.id) }}>Escogerlo</button> (si guardas así, también lo usamos).</> : undefined}>
            <Input id="l-cn" className="h-11" value={nc.nombre} placeholder={corto ? "Ej. Don Jaime" : "Ej. Andrés Navarro"} onChange={(e) => setNc({ ...nc, nombre: e.target.value })} />
          </FormField>
          <FormField label="Celular" htmlFor="l-ctel"><Input id="l-ctel" className="h-11" type="tel" value={nc.telefono} onChange={(e) => setNc({ ...nc, telefono: e.target.value })} /></FormField>
          {!corto && <>
          <FormField label="Tipo de documento" htmlFor="l-cdt"><Combobox id="l-cdt" value={nc.docTipo} onChange={(v) => setNc({ ...nc, docTipo: v })} options={DOC_TIPOS} /></FormField>
          <FormField label="Número de documento" htmlFor="l-cdoc"><Input id="l-cdoc" className="h-11" inputMode="numeric" value={nc.doc} onChange={(e) => setNc({ ...nc, doc: e.target.value })} /></FormField>
          <FormField label="Correo" htmlFor="l-cmail"><Input id="l-cmail" className="h-11" type="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} /></FormField>
          <FormField label="Relación" htmlFor="l-crel"><Combobox id="l-crel" value={nc.relacion} onChange={(v) => setNc({ ...nc, relacion: v })} options={(cfg?.relaciones ?? []).map((r) => ({ value: r, label: r }))} /></FormField>
          <div className="sm:col-span-2"><AddressFields value={addr} onChange={setAddr} idPrefix="lc" /></div>
          </>}
        </div>
      )}
    </>
  )
  const entidadField = (label: string) => (
    <FormField label={label} htmlFor="l-ent" required hint={T.quienHint || undefined}>
      <Combobox id="l-ent" value={entity} onChange={setEntity} options={entityOptions(entities)} createLabel="Crear banco o entidad" onCreate={crearEntidad} onCreateAI={(t) => setNewEnt(t || " ")} />
    </FormField>
  )

  const bloque = (b: Bloque): React.ReactNode => {
    if (!tipo || !C) return null
    switch (b) {
      case "riesgo": return def?.riesgo ? <Notice tone="bad" title="Ten mucho cuidado con este préstamo">{def.riesgo}</Notice> : null
      case "foto": return C.foto && (
        <div className="grid gap-2 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">{tipo === "cuotas" ? "¿Tienes la factura o el plan de pagos?" : "¿Tienes el extracto, pagaré o factura del crédito?"}</p>
          <p className="text-xs text-muted-foreground">Tómale una foto o súbela y la IA llena los datos: {isC ? "a quién" : tipo === "cuotas" ? "el almacén" : "la entidad"}, valor, cuotas, tasa y lo que ya se ha pagado.</p>
          <Button type="button" variant="soft" size="sm" className="w-fit" disabled={ocr.busy} onClick={() => fotoRef.current?.click()}>{ocr.busy ? <Spinner /> : <Camera />} Leer con foto</Button>
          <input ref={fotoRef} type="file" hidden accept="image/*,application/pdf" capture="environment" onChange={(e) => { onFoto(e.target.files?.[0]); e.target.value = "" }} />
          {ocr.msg && <p className="text-sm">{ocr.msg}</p>}
        </div>
      )
      case "quien":
        if (C.quien === "ent") return entidadField(T.quien)
        if (C.quien === "casa") return (
          <FormField label={T.quien} htmlFor="l-ent" required hint={T.quienHint}>
            {/* Las casas de empeño primero; también se puede escoger otra entidad (un banco que presta sobre joyas). */}
            <Combobox id="l-ent" value={entity} onChange={setEntity} placeholder="Escoge o crea la casa de empeño" searchPlaceholder="Buscar o escribir el nombre…"
              options={entityOptions([...entities].sort((a, b) => Number(b.tipo === CASA_EMPENO) - Number(a.tipo === CASA_EMPENO)))}
              emptyText="No está en tu lista. Créala abajo." createLabel="Crear casa de empeño" onCreate={crearEntidad} />
          </FormField>
        )
        if (C.quien === "prov") return (
          <FormField label={T.quien} htmlFor="l-prov" required tip={false} hint={T.quienHint}>
            <ProviderSelect id="l-prov" value={prov} placeholder={tipo === "cuotas" ? "Escoge o agrega el almacén" : "Escoge o agrega la tienda"} onChange={(id) => setProv(id)} />
          </FormField>
        )
        return (
          <div className="grid gap-4">
            <FormField label={T.quien} tip={false} hint={T.quienHint || undefined}>
              <Segmented value={quien} onChange={(v) => setQuien(v as typeof quien)} items={[
                ...(C.quien === "libre" && !isC ? [{ value: "ent", label: "Banco o entidad", icon: "landmark" }] : []),
                { value: "ex", label: "Un contacto guardado", icon: "user-round" }, { value: "new", label: "Alguien nuevo", icon: "user-plus" },
              ]} />
            </FormField>
            {usaEntidad ? entidadField("Banco o entidad") : personaFields}
          </div>
        )
      case "credito": return (
        <FormField label="Tipo de crédito" tip="Nos ayuda a sugerir el plazo y el nombre del crédito. Si no sabes, déjalo así.">
          <Segmented value={credito} onChange={(v) => {
            const c = TIPOS_CREDITO.find((x) => x.value === v)
            const prevC = TIPOS_CREDITO.find((x) => x.value === credito)
            setCredito(v)
            if (c) { setPlazo(String(c.plazo)); if (!concepto.trim() || concepto === prevC?.concepto) setConcepto(c.concepto) }
          }} items={TIPOS_CREDITO.map((c) => ({ value: c.value, label: c.label, icon: c.icon }))} />
        </FormField>
      )
      case "obj": return (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="¿Qué objeto dejaste?" htmlFor="l-pro" required><Input id="l-pro" className="h-11" value={pr.obj} onChange={(e) => setPr({ ...pr, obj: e.target.value })} placeholder="Ej. Cadena de oro, celular, televisor" /></FormField>
          <FormField label="¿En cuánto lo avaluaron?" htmlFor="l-prv" tip="El valor que la casa de empeño le puso al objeto. Suele ser más de lo que te prestan."><MoneyInput id="l-prv" value={pr.valor} onChange={(v) => setPr({ ...pr, valor: v })} /></FormField>
        </div>
      )
      case "monto": return (
        <FormField label={T.monto} htmlFor="l-monto" required tip={false} hint={T.montoHint}>
          <MoneyInput id="l-monto" value={monto} onChange={setMonto} />
        </FormField>
      )
      case "inicial": return (
        <FormField label="Cuota inicial (opcional)" htmlFor="l-inicial" tip="Lo que pagaste el día de la compra. Se financia el resto."
          hint={inicial > 0 && monto > 0 ? (inicial < monto ? `Financias ${fmtMoney(monto - inicial)}.` : "Debe ser menor que el valor de la compra.") : undefined}>
          <MoneyInput id="l-inicial" value={inicial} onChange={setInicial} />
        </FormField>
      )
      case "concepto": return C.concepto && (
        <FormField label={T.concepto} htmlFor="l-conc" tip={false}><Input id="l-conc" className="h-11" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder={T.conceptoPh} /></FormField>
      )
      case "inicio": return (
        <FormField label={T.inicio} htmlFor="l-ini" tip={false} hint={!unico && !conDesde && prev?.plan[0] ? `La primera cuota sería el ${fmtDate(prev.plan[0].fecha, { long: true })}.` : undefined}>
          <DatePicker id="l-ini" value={inicio} onChange={(v) => setInicio(v ?? today)} />
        </FormField>
      )
      case "primera": return (
        <FormField label="Fecha de la primera cuota" htmlFor="l-primera" tip={false} hint="Míralo en la factura o en el plan de pagos del almacén.">
          <DatePicker id="l-primera" value={primera} quick="futuro" onChange={(v) => setPrimera(v ?? plusMonths(today, 1))} />
        </FormField>
      )
      case "pago": return C.pagos.length > 1 && (
        <FormField label={T.pago} tip={false}>
          <ChoiceCards name="pago" value={pagoEf} cols={3} onChange={(v) => {
            setPago(v as PagoModo)
            if (v !== "cuotas" && !(vence > inicio)) setVence(plusDays(inicio, v === "libre" ? 90 : 30))
          }} items={C.pagos.map((p) => ({ value: p, ...PAGO_ITEMS[p] }))} />
        </FormField>
      )
      case "desde": return conDesde && (
        <FormField label={isC ? "¿Desde cuándo te empieza a pagar?" : "¿Desde cuándo empiezas a pagar?"} htmlFor="l-desde" tip={false}
          error={primeraEf && primeraEf < inicioEf ? "Debe ser después de la fecha del préstamo." : undefined}
          hint={prev?.plan.length ? (prev.plan.length === 1 ? `Un solo pago el ${fmtDate(prev.plan[0].fecha, { long: true })}.`
            : `${prev.plan.length} cuotas, una cada ${FRECS[frecEf]?.per ?? "periodo"}: la primera el ${fmtDate(prev.plan[0].fecha, { long: true })} y la última el ${fmtDate(prev.plan.at(-1)!.fecha, { long: true })}.`)
            : "La fecha de la primera cuota. Puede ser muy distinta de la fecha del préstamo."}>
          <DatePicker id="l-desde" value={primeraEf ?? desdeAuto} quick="futuro" onChange={(v) => setDesde(v)} />
        </FormField>
      )
      case "cuotas": return !unico && (
        <div className="grid gap-5 sm:grid-cols-2">
          {C.frecs.length > 1 && (
            <FormField label={isC ? "¿Cada cuánto te paga?" : "¿Cada cuánto pagas?"} htmlFor="l-frec" className="sm:col-span-2" tip={false}>
              <Segmented value={frecEf} onChange={(v) => { setFrec(v); if ((v === "diario" || v === "diariohab") && +plazo < 20) setPlazo("30") }}
                items={C.frecs.map((f) => ({ value: f, label: FRECS[f].n }))} />
            </FormField>
          )}
          <FormField label={T.plazo} htmlFor="l-plazo" className="sm:col-span-2" tip={false}
            hint={tipo === "empeno" ? "Los meses que tienes para recuperar el objeto." : +plazo >= 1 ? `${Math.round(+plazo)} ${FRECS[frecEf]?.pl ?? "cuotas"}.` : undefined}>
            <div className="flex flex-wrap items-center gap-2">
              <Input id="l-plazo" className="h-11 w-24" type="number" min={1} value={plazo} onChange={(e) => setPlazo(e.target.value)} />
              <Segmented value={plazo} onChange={setPlazo} items={quick.map((x) => ({ value: String(x), label: String(x) }))} />
            </div>
          </FormField>
        </div>
      )
      case "vence": return unico && (
        <FormField label={T.vence} htmlFor="l-vence" required tip={T.venceHint}
          hint={vence > inicioEf ? (pagoEf === "libre" ? `Más o menos para el ${fmtDate(vence, { long: true })}.` : `Un solo pago el ${fmtDate(vence, { long: true })}.`) : "Debe ser después de la fecha de inicio."}>
          <DatePicker id="l-vence" value={vence} quick="futuro" onChange={(v) => setVence(v ?? plusDays(today, 30))} />
        </FormField>
      )
      case "interes": return (
        <div className="grid gap-4">
          {C.intereses.length > 1 && (
            <FormField label={T.interes} tip={false}>
              <ChoiceCards name="interes" value={intEf} onChange={(v) => setModoInt(v as InteresModo)} cols={C.intereses.length === 3 ? 3 : 2}
                items={C.intereses.map((m) => ({ value: m, label: T.interesItems[m]?.label ?? m, desc: T.interesItems[m]?.desc, icon: m === "no" ? "hand-coins" : m === "tasa" ? "percent" : "receipt" }))} />
            </FormField>
          )}
          {intEf === "tasa" && (tipo === "banco" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Tasa efectiva anual (E.A.) %" htmlFor="l-ea" tip="La que aparece en el extracto o en el contrato del banco. La convertimos a mensual."><Input id="l-ea" className="h-11" inputMode="decimal" value={ea} placeholder="Ej. 24,5" onChange={(e) => { setEa(e.target.value); setTasa("") }} /></FormField>
              <FormField label="¿O te dieron la tasa mensual?" htmlFor="l-tasa" tip={false} hint="Si dice “mes vencido” (M.V.), escríbela aquí."><Input id="l-tasa" className="h-11" inputMode="decimal" value={tasa} onChange={(e) => { setTasa(e.target.value); setEa("") }} /></FormField>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Interés mensual (%)" htmlFor="l-tasa" tip={false}
                hint={tipo === "empeno" ? `Escribe el que dice tu boleta. Muchas casas de empeño cobran alrededor del ${TASA_EMPENO} % al mes.` : tipo === "fiado" || tipo === "vendi" ? "El recargo de cada mes. Si te dijeron “al 2 %”, escribe 2." : "Si te dijeron “al 2 %”, escribe 2."}>
                <Input id="l-tasa" className="h-11" inputMode="decimal" value={tasa} onChange={(e) => { setTasa(e.target.value); setEa("") }} />
              </FormField>
              {C.ea && <FormField label="¿O te dieron una tasa anual (E.A.)?" htmlFor="l-ea" tip="Efectivo anual: la que aparece en los extractos de los bancos. La convertimos a mensual."><Input id="l-ea" className="h-11" inputMode="decimal" value={ea} onChange={(e) => { setEa(e.target.value); setTasa("") }} /></FormField>}
            </div>
          ))}
          {intEf === "cuota" && <FormField label={T.cuota} htmlFor="l-cuota" required tip={false} hint={tipo === "gota" ? "Lo que te cobran en cada pago. Con eso calculamos cuánto interés te están cobrando." : "Con la cuota calculamos la tasa de interés."}><MoneyInput id="l-cuota" value={cuotaV} onChange={setCuotaV} /></FormField>}
          {C.sistema && (
            <FormField label="¿Cómo se calcula la cuota?" tip={false}>
              <ChoiceCards name="sistema" value={sistema} onChange={(v) => setSistema(v as Sistema)} items={(["frances", "aleman", "simple", "americano"] as Sistema[]).map((s) => ({ value: s, label: SISTEMAS[s].n, desc: SISTEMAS[s].d, icon: SISTEMAS[s].icon, recommended: s === (tipo === "persona" || tipo === "presto" ? "simple" : "frances") }))} />
            </FormField>
          )}
          {tipo === "empeno" && (
            <p className="rounded-lg bg-secondary/60 p-3 text-sm">
              <b>Así funciona el empeño:</b> cada mes pagas solo los intereses{prev && params.tasa > 0 ? <> (<Money value={prev.cuota} />)</> : null} y al final devuelves lo que te prestaron{financiado > 0 ? <> (<Money value={financiado} />)</> : null} para recuperar tu objeto. Si pagas los intereses a tiempo, casi siempre puedes refrendar (extender el plazo).
            </p>
          )}
        </div>
      )
      case "extra": return C.extra && (
        <FormField label="Seguros y otros cobros por cuota" htmlFor="l-extra" tip="Los bancos y almacenes suelen sumar a la cuota un seguro de vida o de deudor. Míralo en tu extracto. Si no sabes, déjalo vacío."><MoneyInput id="l-extra" value={extra} onChange={setExtra} /></FormField>
      )
      case "empeno": return (
        <div className="grid gap-4">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Fecha límite para recuperarlo" htmlFor="l-prl" tip="Hasta cuándo tienes para pagar y recoger el objeto. Está en la boleta."><DatePicker id="l-prl" value={limiteEf} onChange={(v) => setLimite(v)} quick="futuro" /></FormField>
            <FormField label="Número de contrato o boleta" htmlFor="l-prr" tip={false}><Input id="l-prr" className="h-11" value={pr.ref} onChange={(e) => setPr({ ...pr, ref: e.target.value })} /></FormField>
          </div>
          <Notice tone="warn" title="Si no pagas a tiempo puedes perder el objeto">Antes del {fmtDate(limiteEf, { long: true })} paga lo que debes o al menos los intereses para refrendar. Te avisamos antes de la fecha.</Notice>
        </div>
      )
      case "prenda": return C.prenda === "opcional" && (
        <div className="grid gap-4">
          <FormField label={isC ? "¿Te dejaron algo en garantía?" : "¿Dejaste algo en garantía?"} tip={false}>
            <Segmented value={prenda} onChange={setPrenda} items={[{ value: "no", label: "No" }, { value: "si", label: "Sí", icon: "gem" }]} />
          </FormField>
          {prenda === "si" && (
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label={isC ? "¿Qué te dejaron?" : "¿Qué dejaste?"} htmlFor="l-pro"><Input id="l-pro" className="h-11" value={pr.obj} onChange={(e) => setPr({ ...pr, obj: e.target.value })} placeholder="Ej. Cadena de oro" /></FormField>
              <FormField label="¿Cuánto vale aproximadamente?" htmlFor="l-prv"><MoneyInput id="l-prv" value={pr.valor} onChange={(v) => setPr({ ...pr, valor: v })} /></FormField>
              <FormField label="Fecha límite para recuperarlo" htmlFor="l-prl"><DatePicker id="l-prl" value={limiteEf} onChange={(v) => setLimite(v)} quick="futuro" /></FormField>
              <FormField label="Número de contrato o boleta" htmlFor="l-prr"><Input id="l-prr" className="h-11" value={pr.ref} onChange={(e) => setPr({ ...pr, ref: e.target.value })} /></FormField>
            </div>
          )}
        </div>
      )
      case "nota": return C.nota && (
        <FormField label="Nota del acuerdo (opcional)" htmlFor="l-nota" tip={false} hint="Lo que acordaron de palabra. Ej. Me paga cuando le llegue la prima.">
          <Textarea id="l-nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
        </FormField>
      )
      case "pdf": return verPdf && (
        <div className="flex items-start gap-3 rounded-lg bg-secondary/60 p-3">
          <Checkbox id="l-pdf" checked={pdf} onCheckedChange={(v) => setPdf(v === true)} className="mt-0.5" />
          <div className="grid gap-0.5">
            <Label htmlFor="l-pdf" className="font-semibold">Descargar el acuerdo de pago en PDF al guardar</Label>
            <p className="text-xs text-muted-foreground">Un documento con el valor, las cuotas y un pagaré para firmar entre los dos. También lo descargas después desde el detalle.</p>
          </div>
        </div>
      )
      case "hist": return C.hist && (
        <div className="grid gap-4">
          <FormField label={T.hist} tip={false} hint="Si empezó antes de usar Mirai, no tienes que registrar cada pago uno por uno.">
            <ChoiceCards name="hist" value={hist} onChange={(v) => setHist(v as HistMode)} cols={2} items={[
              { value: "nuevo", label: "No, es nuevo" },
              { value: "aldia", label: "Va al día", desc: "Marcamos como pagadas todas las cuotas cuya fecha ya pasó." },
              { value: "cuotas", label: "Ya se pagaron algunas cuotas" },
              { value: "saldo", label: "Sé cuánto se debe hoy" },
            ]} />
          </FormField>
          {hist === "cuotas" && <FormField label="¿Cuántas cuotas ya se pagaron?" htmlFor="l-nc"><Input id="l-nc" className="h-11 w-32" type="number" min={0} value={ncuotas} onChange={(e) => setNcuotas(e.target.value)} /></FormField>}
          {hist === "saldo" && (
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label={isC ? "¿Cuánto te debe hoy?" : "¿Cuánto debes hoy?"} htmlFor="l-sh"><MoneyInput id="l-sh" value={saldoHoy} onChange={setSaldoHoy} /></FormField>
              <FormField label="Fecha del último pago" htmlFor="l-fu"><DatePicker id="l-fu" value={fult} onChange={(v) => setFult(v ?? today)} /></FormField>
            </div>
          )}
          {hist !== "nuevo" && (
            <div className="rounded-lg bg-muted p-3 text-sm" aria-live="polite">
              {!financiado ? "Primero escribe el valor y las cuotas."
                : hist === "saldo" && !saldoHoy ? "Escribe el saldo que aparece en el extracto o el que te dijeron."
                : hist === "saldo" && saldoHoy > financiado ? "El saldo de hoy es mayor que el valor prestado. Revisa los valores."
                : histE && (<>
                  <p className="font-semibold">Así quedará registrado: {isC ? "te debe" : "debes"} <Money value={histE.saldo} /></p>
                  <p className="text-muted-foreground">{histPays.filter((p) => p.tipo === "cuota").length} cuotas pagadas{histPays.some((p) => p.tipo === "abono") ? " + un abono para cuadrar el saldo" : ""} · total {isC ? "recibido" : "pagado"} <Money value={histE.pagado} />. {histE.done ? "¡Quedaría saldado!" : <>Faltan <b>{histE.plan.length}</b> cuotas{histE.vencidas.length ? <>, <b>{histE.vencidas.length} vencidas</b></> : null}.</>}</p>
                </>)}
            </div>
          )}
        </div>
      )
      case "provlink": return (prov || sugerido) && (
        <FormField label="Proveedor enlazado (opcional)" htmlFor="l-prov2" tip={isC ? "Si quien te debe es uno de tus proveedores (por ejemplo, un saldo a favor), enlázalo para verlo en Proveedores." : "Si la deuda es con uno de tus proveedores (un almacén, el colegio, la constructora), enlázala para ver en Proveedores cuánto le debes."}
          hint={sugerido ? <>¿Es tu proveedor “{sugerido.nombre}”? <button type="button" className="font-semibold text-link hover:underline" onClick={() => setProv(sugerido.id)}>Enlazarlo</button></> : undefined}>
          <ProviderSelect id="l-prov2" value={prov} placeholder="Sin proveedor" onChange={(id) => setProv(id)} />
        </FormField>
      )
    }
  }

  return (
    <>
      <div className={cn("grid lg:h-full lg:grid-cols-[minmax(0,1fr)_400px]", detalle && "hidden")}>
        <div className="pb-6 md:px-6 md:pt-5 lg:min-h-0 lg:overflow-y-auto">
          <FieldGroup>
            <FormField label={isC ? "¿Qué tipo de préstamo es?" : "¿Qué tipo de deuda es?"} tip={false} hint={def?.desc}>
              <ChoiceCards name="tipo" value={tipo ?? ""} onChange={(v) => setTipo(v as LoanTipo)} cols={3}
                items={tiposDe(kind).map((t) => ({ value: t.value, label: t.label, icon: t.icon }))} />
            </FormField>
            {tipo && ORDEN[tipo].map((b) => { const n = bloque(b); return n ? <div key={b} className="grid">{n}</div> : null })}
            {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Guardando…</p>}
          </FieldGroup>
        </div>
        {/* Resumen fijo: en escritorio no se desplaza con el formulario; en el celular va al final. */}
        <div className="border-t py-6 md:px-6 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l lg:bg-secondary/40 lg:py-6">
          <Resumen tipo={tipo} kind={kind} T={T} quienNombre={quienNombre} concepto={concepto.trim() || (tipo === "empeno" ? pr.obj.trim() : "")} prev={prev} params={params}
            monto={monto} inicial={C?.inicial ? inicial : 0} financiado={financiado} usura={usura} pago={pagoEf} obj={conPrenda ? pr.obj.trim() : ""} avaluo={pr.valor}
            limite={conPrenda ? limiteEf : null} histE={histE} histN={histPays.filter((p) => p.tipo === "cuota").length} onDetalle={onDetalle} />
        </div>
      </div>
      {detalle && (
        <div className="pb-6 md:px-6 md:pt-5 lg:h-full lg:overflow-y-auto">
          <DetalleLoan tipo={tipo} kind={kind} T={T} quienNombre={quienNombre} prev={prev} params={params} monto={monto} inicial={C?.inicial ? inicial : 0}
            financiado={financiado} usura={usura} pago={pagoEf} obj={conPrenda ? pr.obj.trim() : ""} avaluo={pr.valor} limite={conPrenda ? limiteEf : null} histE={histE} />
        </div>
      )}
      <EntityDialog open={newEnt !== null} onOpenChange={(o) => !o && setNewEnt(null)} initial={newEnt?.trim() ?? ""} initialTipo={tipo === "empeno" ? CASA_EMPENO : undefined}
        onCreated={(id) => { if (C?.quien === "libre") setQuien("ent"); setEntity(id) }} />
    </>
  )
}

type Prev = ReturnType<typeof previewLoan>
type Params = { monto: number; plazo: number; frec: string; tasa: number; sistema: string; inicio: string; extra: number; vence: string | null }
type ResumenProps = {
  tipo: LoanTipo | null; kind: LoanKind; T: TextosLoan; quienNombre: string; prev: Prev | null; params: Params; monto: number; inicial: number
  financiado: number; usura: number; pago: PagoModo; obj: string; avaluo: number; limite: string | null; histE: ReturnType<typeof loanEngine> | null
}

/** Texto de la cuota: "$100.000 cada mes", "De $120.000 a $80.000", "Un solo pago". */
function cuotaTxt(prev: Prev, params: Params, pago: PagoModo) {
  const per = FRECS[params.frec]?.per ?? "mes"
  if (pago === "unico") return <>Un pago de <Money value={prev.total} /></>
  if (pago === "libre") return "Abonos libres"
  if (params.sistema === "americano") return <><Money value={prev.cuota} /> por {per}</>
  if (Math.abs(prev.cuota - prev.cuotaFin) > 1) return <>De <Money value={prev.cuota} /> a <Money value={prev.cuotaFin} /></>
  return <><Money value={prev.cuota} /> cada {per}</>
}

/** Tasa frente a la usura: verde si está por debajo, rojo si la supera. */
function TasaUsura({ params, prev, usura, className }: { params: Params; prev: Prev; usura: number; className?: string }) {
  if (!(params.tasa > 0)) return <p className={cn("rounded-md bg-success-soft px-3 py-2 text-success", className)}>Sin intereses</p>
  const ea = prev.ea * 100
  const alta = ea > usura
  return (
    <div className={cn("grid gap-0.5 rounded-md px-3 py-2", alta ? "bg-danger-soft text-danger" : "bg-success-soft text-success", className)} data-testid="loan-usura">
      <span className="font-bold">{fmtPct(params.tasa, 2)} mensual ≈ {fmtPct(ea, 1)} E.A.</span>
      <span className="text-[11.5px] leading-4">{alta ? `Supera la tasa de usura (${fmtPct(usura, 2)} E.A.).` : `Por debajo de la usura (${fmtPct(usura, 2)} E.A.).`}</span>
    </div>
  )
}

/** Recibo fijo a la derecha: se arma en vivo con lo que escribes y "Más detalle" abre la tabla completa. */
function Resumen(p: ResumenProps & { histN: number; concepto: string; onDetalle: () => void }) {
  const { tipo, kind, T, quienNombre, prev, params, inicial, financiado, usura, pago, obj, avaluo, limite, histE, histN } = p
  const isC = kind === "cobrar"
  const def = tipoDef(tipo)
  return (
    <ReceiptCard icon={def?.icon ?? "receipt"} label={T.recibo} testId="loan-resumen"
      title={quienNombre || def?.corto || (isC ? "Tu préstamo" : "Tu deuda")}
      subtitle={[def?.label, p.concepto].filter(Boolean).join(" · ") || "Aquí verás cómo va quedando"}>
      {!tipo ? (
        <p className="py-3 text-center text-muted-foreground">{isC ? "Escoge el tipo de préstamo para empezar." : "Escoge el tipo de deuda para empezar."}</p>
      ) : !prev ? (
        <p className="py-3 text-center text-muted-foreground">Escribe el valor y aquí verás {isC ? "lo que te van a pagar" : "lo que vas a pagar"}.</p>
      ) : (
        <>
          <p className="text-[10.5px] font-bold tracking-[.25em] text-muted-foreground uppercase">{isC ? "El préstamo" : "La deuda"}</p>
          <div className="num grid gap-1">
            <ReceiptRow label="Tipo" value={def?.corto} />
            {quienNombre && <ReceiptRow label={T.quienRecibo} value={<span className="block truncate">{quienNombre}</span>} />}
            {inicial > 0 ? <>
              <ReceiptRow label="Valor de la compra" value={p.monto} />
              <ReceiptRow label="− Cuota inicial" value={inicial} className="text-muted-foreground" />
              <ReceiptRow label="Financiado" value={financiado} className="font-bold" />
            </> : <ReceiptRow label={tipo === "fiado" ? "Valor fiado" : tipo === "vendi" ? "Te quedó debiendo" : isC ? "Prestaste" : "Te prestaron"} value={financiado} className="font-bold" />}
            {obj && <ReceiptRow label="En garantía" value={<span className="block truncate">{obj}</span>} />}
            {obj && avaluo > 0 && <ReceiptRow label="Avalúo" value={avaluo} />}
          </div>
          <p className="text-[10.5px] font-bold tracking-[.25em] text-muted-foreground uppercase">Los pagos</p>
          <div className="num grid gap-1">
            <ReceiptRow label={pago === "cuotas" ? "Cuota" : "Forma"} value={cuotaTxt(prev, params, pago)} />
            {pago === "cuotas" && <ReceiptRow label="Cuotas" value={`${params.plazo}`} />}
            {pago === "cuotas" && prev.plan[0] && <ReceiptRow label="Primer pago" value={fmtDate(prev.plan[0].fecha)} />}
            <ReceiptRow label={pago === "cuotas" ? "Último pago" : pago === "libre" ? "Terminar hacia" : "Fecha del pago"} value={fmtDate(prev.fin)} />
            <ReceiptRow label="Intereses" value={prev.int} className={prev.int > 0.5 ? "text-warning" : undefined} />
            {params.extra > 0 && <ReceiptRow label="Seguros" value={params.extra * params.plazo} />}
          </div>
          <div className="num flex items-baseline justify-between gap-2 border-y-[3px] border-double border-foreground/40 py-2 text-[15px] font-bold">
            <span>{T.total}</span>
            <Money value={prev.total} className={isC ? "text-success" : "text-danger"} />
          </div>
          <TasaUsura params={params} prev={prev} usura={usura} />
          {limite && (
            <p className="rounded-md bg-warning-soft px-3 py-2 text-[12px] leading-4"><b>Fecha límite: {fmtDate(limite)}</b>. {isC ? "Hasta entonces guardas el objeto." : "Si no pagas a tiempo puedes perder el objeto."}</p>
          )}
          {histE && <p className="text-center text-[12px] text-muted-foreground">{histN} cuota(s) ya pagada(s) · {isC ? "te debe" : "debes"} hoy <Money value={histE.saldo} /></p>}
          <Barcode seed={`${tipo}${quienNombre}${financiado}`} />
          <Button type="button" variant="outline" className="font-receipt" onClick={p.onDetalle}>Más detalle <ArrowRight /></Button>
        </>
      )}
    </ReceiptCard>
  )
}

/** Tarjeta de la vista de detalle. */
function Card({ title, icon, children, className }: { title: string; icon: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("grid content-start gap-3 rounded-xl border bg-card p-4 shadow-card", className)}>
      <h3 className="flex items-center gap-2 font-semibold"><Icon name={icon} className="size-[18px] text-brand" />{title}</h3>
      {children}
    </section>
  )
}

/** La deuda explicada en palabras, según el sistema, la forma de pago y el tipo. */
function enPalabras({ tipo, kind, prev, params, financiado, usura, pago, obj, limite }: ResumenProps): string[] {
  const C = kind === "cobrar"
  const per = FRECS[params.frec]?.per ?? "mes", pl = FRECS[params.frec]?.pl ?? "cuotas"
  if (!prev) return []
  const out: string[] = []
  const paga = C ? "te paga" : "pagas"
  if (pago === "unico") out.push(`${C ? "Te pagan" : "Pagas"} todo de una vez el ${fmtDate(prev.fin, { long: true })}: ${fmtMoney(prev.total)}.`)
  else if (pago === "libre") out.push(`No hay cuotas fijas: ${C ? "registra cada abono que te hagan" : "registra cada abono que hagas"} en “Registrar pago”. La idea es terminar más o menos el ${fmtDate(prev.fin, { long: true })}.`)
  else if (params.sistema === "americano") out.push(`Durante ${Math.max(0, params.plazo - 1)} ${pl} ${paga} solo los intereses (${fmtMoney(prev.cuota)}) y en la última ${C ? "te devuelven" : "devuelves"} todo: ${fmtMoney(prev.cuotaFin)}.`)
  else if (params.sistema === "aleman") out.push(`La cuota empieza en ${fmtMoney(prev.cuota)} y va bajando hasta ${fmtMoney(prev.cuotaFin)}: cada ${per} se abona lo mismo a la deuda y el interés se calcula sobre lo que falta.`)
  else if (params.sistema === "simple" && params.tasa > 0) out.push(`Son ${params.plazo} cuotas de ${fmtMoney(prev.cuota)}. El interés se calcula siempre sobre lo prestado (${fmtMoney(financiado)}), así que cada cuota lleva el mismo interés.`)
  else if (params.tasa > 0) out.push(`Son ${params.plazo} cuotas iguales de ${fmtMoney(prev.cuota)} cada ${per}. Al principio la mayor parte es interés; al final, casi todo baja la deuda.`)
  else out.push(`Se divide ${fmtMoney(financiado)} en ${params.plazo} ${params.plazo === 1 ? "pago" : "partes iguales"} de ${fmtMoney(prev.cuota)}, sin intereses.`)
  if (prev.int > 0.5) out.push(`En total ${C ? "ganas" : "pagas"} ${fmtMoney(prev.int)} de intereses: ${Math.round((prev.int / financiado) * 100)} % más de lo ${C ? "que prestaste" : "que te prestaron"}.`)
  if (params.extra > 0) out.push(`Además ${C ? "se suman" : "pagas"} ${fmtMoney(params.extra)} de seguros u otros cobros en cada cuota.`)
  if (params.tasa > 0) {
    const ea = prev.ea * 100
    out.push(ea > usura
      ? `La tasa equivale a ${fmtPct(ea, 1)} efectivo anual y supera la tasa de usura (${fmtPct(usura, 2)} E.A.). ${C ? "Cobrar por encima de la usura es ilegal en Colombia." : "Cobrar por encima de la usura es ilegal en Colombia: si puedes, busca otra opción."}`
      : `La tasa equivale a ${fmtPct(ea, 1)} efectivo anual, por debajo de la tasa de usura (${fmtPct(usura, 2)} E.A.).`)
  }
  if (tipo === "empeno" && limite) out.push(`Si no pagas o refrendas antes del ${fmtDate(limite, { long: true })}, la casa de empeño puede quedarse con ${obj || "el objeto"}.`)
  if (tipo === "gota") out.push("Si te cobran con amenazas, denuncia en la línea 123 o en la Fiscalía. Pagar a tiempo un crédito formal también te ayuda a construir historial.")
  return out
}

/** Vista completa (se abre con "Más detalle" y vuelve con Atrás): tabla de cuotas, totales y explicación. */
function DetalleLoan(p: ResumenProps) {
  const { tipo, kind, quienNombre, prev, params, inicial, financiado, usura, obj, avaluo, limite, histE } = p
  const isC = kind === "cobrar"
  const def = tipoDef(tipo)
  if (!prev) return <p className="py-10 text-center text-muted-foreground">Escoge el tipo y escribe el valor para ver el detalle.</p>
  const tot = prev.plan.reduce((a, r) => ({ v: a.v + r.valor, i: a.i + r.int, c: a.c + r.cap, x: a.x + r.extra }), { v: 0, i: 0, c: 0, x: 0 })
  return (
    <div className="grid gap-4" data-testid="loan-detalle">
      <div className="relative isolate overflow-hidden rounded-xl border bg-receipt p-5">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-[420px] max-w-[60%]"><ReceiptArt /></div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-navy text-lime"><Icon name={def?.icon ?? "receipt"} className="size-6" /></span>
          <div className="grid flex-1 gap-0.5">
            <p className="text-lg font-bold">{quienNombre || def?.label}</p>
            <p className="text-sm text-muted-foreground">{[def?.label, FRECS[params.frec]?.n].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="grid text-right">
            <span className="text-xs text-muted-foreground">{isC ? "Recibirás en total" : "Pagarás en total"}</span>
            <Money value={prev.total} className={cn("text-[26px] font-extrabold", isC ? "text-success" : "text-danger")} />
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Totales" icon="receipt">
          <table className="num w-full text-sm">
            <tbody>
              {inicial > 0 && <tr><td className="py-1.5">Valor de la compra</td><td className="py-1.5 text-right">{<Money value={p.monto} />}</td></tr>}
              {inicial > 0 && <tr className="border-t"><td className="py-1.5">− Cuota inicial</td><td className="py-1.5 text-right"><Money value={inicial} /></td></tr>}
              <tr className={inicial > 0 ? "border-t" : undefined}><td className="py-1.5">{inicial > 0 ? "Financiado" : isC ? "Prestaste" : "Te prestaron"}</td><td className="py-1.5 text-right font-medium"><Money value={financiado} /></td></tr>
              <tr className="border-t"><td className="py-1.5">Intereses</td><td className="py-1.5 text-right text-warning"><Money value={prev.int} /></td></tr>
              {tot.x > 0 && <tr className="border-t"><td className="py-1.5">Seguros y otros cobros</td><td className="py-1.5 text-right"><Money value={tot.x} /></td></tr>}
              <tr className="border-t-2 font-bold"><td className="py-2">{isC ? "Recibirás en total" : "Pagarás en total"}</td><td className="py-2 text-right"><Money value={prev.total} /></td></tr>
            </tbody>
          </table>
          <TasaUsura params={params} prev={prev} usura={usura} className="text-sm" />
          {histE && <p className="text-sm text-muted-foreground">Con los pagos anteriores a Mirai {isC ? "te debe" : "debes"} hoy <Money value={histE.saldo} className="font-semibold text-foreground" />.</p>}
        </Card>
        <Card title="En palabras" icon="message-circle">
          <ul className="grid list-disc gap-1.5 pl-5 text-sm">{enPalabras(p).map((t) => <li key={t}>{t}</li>)}</ul>
        </Card>
        {obj && (
          <Card title={tipo === "empeno" ? "Tu objeto empeñado" : "Garantía"} icon="gem" className="md:col-span-2">
            <p className="text-sm"><b>{obj}</b>{avaluo > 0 ? <> · avaluado en <Money value={avaluo} /></> : null}{limite ? <> · fecha límite <b>{fmtDate(limite, { long: true })}</b></> : null}.</p>
            {tipo === "empeno" && <Notice tone="warn" title="Si no pagas a tiempo puedes perder el objeto">Paga o refrenda antes de la fecha límite. Te avisamos con anticipación.</Notice>}
          </Card>
        )}
        <Card title={prev.plan.length > 1 ? `Las ${prev.plan.length} cuotas` : "El pago"} icon="calendar-days" className="md:col-span-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Cuota</TableHead><TableHead className="text-right">Interés</TableHead><TableHead className="text-right">Abono a la deuda</TableHead><TableHead className="text-right">Queda debiendo</TableHead></TableRow></TableHeader>
              <TableBody>
                {prev.plan.map((r) => (
                  <TableRow key={r.n}>
                    <TableCell>{r.n}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.fecha)}</TableCell>
                    <TableCell className="text-right font-semibold"><Money value={r.valor} /></TableCell>
                    <TableCell className="text-right text-warning"><Money value={r.int} /></TableCell>
                    <TableCell className="text-right"><Money value={r.cap} /></TableCell>
                    <TableCell className="text-right"><Money value={r.saldo} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter><TableRow><TableCell colSpan={2}>Total</TableCell><TableCell className="text-right"><Money value={tot.v} /></TableCell><TableCell className="text-right"><Money value={tot.i} /></TableCell><TableCell className="text-right"><Money value={tot.c} /></TableCell><TableCell /></TableRow></TableFooter>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">Es un cálculo estimado con los datos que escribiste. Compáralo con tu extracto, boleta o acuerdo.</p>
        </Card>
      </div>
    </div>
  )
}
