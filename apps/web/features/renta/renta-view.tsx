"use client"

import { BrandLogo } from "@/components/mirai/brand-logo"
import { brandFor } from "@/lib/brands"
import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { CircleCheck, Download, FileSpreadsheet, FileText, Paperclip, Trash2, Upload } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { Combobox } from "@/components/mirai/combobox"
import { DataTable, DTPrimary, type DTColumn } from "@/components/mirai/data-table"
import { Panel } from "@/components/mirai/panel"
import { IconButton, Tip } from "@/components/mirai/tip"
import { ToneIcon, toneFor } from "@/components/mirai/tone-icon"
import { FormField } from "@/components/mirai/field"
import { Icon } from "@/components/mirai/icon"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { MoneyAutosave } from "@/components/mirai/money-autosave"
import { Notice } from "@/components/mirai/notice"
import { PageHeader } from "@/components/mirai/page-header"
import { StatusPill } from "@/components/mirai/status-pill"
import { BTIP, DEDUCIBLES, RDK, RDOCS, RIK, TRAMOS241, bValor, calcRenta, compraEstado, depInfo, depsDe, loanName, patrimonio, rLines, saldoPrestamoAl, titularId, topes, conv, type RdkKey, type RikKey, type TaxAssetIn } from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { rentaInput, type RentaData, type TaxYearRow } from "./data"
import { BienForm } from "./bien-form"
import { DepDialog } from "./dep-dialog"

const RTABS = [
  ["resumen", "Resumen", "layout-dashboard"], ["topes", "¿Debo declarar?", "scale"], ["ingresos", "Ingresos", "arrow-down-to-line"], ["bienes", "Bienes", "house"],
  ["deudas", "Deudas", "receipt"], ["dependientes", "Dependientes", "baby"], ["deducciones", "Deducciones", "badge-percent"], ["documentos", "Documentos", "folder-check"], ["borrador", "Borrador del impuesto", "calculator"],
] as const
type Tab = (typeof RTABS)[number][0]
const $ = (v: number) => fmtMoney(Math.round(v))
const BT = Object.fromEntries(BTIP.map(([k, l, i]) => [k, { l, i }])) as Record<string, { l: string; i: string }>
/** Color de referencia por tipo de bien. */
const BTONE: Record<string, "blue" | "amber" | "green" | "violet" | "brand" | "navy" | "gray"> = { inmueble: "blue", vehiculo: "amber", cuenta: "green", inversion: "violet", cripto: "violet", exterior: "navy", cobrar: "brand" }
type BienRow = TaxAssetIn & { id?: string }
/** Fila "concepto ··· valor" de los resúmenes (mismo alto y alineación en todas las tarjetas). */
function Line({ l, v, strong, className }: { l: React.ReactNode; v: number; strong?: boolean; className?: string }) {
  return <div className={cn("flex items-baseline justify-between gap-3 border-b py-2 text-sm last:border-0", strong && "font-semibold", className)}><span className="min-w-0">{l}</span><Money value={v} className="shrink-0 tabular-nums" /></div>
}

/** Acciones de escritura (solo el titular; en el portal del contador no existen). */
export type RentaActions = {
  saveTax: (y: number, mid: string, patch: Partial<Pick<TaxYearRow, "ing" | "ded" | "docs" | "consig" | "consumos">>) => Promise<void>
  saveUvt: (y: number, v: number) => Promise<void>
  saveBien: (b: TaxAssetIn & { id?: string }) => Promise<void>
  delBien: (id: string, nombre: string) => Promise<void>
  importBienes: () => Promise<number>
  saveMember: (id: string, patch: Record<string, unknown>) => Promise<void>
  upload: (y: number, docKey: string, f: File) => Promise<void>
  delAttachment: (id: string) => Promise<void>
}

export function RentaView({ data, actions, fileUrl, contador, exportName }: {
  data: RentaData; actions: RentaActions | null; fileUrl: (path: string) => Promise<string | null>
  contador?: { label: string; owner: string; exp: string | null }; exportName?: string
}) {
  const ro = !actions
  const today = todayISO()
  const yNow = +today.slice(0, 4)
  const [y, setY] = useState(yNow - 1)
  const tit = titularId(data.members)
  const [mid, setMid] = useState(tit)
  const [tab, setTab] = useState<Tab>("resumen")
  const [bien, setBien] = useState<(TaxAssetIn & { id?: string }) | null>(null)
  const [dep, setDep] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const R = useMemo(() => rentaInput(data, y, mid), [data, y, mid])
  const C = useMemo(() => calcRenta(R, y, mid, today), [R, y, mid, today])
  const P = useMemo(() => patrimonio(R, mid, today, { y }), [R, mid, today, y])
  const T = useMemo(() => topes(R, y, mid, today), [R, y, mid, today])
  const U = C.U
  const tax = R.tax ?? { ing: {}, ded: {}, docs: {}, consig: 0, consumos: 0 }
  const debe = T.some((t) => t.pasa), cerca = !debe && T.some((t) => t.v >= 0.85 * t.tope)
  const quien = data.members.find((m) => m.id === mid)?.nombre ?? data.perfil.nombre
  const esTit = mid === tit
  const fecha = esTit ? data.fechas.filter((f) => f.year === y + 1).sort((a, b) => (a.regimen === "general" ? -1 : b.regimen === "general" ? 1 : 0))[0] : null
  const save = (patch: Parameters<RentaActions["saveTax"]>[2]) => actions?.saveTax(y, mid, patch)
  const deps = depsDe(data.members, mid, today)
  const ndocs = RDOCS.filter(([k]) => tax.docs?.[k] || data.attachments.some((a) => a.doc_key === k && a.year === y)).length
  const years = [...new Set([2024, 2025, 2026, yNow - 1, yNow].filter((v) => v <= yNow))].sort()

  const exportPdf = async () => {
    setBusy("pdf")
    try { const { downloadRentaPdf } = await import("./renta-pdf"); await downloadRentaPdf({ data, y, mid, quien, R, C, P, T, docs: tax.docs ?? {} }, `renta-${y}${exportName ? `-${exportName}` : ""}.pdf`) }
    catch (e) { toast.error("No se pudo generar el informe", { description: (e as Error).message }) }
    setBusy(null)
  }
  const exportXlsx = async () => {
    setBusy("xlsx")
    try { const { downloadRentaXlsx } = await import("./renta-xlsx"); await downloadRentaXlsx({ data, y, mid, C, P }, `mirai-renta-${y}.xlsx`) }
    catch (e) { toast.error("No se pudo generar el Excel", { description: (e as Error).message }) }
    setBusy(null)
  }

  const ingRow = (k: RikKey, l: string, h: string) => {
    const manual = tax.ing?.[k] !== undefined && tax.ing?.[k] !== null && tax.ing?.[k] !== ""
    const est = (C.A as Record<string, number>)[k] || 0
    return (
      <div key={k} className="grid gap-2 border-b py-3 last:border-0 sm:grid-cols-[1fr_14rem] sm:items-center">
        <div><p className="flex flex-wrap items-center gap-2 font-medium"><label htmlFor={`ing-${k}`}>{l}</label>{manual ? <Tip label="Lo escribiste tú, con el dato del certificado."><span><StatusPill tone="info">Del certificado</StatusPill></span></Tip> : est ? <Tip label="Lo calculamos con lo que registraste en Mirai. Si tienes el certificado, escribe el valor exacto."><span><StatusPill tone="estimado">Estimado</StatusPill></span></Tip> : <StatusPill tone="gray">Sin dato</StatusPill>}</p><p className="text-sm text-muted-foreground">{h}</p></div>
        {ro ? <p className="text-right font-medium tabular-nums"><Money value={(C as unknown as Record<string, number>)[k]} /></p>
          : <MoneyAutosave id={`ing-${k}`} value={manual ? +(tax.ing?.[k] ?? 0) : 0} placeholder={est ? new Intl.NumberFormat("es-CO").format(Math.round(est)) : "0"} onSave={(v) => { const ing = { ...tax.ing }; if (v) ing[k] = v; else delete ing[k]; save({ ing }) }} />}
      </div>
    )
  }

  const tiposBien = [...new Set(P.B.map((b) => b.tipo))]
  const bienCols: DTColumn<BienRow>[] = [
    { id: "bien", header: "Bien", sort: (b) => b.nombre, csv: (b) => b.nombre,
      cell: (b) => <DTPrimary media={brandFor(b.entidad) ? <BrandLogo k={brandFor(b.entidad)!} size={36} /> : <ToneIcon icon={BT[b.tipo]?.i ?? "tag"} tone={BTONE[b.tipo] ?? toneFor(b.tipo)} />} title={b.nombre}
        sub={[BT[b.tipo]?.l, b.entidad, b.fecha_adq ? `desde ${fmtDate(b.fecha_adq)}` : ""].filter(Boolean).join(" · ")} /> },
    { id: "ident", header: "Identificación", csv: (b) => b.ident ?? "", cell: (b) => b.ident || <span className="text-muted-foreground">—</span> },
    { id: "costo", header: "Costo fiscal", align: "right", sort: (b) => b.costo, csv: (b) => b.costo, cell: (b) => <Money value={b.costo} /> },
    { id: "avaluo", header: "Avalúo", align: "right", sort: (b) => b.avaluo, csv: (b) => b.avaluo, cell: (b) => <Money value={b.avaluo} /> },
    { id: "pct", header: "Tu parte", info: "El porcentaje del bien que es tuyo.", align: "right", sort: (b) => +b.pct, csv: (b) => b.pct, cell: (b) => <span className="tabular-nums">{b.pct} %</span> },
    { id: "valor", header: "Valor a declarar", align: "right", sort: (b) => (bValor(b) * (+b.pct || 100)) / 100, csv: (b) => Math.round((bValor(b) * (+b.pct || 100)) / 100),
      cell: (b) => <Money value={(bValor(b) * (+b.pct || 100)) / 100} className="font-semibold" /> },
  ]

  return (
    <div className="grid gap-6">
      {contador ? (
        <Notice tone="info" title={`Portal del contador · ${contador.owner}`}>Solo lectura · datos en vivo · {contador.exp ? `acceso hasta el ${fmtDate(contador.exp.slice(0, 10))}` : "sin vencimiento"}</Notice>
      ) : null}
      <PageHeader id="renta" noHelp={ro} title="Declaración de renta" description={ro ? "Información para preparar la declaración. Todo es un estimado." : undefined}
        actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportPdf} disabled={busy === "pdf"}>{busy === "pdf" ? <Spinner /> : <FileText />} Informe</Button><Button variant="outline" onClick={exportXlsx} disabled={busy === "xlsx"}>{busy === "xlsx" ? <Spinner /> : <FileSpreadsheet />} Excel</Button></div>} />
      {!ro && <p className="-mt-3 text-sm text-muted-foreground">¿Te ayuda un contador? <Link href="/contador" className="text-link underline">Dale acceso de solo lectura</Link> para que vea esta información en vivo.</p>}

      <Panel className="grid gap-4 sm:grid-cols-3">
        <FormField label="Año gravable" htmlFor="r-year" tip="El año de los ingresos que declaras. La declaración se presenta al año siguiente."><Combobox id="r-year" value={String(y)} onChange={(v) => setY(+v)} options={years.map((v) => ({ value: String(v), label: `${v} (declaras en ${v + 1})` }))} /></FormField>
        <FormField label="¿Quién declara?" htmlFor="r-quien" tip={false}><Combobox id="r-quien" value={mid} onChange={setMid} options={data.members.map((m) => ({ value: m.id, label: m.nombre, icon: "user", hint: m.rol }))} /></FormField>
        <FormField label={`UVT del año ${y}`} htmlFor="r-uvt" tip="La Unidad de Valor Tributario que fija la DIAN cada año. Los topes y la tabla del impuesto se miden en UVT.">
          {ro ? <p className="flex h-11 items-center font-medium" data-money>{$(U)}</p> : <MoneyAutosave id="r-uvt" value={U} onSave={(v) => actions!.saveUvt(y, v)} />}
        </FormField>
      </Panel>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Partes de la declaración">
        {RTABS.map(([k, l, i]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none", tab === k ? "bg-brand-soft font-semibold text-link ring-1 ring-brand/30" : "text-muted-foreground")}>
            <Icon name={i} className="size-4" />{l}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <div className="grid gap-6">
          <Notice tone={debe ? "warn" : cerca ? "info" : "ok"} title={debe ? "Sí, todo indica que debes declarar renta" : cerca ? "Estás cerca de los topes: revisa con cuidado" : "Por ahora no superas los topes para declarar"}>
            {quien} · año gravable {y}. {fecha ? <>Tu fecha límite: <b>{fmtDate(fecha.fecha, { long: true, year: true })}</b>.</> : ro ? <>La fecha límite depende de los dos últimos dígitos del NIT.</> : <>Mira tu fecha en el <Link href="/calendario" className="underline">Calendario fiscal</Link>.</>}
          </Notice>
          <KpiGrid className="xl:grid-cols-3">
            <Kpi icon={C.saldo >= 0 ? "receipt" : "piggy-bank"} tone={C.saldo >= 0 ? "red" : "green"} label={C.saldo >= 0 ? "Impuesto estimado a pagar" : "Saldo estimado a favor"} value={<Money value={Math.abs(C.saldo)} />} sub={`Impuesto ${$(C.imp)} − retenciones ${$(C.ret)}`} />
            <Kpi icon="landmark" label="Patrimonio líquido" value={<Money value={P.liquido} />} sub="Bienes − deudas" />
            <Kpi icon="arrow-down-to-line" tone="green" label="Ingresos brutos del año" value={<Money value={C.brutos} />} />
          </KpiGrid>
          <Panel title="Tu ruta para declarar" icon="route" className="gap-2">
            {([
              ["Revisa tus ingresos", Object.keys(tax.ing ?? {}).length > 0, "ingresos"],
              ["Registra tus bienes", P.B.length > 0 || data.book.assets.length > 0, "bienes"],
              [`Revisa tus dependientes${deps.length ? ` (${deps.length})` : ""}`, data.members.some((m) => m.dep_de === mid), "dependientes"],
              ["Agrega tus deducciones", Object.values(tax.ded ?? {}).some((v) => +(v ?? 0) > 0), "deducciones"],
              ["Reúne los documentos", ndocs >= RDOCS.length * 0.6, "documentos"],
            ] as [string, boolean, Tab][]).map(([l, ok, t], i) => (
              <button key={l} type="button" onClick={() => setTab(t)} className="flex items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-hover">
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold", ok ? "bg-success text-white" : "bg-muted")}>{ok ? <CircleCheck className="size-4" /> : i + 1}</span>
                <span className="flex-1">{l}</span>{ok && <StatusPill tone="pagado">Listo</StatusPill>}
              </button>
            ))}
            {!ro && <Link href="/contador" className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-hover"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">6</span>Comparte con tu contador</Link>}
            <p className="pt-2 text-xs text-muted-foreground">Estimación para la cédula general. No incluye dividendos, ganancias ocasionales ni anticipo del año siguiente. El valor final lo determina el contador.</p>
          </Panel>
        </div>
      )}

      {tab === "topes" && (
        <Panel title={`Los topes de la DIAN para el año ${y}`} icon="scale" info="Si superas uno solo de estos topes, debes declarar renta.">
          {T.map((t) => (
            <div key={t.l} className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-2"><p className="flex-1 font-medium">{t.l}</p><Money value={t.v} className="font-semibold" />{t.pasa ? <Tip label="Superas este tope: debes declarar."><span><StatusPill tone="vencido">Supera</StatusPill></span></Tip> : <Tip label={`Te faltan ${$(t.tope - t.v)} para llegar al tope.`}><span><StatusPill tone="ok">Debajo</StatusPill></span></Tip>}</div>
              <Progress value={Math.min(100, (t.v / t.tope) * 100)} className={cn("h-2", t.pasa ? "[&>div]:bg-danger" : "[&>div]:bg-lime")} />
              <p className="text-xs text-muted-foreground">{t.d} Tope: {new Intl.NumberFormat("es-CO").format(t.u)} UVT = {$(t.tope)}</p>
            </div>
          ))}
          {!ro && (
            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
              <FormField label="Consignaciones del año (aprox.)" hint="Suma lo que te entró a tus cuentas." tip={false}><MoneyAutosave value={+tax.consig} onSave={(v) => save({ consig: v })} /></FormField>
              <FormField label="Consumos totales del año (si no los registraste todos)" tip={false}><MoneyAutosave value={+tax.consumos} onSave={(v) => save({ consumos: v })} /></FormField>
            </div>
          )}
        </Panel>
      )}

      {tab === "ingresos" && (
        <Panel title="Ingresos, aportes y retenciones" icon="arrow-down-to-line" className="gap-1"
          description={<>Calculados con lo que registraste en Mirai. {!ro && "Deja vacío para usar el valor estimado (gris). Los salarios incluyen 12 meses más las primas."}</>}>
          {(C.A.ext > 0 || C.A.apG > 0 || C.A.retG > 0) && (
            <p className="text-sm text-muted-foreground" data-testid="renta-fuentes">
              {C.A.ext > 0 && <>Incluye <Money value={C.A.ext} /> de ingresos extra que registraste en {y}. </>}
              {(C.A.apG > 0 || C.A.retG > 0) && <>Los aportes y la retención usan los descuentos que guardaste en tus ingresos.</>}
            </p>
          )}
          <div>{RIK.map(([k, l, h]) => ingRow(k, l, h))}</div>
        </Panel>
      )}

      {tab === "bienes" && (
        <div className="grid gap-6">
          {!ro && data.book.assets.length > 0 && (
            <Notice tone="info" title="¿Ya registraste tus bienes en Mi dinero?" action={<Button variant="outline" onClick={async () => { const n = await actions!.importBienes(); toast(n ? `Traje ${n} bien${n === 1 ? "" : "es"} de Mi dinero. Completa el costo fiscal y el avalúo.` : "No hay bienes nuevos en Mi dinero.") }}><Download /> Traer de Mi dinero</Button>}>
              Tráelos con un clic y solo completa el costo fiscal y el avalúo.
            </Notice>
          )}
          <DataTable<BienRow> title={`Bienes de ${quien}`} info="Lo que tienes a tu nombre al 31 de diciembre. Los inmuebles se declaran por el mayor valor entre el costo fiscal y el avalúo catastral."
            data={P.B as BienRow[]} rowKey={(b) => b.id ?? b.nombre} columns={bienCols} exportName={`bienes-${y}`}
            search={{ placeholder: "Buscar bien", text: (b) => `${b.nombre} ${b.ident ?? ""} ${b.entidad ?? ""} ${BT[b.tipo]?.l ?? ""}` }}
            filters={tiposBien.length > 1 ? [{ id: "tipo", label: "Tipo", options: tiposBien.map((t) => ({ value: t, label: BT[t]?.l ?? t })), match: (b, v) => b.tipo === v }] : []}
            create={ro ? undefined : { label: "Agregar bien", onClick: () => setBien({ tipo: "inmueble", nombre: "", costo: 0, avaluo: 0, valor31: 0, pct: 100, member_id: mid }) }}
            actions={ro ? undefined : [{ label: "Editar", onSelect: (b) => setBien(b) }, { label: "Eliminar", destructive: true, onSelect: (b) => actions!.delBien(b.id!, b.nombre) }]}
            initialSort={{ id: "valor", dir: "desc" }}
            empty={<p className="text-muted-foreground">Aún no registras bienes para {quien}.</p>}
            footer={<span className="flex flex-wrap items-center justify-between gap-2 text-sm text-foreground"><span className="font-semibold">Total bienes</span><Money value={P.bv} className="font-semibold" /></span>} />
          {esTit && (
            <Panel title="También suman a tu patrimonio (de Mi dinero)" icon="wallet" className="gap-1">
              <div>
                {([["Cuentas y efectivo", P.cuentas], ["Inversiones", P.invs], ["Lo que te deben", P.cobr], ["Otros bienes sin detalle", P.otrosAct]] as [string, number][]).map(([l, v]) => <Line key={l} l={l} v={v} />)}
                <Line l="Patrimonio bruto" v={P.bruto} strong className="border-t" />
              </div>
            </Panel>
          )}
        </div>
      )}

      {tab === "deudas" && (
        <Panel title={P.corte && P.corte < today ? `Deudas al 31 de diciembre de ${y}` : "Deudas a hoy (el año aún no termina)"} icon="receipt" className="gap-1"
          description={esTit ? (P.corte && P.corte < today ? "Préstamos y tarjetas con los pagos que registraste hasta esa fecha. Pide a cada entidad el certificado de saldo al 31 de diciembre." : "El año aún no termina: son los saldos de hoy. Pide a cada entidad el certificado de saldo al 31 de diciembre.") : undefined}>
          {!esTit ? <p className="text-sm text-muted-foreground">Las deudas registradas en Mirai se asignan al titular del libro.</p> : (
            <div>
              {data.liabilitiesNamed.map((l, i) => <Line key={i} l={l.nombre} v={conv(l.valor, l.currency, data.book.settings.trm)} />)}
              {data.book.loans.filter((L) => L.kind === "pagar").map((L) => ({ L, v: saldoPrestamoAl(L, P.corte ?? today) })).filter((x) => x.v > 1).map(({ L, v }) => <Line key={L.id} l={L.concepto || loanName(L, data.book.contacts, data.book.entities)} v={v} />)}
              {data.book.creditCards.map((t) => ({ t, v: (t.purchases || []).filter((c) => c.fecha <= (P.corte ?? today)).reduce((a, c) => a + compraEstado(t, c, P.corte ?? today).saldo, 0) })).filter((x) => x.v > 1).map(({ t, v }) => <Line key={t.id} l={`Tarjeta ${t.nombre}`} v={v} />)}
              {P.deudas <= 0 && <p className="py-2 text-sm text-muted-foreground">No tienes deudas registradas en Mirai.</p>}
              <Line l="Total deudas" v={P.deudas} strong className="border-t" />
            </div>
          )}
        </Panel>
      )}

      {tab === "dependientes" && (
        <div className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            {data.members.filter((m) => m.id !== mid).map((m) => {
              const d = depInfo(m, today)
              const otro = m.dep_de && m.dep_de !== mid ? data.members.find((x) => x.id === m.dep_de)?.nombre : null
              return (
                <Panel key={m.id} className="flex-row items-center gap-3 p-4">
                  <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full font-semibold", "bg-brand-soft text-link")}>{m.nombre.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1"><p className="font-medium">{m.nombre}</p><p className="text-xs text-muted-foreground">{m.rol}{d.e !== null ? ` · ${d.e} años` : ""}{m.doc ? ` · ${m.doc}` : ""}</p>
                    <div className="mt-1">{otro ? <Tip label="Un dependiente solo lo puede tomar una persona."><span><StatusPill tone="gray">Lo declara {otro}</StatusPill></span></Tip> : m.dep_de === mid ? <StatusPill tone={d.ok ? "pagado" : "porVencer"} className={cn(!d.ok && "h-auto py-0.5 whitespace-normal")}>{d.ok ? "Válido" : d.why}</StatusPill> : <StatusPill tone="gray">No es tu dependiente</StatusPill>}</div>
                    {m.dep_de === mid && d.ok && <p className="mt-1 text-xs text-muted-foreground">{d.why}</p>}
                  </div>
                  {!ro && <Button size="sm" variant="outline" className="shrink-0" onClick={() => setDep(m.id)} aria-label={`Editar los datos de ${m.nombre}`}>Editar datos</Button>}
                </Panel>
              )
            })}
            {data.members.length <= 1 && <p className="text-sm text-muted-foreground">{ro ? "No hay otros integrantes registrados." : <>Agrega a tu familia en <Link className="underline" href="/perfil">Perfil</Link> para usar dependientes.</>}</p>}
          </div>
          <Panel title="¿Cuánto te ahorran?" icon="piggy-bank" className="gap-2">
            <p className="text-sm">Tienes <b>{C.nD}</b> dependiente{C.nD === 1 ? "" : "s"} válido{C.nD === 1 ? "" : "s"}.</p>
            <div>
              <Line l="10 % de tus ingresos laborales (tope 32 UVT al mes) — dentro del límite del 40 %" v={C.dep10} />
              <Line l="72 UVT por cada dependiente (hasta 4) — fuera del límite" v={C.dep72} />
            </div>
            {C.nD > 0 && <p className="text-xs text-muted-foreground">Desde el Decreto 2231 de 2023, un mismo dependiente sirve para el 10 % y para los 72 UVT.</p>}
            <p className="text-xs text-muted-foreground">Los hijos de 18 a 25 años cuentan si estudian y tú les pagas la educación superior o técnica (Ley 2411 de 2024).</p>
          </Panel>
        </div>
      )}

      {tab === "deducciones" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Deducciones y beneficios" icon="badge-percent" className="gap-1" description="Escribe lo que pagaste en el año según tus certificados.">
            <div>
              {RDK.map(([k, l, h, tope]) => {
                const manual = +(tax.ded?.[k as RdkKey] ?? 0) || 0
                const est = C.dedAuto[k as RdkKey] || 0
                const marca = DEDUCIBLES.find((d) => d.campo === k)
                const ref = marca && C.ded ? C.ded[marca.value] : null
                return (
                  <div key={k} className="grid gap-2 border-b py-3 last:border-0" data-testid={`ded-${k}`}>
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-medium"><label htmlFor={`ded-${k}`}>{l}</label>{manual ? <StatusPill tone="info">Del certificado</StatusPill> : est ? <Tip label="Lo sumamos de los gastos que marcaste como deducibles en el año. Si tienes el certificado, escribe el valor exacto."><span><StatusPill tone="estimado">De tus gastos</StatusPill></span></Tip> : null}</p>
                      <p className="text-sm text-muted-foreground">{h}{tope ? ` (${$(tope * U)})` : ""}</p>
                    </div>
                    {ro ? <Money value={manual || est} className="font-medium" /> : <MoneyAutosave id={`ded-${k}`} value={manual} placeholder={est ? new Intl.NumberFormat("es-CO").format(Math.round(est)) : "0"} onSave={(v) => { const ded = { ...tax.ded }; if (v) ded[k as RdkKey] = v; else delete ded[k as RdkKey]; save({ ded }) }} />}
                    {ref && ref.n > 0 && !est && (
                      <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1">Marcaste {ref.n} gasto{ref.n === 1 ? "" : "s"} por <Money value={ref.v} /> en {y}. {marca!.help.split(".")[0]}.</span>
                        {!ro && !manual && <Button size="sm" variant="outline" onClick={() => save({ ded: { ...tax.ded, [k]: Math.round(ref.v) } })}>Usar este valor</Button>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {C.ded && C.ded.dependiente.n > 0 && <p className="pt-2 text-xs text-muted-foreground">También marcaste {C.ded.dependiente.n} gasto{C.ded.dependiente.n === 1 ? "" : "s"} de dependientes (<Money value={C.ded.dependiente.v} />): no se restan por su valor, pero sirven de respaldo para tu contador.</p>}
          </Panel>
          <Panel title="Cómo quedan aplicadas" icon="list-checks" className="gap-1">
            <div>
              {([[`Cesantías exentas (${Math.round(C.cesPct * 100)} %)`, C.cesEx], ["Aportes voluntarios y AFC", C.vol], ["Dependientes (10 %)", C.dep10], ["Intereses de vivienda", C.intViv], ["Medicina prepagada", C.prep], ["50 % del 4×1000", C.gmf], ["Intereses ICETEX", C.icetex], ["Renta exenta del 25 %", C.r25]] as [string, number][]).map(([l, v]) => <Line key={l} l={l} v={v} />)}
              <Line l="Subtotal" v={C.sub} className="font-medium" />
              <Line l="Límite (40 % de la renta líquida, máx. 1.340 UVT)" v={C.lim} />
            </div>
            {C.recorte > 0 && <Notice tone="warn" title={`Pierdes ${$(C.recorte)} por el límite`} />}
            <div>
              <Line l="Aplicado" v={C.apl} strong />
              <Line l="Fuera del límite: dependientes adicionales + 1 % factura electrónica" v={C.dep72 + C.fe} className="border-t" />
            </div>
          </Panel>
        </div>
      )}

      {tab === "documentos" && <Docs data={data} y={y} docs={tax.docs ?? {}} ro={ro} actions={actions} fileUrl={fileUrl} onToggle={(k, v) => save({ docs: { ...tax.docs, [k]: v } })} />}

      {tab === "borrador" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Borrador del impuesto" icon="calculator" className="gap-1" description="Cédula general · formulario 210">
            <div>{rLines(C).map(([l, v]) => <Line key={l} l={l} v={v} strong={l.startsWith("=")} />)}</div>
          </Panel>
          <Panel title="Tabla del artículo 241" icon="table" className="gap-1" info="La tabla con la que la DIAN calcula el impuesto según tu renta gravable en UVT.">
            <p className="text-sm">Tu renta gravable: <b>{new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(C.RLG / U)} UVT</b></p>
            <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Desde (UVT)</th><th className="font-medium">Hasta</th><th className="font-medium">Tarifa</th><th className="font-medium">Más</th></tr></thead>
              <tbody>{TRAMOS241.map(([a, b, t, m]) => { const on = C.RLG / U > a && C.RLG / U <= b || (a === 0 && C.RLG / U <= b); return <tr key={a} className={cn("border-t tabular-nums", on && "bg-brand-soft font-semibold")} aria-current={on || undefined}><td className="py-1.5 pl-1">{a}</td><td>{b === Infinity ? "En adelante" : b}</td><td>{t} %</td><td>{m} UVT</td></tr> })}</tbody></table>
          </Panel>
        </div>
      )}

      {bien && actions && <BienForm value={bien} members={data.members} onClose={() => setBien(null)} onSave={async (b) => { await actions.saveBien(b); setBien(null) }} />}
      {dep && actions && <DepDialog member={data.members.find((m) => m.id === dep)!} members={data.members} onClose={() => setDep(null)} onSave={async (p) => { await actions.saveMember(dep, p); setDep(null) }} />}
    </div>
  )
}

function Docs({ data, y, docs, ro, actions, fileUrl, onToggle }: { data: RentaData; y: number; docs: Record<string, boolean>; ro: boolean; actions: RentaActions | null; fileUrl: (p: string) => Promise<string | null>; onToggle: (k: string, v: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const files = (k: string) => data.attachments.filter((a) => a.doc_key === k && a.year === y)
  const n = RDOCS.filter(([k]) => docs[k] || files(k).length).length
  return (
    <Panel title={`Documentos (${n} de ${RDOCS.length})`} icon="folder-check" className="gap-2" description={ro ? undefined : "Tu contador ve este avance y los archivos que subas."}>
      <Progress value={(n / RDOCS.length) * 100} className="h-2 [&>div]:bg-lime" aria-label={`${n} de ${RDOCS.length} documentos listos`} />
      {RDOCS.map(([k, l, h]) => (
        <div key={k} className="grid gap-2 border-b py-3 last:border-0">
          <div className="flex items-start gap-3">
            <Checkbox checked={!!docs[k] || files(k).length > 0} disabled={ro} onCheckedChange={(v) => onToggle(k, v === true)} aria-label={l} className="mt-0.5" />
            <div className="flex-1"><p className="font-medium">{l}</p><p className="text-sm text-muted-foreground">{h}</p></div>
            {!ro && <Button size="sm" variant="outline" disabled={busy === k} aria-label={`Subir ${l}`} onClick={() => { setTarget(k); input.current?.click() }}>{busy === k ? <Spinner /> : <Upload />} {busy === k ? "Subiendo…" : "Subir"}</Button>}
          </div>
          {files(k).map((f) => (
            <div key={f.id} className="ml-7 flex items-center gap-2 text-sm">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <button type="button" className="min-w-0 flex-1 truncate text-left text-link underline" onClick={async () => { const u = await fileUrl(f.path); if (u) window.open(u, "_blank") }}>{f.nombre}</button>
              <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(f.size / 1024))} KB</span>
              {!ro && <IconButton size="icon-sm" icon={<Trash2 />} label={`Quitar ${f.nombre}`} destructive onClick={() => actions!.delAttachment(f.id)} />}
            </div>
          ))}
        </div>
      ))}
      <input ref={input} type="file" hidden accept="application/pdf,image/*" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ""
        if (!f || !target || !actions) return
        if (f.size > 15 * 1024 * 1024) return toast.error("El archivo pesa más de 15 MB")
        setBusy(target)
        try { await actions.upload(y, target, f); toast.success("Documento guardado") } catch (err) { toast.error("No se pudo subir", { description: (err as Error).message }) }
        setBusy(null)
      }} />
    </Panel>
  )
}

