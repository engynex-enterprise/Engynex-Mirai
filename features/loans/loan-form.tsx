"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FieldGroup, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Camera } from "lucide-react"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { AddressFields, emptyAddress, type Address } from "@/components/mirai/address-fields"
import { FormSkeleton } from "@/components/skeletons/form-skeleton"
import { useBookId } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { FRECS, SISTEMAS, histPlan, loanEngine, norm, previewLoan, rateFromCuota, type HistMode, type Sistema } from "@/lib/domain"
import { fmtDate, fmtMoney, fmtPct, todayISO } from "@/lib/format"
import { contactOptions, entityOptions, useCatalogsReady, useContacts, useEntities, useSettings } from "@/features/catalogs/hooks"
import { DOC_TIPOS } from "@/features/contacts/contact-form"
import { EntityDialog } from "@/features/catalogs/entity-dialog"
import { readLoanDoc } from "@/features/ai/actions"
import { useSave } from "@/hooks/use-book-data"

export type LoanKind = "cobrar" | "pagar"
type Props = { kind: LoanKind; open: boolean; onOpenChange: (o: boolean) => void; contactId?: string | null; empeno?: boolean; onSaved?: (id: string) => void }

const plusMonths = (iso: string, m: number) => { const d = new Date(iso + "T12:00:00"); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10) }

export function LoanForm(props: Props) {
  const ready = useCatalogsReady()
  return (
    <ResponsiveDialog open={props.open} onOpenChange={props.onOpenChange} wide mdesc="loan"
      title={props.empeno ? "Registrar un empeño" : props.kind === "cobrar" ? "Registrar un préstamo que hiciste" : "Registrar una deuda"}>
      {props.open && (ready ? <Body {...props} /> : <FormSkeleton fields={8} />)}
    </ResponsiveDialog>
  )
}

function Body({ kind, onOpenChange, contactId, empeno, onSaved }: Props) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const router = useRouter()
  const today = todayISO()
  const isC = kind === "cobrar"
  const { data: contacts = [] } = useContacts()
  const { data: entities = [] } = useEntities()
  const { data: cfg } = useSettings()
  const defs = (cfg?.defaults ?? {}) as { sistema?: string; frec?: string; plazo?: number }
  const usura = Number(cfg?.usura ?? 26)

  const [quien, setQuien] = useState<"ex" | "new" | "ent">(contactId ? "ex" : isC ? (contacts.length ? "ex" : "new") : "ent")
  const [contact, setContact] = useState<string | null>(contactId ?? null)
  const [entity, setEntity] = useState<string | null>(null)
  const [nc, setNc] = useState({ nombre: "", docTipo: "CC", doc: "", telefono: "", email: "", relacion: "" })
  const [addr, setAddr] = useState<Address>(emptyAddress)
  const [monto, setMonto] = useState(0)
  const [concepto, setConcepto] = useState("")
  const [inicio, setInicio] = useState(today)
  const [frec, setFrec] = useState(empeno ? "mensual" : defs.frec || "mensual")
  const [plazo, setPlazo] = useState(String(empeno ? 4 : defs.plazo || 12))
  const [extra, setExtra] = useState(0)
  const [modoInt, setModoInt] = useState<"no" | "tasa" | "cuota">(empeno ? "tasa" : isC ? "no" : "tasa")
  const [tasa, setTasa] = useState("")
  const [ea, setEa] = useState("")
  const [cuotaV, setCuotaV] = useState(0)
  const [sistema, setSistema] = useState<Sistema>(empeno ? "americano" : ((defs.sistema as Sistema) || "frances"))
  const [prenda, setPrenda] = useState(empeno ? "si" : "no")
  const [pr, setPr] = useState({ obj: "", valor: 0, limite: plusMonths(today, empeno ? 4 : 12), ref: "" })
  const [hist, setHist] = useState<HistMode>("nuevo")
  const [ncuotas, setNcuotas] = useState("")
  const [saldoHoy, setSaldoHoy] = useState(0)
  const [fult, setFult] = useState(today)
  const [busy, setBusy] = useState(false)
  const [newEnt, setNewEnt] = useState<string | null>(null)
  const [ocr, setOcr] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null })
  const fotoRef = useRef<HTMLInputElement>(null)
  const sbSave = useSave("entities")

  /** Lee extracto, pagaré o factura con IA y llena el formulario (ocrLoan de la v4). */
  const onFoto = async (f?: File) => {
    if (!f) return
    setOcr({ busy: true, msg: "Leyendo el documento…" })
    const fd = new FormData(); fd.append("file", f)
    const r = await readLoanDoc(fd, kind).catch((e) => ({ ok: false as const, msg: (e as Error).message }))
    if (!r.ok) return setOcr({ busy: false, msg: r.msg })
    const d = r.d, got: string[] = []
    if (!isC && d.acreedor && !d.acreedor_es_persona) {
      const nit = (d.acreedor_nit ?? "").replace(/\D/g, "")
      let e = entities.find((x) => (nit && x.nit === nit) || norm(x.nombre) === norm(d.acreedor!) || (x.nombre.length > 4 && norm(d.acreedor!).includes(norm(x.nombre))))
      if (!e) { const row = await sbSave.mutateAsync({ nombre: d.acreedor.slice(0, 60), nit, tipo: "Banco" } as never); e = row as never; got.push(`creamos la entidad “${d.acreedor}”`) }
      setQuien("ent"); setEntity(e!.id); got.push(e!.nombre)
    } else {
      const who = isC ? d.deudor : d.acreedor
      const c = who ? contacts.find((x) => norm(x.nombre) === norm(who)) : null
      if (c) { setQuien("ex"); setContact(c.id); got.push(c.nombre) }
      else if (who) { setQuien("new"); setNc((x) => ({ ...x, nombre: who, doc: (isC ? d.deudor_documento : d.acreedor_nit) ?? "" })); got.push(who) }
    }
    if (d.monto) { setMonto(Math.round(d.monto)); got.push(`valor ${fmtMoney(d.monto)}`) }
    if (d.concepto) setConcepto(d.concepto.slice(0, 80))
    if (d.fecha_inicio && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha_inicio)) setInicio(d.fecha_inicio)
    if (d.frecuencia && FRECS[d.frecuencia]) setFrec(d.frecuencia)
    if (d.plazo_cuotas) { setPlazo(String(Math.round(d.plazo_cuotas))); got.push(`${d.plazo_cuotas} cuotas`) }
    if (d.seguros_por_cuota && !isC) setExtra(Math.round(d.seguros_por_cuota))
    if (d.tasa_mensual || d.tasa_ea) { setModoInt("tasa"); if (d.tasa_mensual) { setTasa(String(d.tasa_mensual).replace(".", ",")); setEa("") } else setEa(String(d.tasa_ea).replace(".", ",")); got.push("tasa") }
    else if (d.valor_cuota) { setModoInt("cuota"); setCuotaV(Math.round(d.valor_cuota)); got.push("cuota") }
    if (d.saldo_actual && d.monto && d.saldo_actual < d.monto) { setHist("saldo"); setSaldoHoy(Math.round(d.saldo_actual)); if (d.fecha_ultimo_pago && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha_ultimo_pago)) setFult(d.fecha_ultimo_pago) }
    else if (d.cuotas_pagadas) { setHist("cuotas"); setNcuotas(String(Math.round(d.cuotas_pagadas))) }
    setOcr({ busy: false, msg: got.length ? `Leímos: ${got.join(", ")}. Revisa los datos antes de guardar.${d.tipo_documento === "recibo_pago" ? " Parece un comprobante de pago: después de guardar, regístralo en “Registrar pago”." : ""}` : "No encontramos datos del crédito en el documento. Escríbelos a mano." })
  }

  const diario = frec === "diario" || frec === "diariohab"
  /** loanParams de la v4 */
  const params = useMemo(() => {
    const n = Math.max(1, Math.round(+plazo || 1))
    let sis: string = sistema, t = 0
    if (modoInt === "no") { sis = "sin"; t = 0 }
    else if (modoInt === "tasa") {
      const e = +ea.replace(",", ".")
      t = e ? (sis === "simple" ? e / 12 : (Math.pow(1 + e / 100, 1 / 12) - 1) * 100) : +tasa.replace(",", ".") || 0
    } else { sis = "frances"; t = rateFromCuota(monto, cuotaV, n, frec) }
    return { monto, plazo: n, frec, tasa: +t.toFixed(4), sistema: sis, inicio, extra: isC ? 0 : extra }
  }, [plazo, sistema, modoInt, ea, tasa, monto, cuotaV, frec, inicio, extra, isC])

  const prev = monto > 0 ? previewLoan(params, today) : null
  const per = FRECS[frec]?.per ?? "mes"
  const histPays = useMemo(() => {
    if (!monto || hist === "nuevo") return []
    return histPlan({ ...params, payments: [] }, { mode: hist, ncuotas: +ncuotas || 0, saldoHoy: hist === "saldo" ? saldoHoy || null : null, fultPago: fult }, today)
  }, [params, hist, ncuotas, saldoHoy, fult, monto, today])
  const histE = monto && hist !== "nuevo" ? loanEngine({ ...params, payments: histPays.map((p) => ({ ...p, valor: p.valor ?? 0 })) }, today) : null

  const submit = async () => {
    if (!monto) return toast.error("Escribe el valor del préstamo")
    if (modoInt === "cuota" && !cuotaV) return toast.error("Escribe el valor de la cuota")
    if (quien === "new" && !nc.nombre.trim()) return toast.error("Escribe el nombre de la persona")
    if (quien === "ex" && !contact) return toast.error("Elige un contacto")
    if (quien === "ent" && !entity) return toast.error("Elige el banco o entidad")
    setBusy(true)
    const sb = createClient()
    let cid = quien === "ex" ? contact : null
    if (quien === "new") {
      const { data, error } = await sb.from("contacts").insert({ book_id: bookId, tipo: "persona", nombre: nc.nombre.trim(), doc_tipo: nc.docTipo, doc: nc.doc.replace(/\D/g, ""), telefono: nc.telefono, email: nc.email, relacion: nc.relacion, direccion: addr, ciudad: addr.ciudad }).select("id").single()
      if (error) { setBusy(false); return toast.error("No se pudo crear el contacto", { description: error.message }) }
      cid = data.id
    }
    const prendaObj = prenda === "si" ? { obj: pr.obj.trim() || "Objeto en garantía", valor: pr.valor, limite: pr.limite, ref: pr.ref.trim() } : null
    const { data: L, error } = await sb.from("loans").insert({
      book_id: bookId, kind, concepto: concepto.trim() || prendaObj?.obj || "", monto, sistema: params.sistema, tasa: params.tasa, frec, plazo: params.plazo, inicio,
      extra: params.extra, contact_id: cid, entity_id: quien === "ent" ? entity : null, prenda: prendaObj, cuota_fija: modoInt === "cuota" ? cuotaV : null, tasa_ea: +ea.replace(",", ".") || null,
    }).select("id").single()
    if (error) { setBusy(false); return toast.error("No se pudo guardar", { description: error.message }) }
    if (histPays.length) await sb.from("loan_payments").insert(histPays.map((p) => ({ book_id: bookId, loan_id: L.id, fecha: p.fecha, tipo: p.tipo, valor: p.valor ?? 0, modo: p.modo ?? null, nota: "Pago anterior a Mirai" })))
    setBusy(false)
    const hx = hist === "nuevo" ? "" : histPays.length
      ? ` Registramos ${histPays.filter((p) => p.tipo === "cuota").length} cuota(s) ya pagada(s)${histPays.some((p) => p.tipo === "abono") ? " y un abono para cuadrar el saldo" : ""}. Saldo actual: ${fmtMoney(histE?.saldo ?? 0)}.`
      : " No había cuotas para marcar como pagadas."
    toast.success(isC ? "Préstamo registrado." : "Deuda registrada.", { description: hx || undefined })
    invalidateBook(qc, bookId, "loans"); invalidateBook(qc, bookId, "contacts"); invalidateBook(qc, bookId, "loan_payments")
    onSaved?.(L.id)
    onOpenChange(false)
    router.push(`/${isC ? "me-deben" : "le-debo"}?id=${L.id}`)
  }

  return (
    <FieldGroup className="pb-2">
      <div className="grid gap-2 rounded-lg border border-dashed p-3">
        <p className="text-sm font-medium">¿Tienes el extracto, pagaré o factura del crédito?</p>
        <p className="text-xs text-muted-foreground">Tómale una foto o súbela y la IA llena los datos: {isC ? "a quién" : "la entidad"}, valor, cuotas, tasa y lo que ya se ha pagado.</p>
        <Button type="button" variant="soft" size="sm" className="w-fit" disabled={ocr.busy} onClick={() => fotoRef.current?.click()}>{ocr.busy ? <Spinner /> : <Camera />} Leer con foto</Button>
        <input ref={fotoRef} type="file" hidden accept="image/*,application/pdf" capture="environment" onChange={(e) => { onFoto(e.target.files?.[0]); e.target.value = "" }} />
        {ocr.msg && <p className="text-sm">{ocr.msg}</p>}
      </div>
      <FieldSeparator>{isC ? "¿A quién le prestaste?" : "¿Quién te prestó?"}</FieldSeparator>
      <Segmented value={quien} onChange={(v) => setQuien(v as typeof quien)} items={[
        ...(!isC ? [{ value: "ent", label: "Banco o entidad", icon: "landmark" }] : []),
        { value: "ex", label: "Un contacto guardado", icon: "user-round" }, { value: "new", label: "Alguien nuevo", icon: "user-plus" },
      ]} />
      {quien === "ent" && <FormField label="Banco o entidad" htmlFor="l-ent"><Combobox id="l-ent" value={entity} onChange={setEntity} options={entityOptions(entities)} createLabel="Crear banco o entidad" onCreate={(t) => setNewEnt(t || " ")} onCreateAI={(t) => setNewEnt(t || " ")} /></FormField>}
      {quien === "ex" && <FormField label="Contacto" htmlFor="l-ct"><Combobox id="l-ct" value={contact} onChange={setContact} options={contactOptions(contacts)} emptyText="No tienes contactos. Elige “Alguien nuevo”." /></FormField>}
      {quien === "new" && (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Nombre completo" htmlFor="l-cn" required><Input id="l-cn" className="h-11" value={nc.nombre} onChange={(e) => setNc({ ...nc, nombre: e.target.value })} /></FormField>
          <FormField label="Celular" htmlFor="l-ctel"><Input id="l-ctel" className="h-11" type="tel" value={nc.telefono} onChange={(e) => setNc({ ...nc, telefono: e.target.value })} /></FormField>
          <FormField label="Tipo de documento" htmlFor="l-cdt"><Combobox id="l-cdt" value={nc.docTipo} onChange={(v) => setNc({ ...nc, docTipo: v })} options={DOC_TIPOS} /></FormField>
          <FormField label="Número de documento" htmlFor="l-cdoc"><Input id="l-cdoc" className="h-11" inputMode="numeric" value={nc.doc} onChange={(e) => setNc({ ...nc, doc: e.target.value })} /></FormField>
          <FormField label="Correo" htmlFor="l-cmail"><Input id="l-cmail" className="h-11" type="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} /></FormField>
          <FormField label="Relación" htmlFor="l-crel"><Combobox id="l-crel" value={nc.relacion} onChange={(v) => setNc({ ...nc, relacion: v })} options={(cfg?.relaciones ?? []).map((r) => ({ value: r, label: r }))} /></FormField>
          <div className="sm:col-span-2"><AddressFields value={addr} onChange={setAddr} idPrefix="lc" /></div>
        </div>
      )}

      <FieldSeparator>¿Cuánto y cómo se paga?</FieldSeparator>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={isC ? "¿Cuánto prestaste?" : "¿Cuánto te prestaron?"} htmlFor="l-monto" required><MoneyInput id="l-monto" value={monto} onChange={setMonto} /></FormField>
        <FormField label="¿Para qué fue?" htmlFor="l-conc"><Input id="l-conc" className="h-11" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej. Arreglo del carro" /></FormField>
        <FormField label="Fecha del préstamo" htmlFor="l-ini"><DatePicker id="l-ini" value={inicio} onChange={(v) => setInicio(v ?? today)} /></FormField>
        <FormField label="¿Cada cuánto se paga?" htmlFor="l-frec"><Combobox id="l-frec" value={frec} onChange={(v) => { setFrec(v); if ((v === "diario" || v === "diariohab") && +plazo < 20) setPlazo("30") }} options={Object.entries(FRECS).map(([value, f]) => ({ value, label: f.n }))} /></FormField>
        <FormField label="¿En cuántas cuotas?" htmlFor="l-plazo" className="sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input id="l-plazo" className="h-11 w-24" type="number" min={1} value={plazo} onChange={(e) => setPlazo(e.target.value)} />
            <Segmented value={plazo} onChange={setPlazo} items={(diario ? [20, 30, 45, 60, 90, 120] : [1, 3, 6, 12, 24, 36, 48]).map((x) => ({ value: String(x), label: String(x) }))} />
          </div>
        </FormField>
        {!isC && <FormField label="Seguros y otros cobros por cuota" htmlFor="l-extra" tip="Los bancos suelen sumar a la cuota un seguro de vida o de deudor. Míralo en tu extracto. Si no sabes, déjalo vacío."><MoneyInput id="l-extra" value={extra} onChange={setExtra} /></FormField>}
      </div>

      <FieldSeparator>¿Cobra intereses?</FieldSeparator>
      <ChoiceCards value={modoInt} onChange={(v) => setModoInt(v as typeof modoInt)} cols={3} items={[
        { value: "no", label: "No", icon: "hand-coins" }, { value: "tasa", label: "Sí, sé el porcentaje", icon: "percent" }, { value: "cuota", label: "Sí, sé cuánto es la cuota", icon: "receipt" },
      ]} />
      {modoInt === "tasa" && (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Interés mensual (%)" htmlFor="l-tasa" hint="Si te dijeron “al 2 %”, escribe 2."><Input id="l-tasa" className="h-11" inputMode="decimal" value={tasa} onChange={(e) => { setTasa(e.target.value); setEa("") }} /></FormField>
          <FormField label="¿O te dieron una tasa anual (E.A.)?" htmlFor="l-ea" tip="Efectivo anual: la que aparece en los extractos de los bancos. La convertimos a mensual."><Input id="l-ea" className="h-11" inputMode="decimal" value={ea} onChange={(e) => { setEa(e.target.value); setTasa("") }} /></FormField>
        </div>
      )}
      {modoInt === "cuota" && <FormField label="Valor de cada cuota" htmlFor="l-cuota" required><MoneyInput id="l-cuota" value={cuotaV} onChange={setCuotaV} /></FormField>}
      {modoInt === "tasa" && (
        <FormField label="¿Cómo se calcula la cuota?">
          <ChoiceCards value={sistema} onChange={(v) => setSistema(v as Sistema)} items={(["frances", "aleman", "simple", "americano"] as Sistema[]).map((s) => ({ value: s, label: SISTEMAS[s].n, desc: SISTEMAS[s].d, icon: SISTEMAS[s].icon, recommended: s === "frances" }))} />
        </FormField>
      )}

      <div className="grid gap-2 rounded-lg border-l-4 border-lime bg-brand-soft p-4 text-sm" aria-live="polite">
        {!prev ? <p>Escribe el valor y el número de cuotas para ver cuánto {isC ? "te pagarán" : "pagarás"} en cada cuota.</p> : (
          <>
            <p className="text-lg font-extrabold">
              {params.sistema === "americano" ? <><Money value={prev.cuota} /> por {per}</> : Math.abs(prev.cuota - prev.cuotaFin) > 1 ? <>De <Money value={prev.cuota} /> a <Money value={prev.cuotaFin} /></> : <><Money value={prev.cuota} /> cada {per}</>}
            </p>
            <p className="text-muted-foreground">{params.sistema === "americano" ? `Solo intereses durante ${params.plazo - 1} cuotas y una última de ${fmtMoney(prev.cuotaFin)}.` : Math.abs(prev.cuota - prev.cuotaFin) > 1 ? "La cuota va bajando en cada pago." : `${params.plazo} cuotas iguales.`}</p>
            <p>En total {isC ? "recibirás" : "pagarás"} <b><Money value={prev.total} /></b>{prev.int > 0.5 ? <>, de los cuales <b><Money value={prev.int} /></b> son intereses</> : ", sin intereses"}. Última cuota: <b>{fmtDate(prev.fin)}</b>.</p>
            {params.tasa > 0 && <p>Interés: {fmtPct(params.tasa, 2)} mensual ≈ {fmtPct(prev.ea * 100, 1)} efectivo anual.</p>}
            {params.tasa > 0 && prev.ea * 100 > usura && <StatusPill tone="vencido" className="h-auto w-fit py-1 whitespace-normal">Supera la tasa de usura configurada ({fmtPct(usura, 2)} E.A.). {isC ? "Cobrar más que eso es ilegal en Colombia." : "Revisa bien este crédito."}</StatusPill>}
          </>
        )}
      </div>

      <FieldSeparator>{isC ? "¿Te dejaron algo en garantía (empeño)?" : "¿Dejaste algo en garantía (empeño)?"}</FieldSeparator>
      <Segmented value={prenda} onChange={setPrenda} items={[{ value: "no", label: "No" }, { value: "si", label: "Sí", icon: "gem" }]} />
      {prenda === "si" && (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={isC ? "¿Qué te dejaron?" : "¿Qué empeñaste?"} htmlFor="l-pro"><Input id="l-pro" className="h-11" value={pr.obj} onChange={(e) => setPr({ ...pr, obj: e.target.value })} placeholder="Ej. Cadena de oro" /></FormField>
          <FormField label="¿Cuánto vale aproximadamente?" htmlFor="l-prv"><MoneyInput id="l-prv" value={pr.valor} onChange={(v) => setPr({ ...pr, valor: v })} /></FormField>
          <FormField label="Fecha límite para recuperarlo" htmlFor="l-prl"><DatePicker id="l-prl" value={pr.limite} onChange={(v) => setPr({ ...pr, limite: v ?? pr.limite })} quick="futuro" /></FormField>
          <FormField label="Número de contrato o boleta" htmlFor="l-prr"><Input id="l-prr" className="h-11" value={pr.ref} onChange={(e) => setPr({ ...pr, ref: e.target.value })} /></FormField>
        </div>
      )}

      <FieldSeparator>{isC ? "¿Ya te ha pagado algo?" : "¿Ya has pagado algo?"}</FieldSeparator>
      <p className="text-sm text-muted-foreground">Si el préstamo empezó antes de usar Mirai, no tienes que registrar cada pago uno por uno.</p>
      <ChoiceCards value={hist} onChange={(v) => setHist(v as HistMode)} cols={2} items={[
        { value: "nuevo", label: "No, es nuevo" },
        { value: "aldia", label: "Va al día", desc: "Marcamos como pagadas todas las cuotas cuya fecha ya pasó." },
        { value: "cuotas", label: "Ya se pagaron algunas cuotas" },
        { value: "saldo", label: "Sé cuánto se debe hoy" },
      ]} />
      {hist === "cuotas" && <FormField label="¿Cuántas cuotas ya se pagaron?" htmlFor="l-nc"><Input id="l-nc" className="h-11 w-32" type="number" min={0} value={ncuotas} onChange={(e) => setNcuotas(e.target.value)} /></FormField>}
      {hist === "saldo" && (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={isC ? "¿Cuánto te debe hoy?" : "¿Cuánto debes hoy?"} htmlFor="l-sh"><MoneyInput id="l-sh" value={saldoHoy} onChange={setSaldoHoy} /></FormField>
          <FormField label="Fecha del último pago" htmlFor="l-fu"><DatePicker id="l-fu" value={fult} onChange={(v) => setFult(v ?? today)} /></FormField>
        </div>
      )}
      {hist !== "nuevo" && (
        <div className="rounded-lg bg-muted p-3 text-sm" aria-live="polite">
          {!monto ? "Primero escribe el valor y las cuotas del préstamo."
            : hist === "saldo" && !saldoHoy ? "Escribe el saldo que aparece en el extracto o el que te dijeron."
            : hist === "saldo" && saldoHoy > monto ? "El saldo de hoy es mayor que el valor prestado. Revisa los valores."
            : histE && (<>
              <p className="font-semibold">Así quedará registrado: {isC ? "te debe" : "debes"} <Money value={histE.saldo} /></p>
              <p className="text-muted-foreground">{histPays.filter((p) => p.tipo === "cuota").length} cuotas pagadas{histPays.some((p) => p.tipo === "abono") ? " + un abono para cuadrar el saldo" : ""} · total {isC ? "recibido" : "pagado"} <Money value={histE.pagado} />. {histE.done ? "¡Quedaría saldado!" : <>Faltan <b>{histE.plan.length}</b> cuotas{histE.vencidas.length ? <>, <b>{histE.vencidas.length} vencidas</b></> : null}.</>}</p>
            </>)}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={submit} disabled={busy}>{busy && <Spinner />} {isC ? "Registrar préstamo" : "Registrar deuda"}</Button>
      </div>
      <EntityDialog open={newEnt !== null} onOpenChange={(o) => !o && setNewEnt(null)} initial={newEnt?.trim() ?? ""} onCreated={(id) => { setQuien("ent"); setEntity(id) }} />
    </FieldGroup>
  )
}
