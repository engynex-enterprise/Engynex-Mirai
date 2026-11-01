"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { CircleCheck, Download, FileSpreadsheet, FileText, Paperclip, Pencil, Plus, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { Combobox } from "@/components/mirai/combobox"
import { FormField } from "@/components/mirai/field"
import { Icon } from "@/components/mirai/icon"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { MoneyAutosave } from "@/components/mirai/money-autosave"
import { Notice } from "@/components/mirai/notice"
import { PageHeader } from "@/components/mirai/page-header"
import { StatusPill } from "@/components/mirai/status-pill"
import { BTIP, RDK, RDOCS, RIK, TRAMOS241, bValor, calcRenta, depInfo, depsDe, loanEngine, loanName, patrimonio, rLines, titularId, topes, conv, type RdkKey, type RikKey, type TaxAssetIn } from "@/lib/domain"
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
  const P = useMemo(() => patrimonio(R, mid, today), [R, mid, today])
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
        <div><p className="flex flex-wrap items-center gap-2 font-medium">{l}{manual ? <StatusPill tone="info">Del certificado</StatusPill> : est ? <StatusPill tone="estimado">Estimado</StatusPill> : <StatusPill tone="gray">Sin dato</StatusPill>}</p><p className="text-sm text-muted-foreground">{h}</p></div>
        {ro ? <p className="text-right font-medium tabular-nums"><Money value={(C as unknown as Record<string, number>)[k]} /></p>
          : <MoneyAutosave value={manual ? +(tax.ing?.[k] ?? 0) : 0} placeholder={est ? new Intl.NumberFormat("es-CO").format(Math.round(est)) : "0"} onSave={(v) => { const ing = { ...tax.ing }; if (v) ing[k] = v; else delete ing[k]; save({ ing }) }} />}
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      {contador ? (
        <Notice tone="info" title={`Portal del contador · ${contador.owner}`}>Solo lectura · datos en vivo · {contador.exp ? `acceso hasta el ${fmtDate(contador.exp.slice(0, 10))}` : "sin vencimiento"}</Notice>
      ) : null}
      <PageHeader id="renta" noHelp={ro} title="Declaración de renta" description={ro ? "Información para preparar la declaración. Todo es un estimado." : undefined}
        actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportPdf} disabled={busy === "pdf"}>{busy === "pdf" ? <Spinner /> : <FileText />} Informe</Button><Button variant="outline" onClick={exportXlsx} disabled={busy === "xlsx"}>{busy === "xlsx" ? <Spinner /> : <FileSpreadsheet />} Excel</Button></div>} />
      {!ro && <p className="-mt-3 text-sm text-muted-foreground">¿Te ayuda un contador? <Link href="/contador" className="text-link underline">Dale acceso de solo lectura</Link> para que vea esta información en vivo.</p>}

      <Card className="flex-row flex-wrap items-end gap-3 p-4 shadow-card ring-0">
        <div className="grid w-full gap-1 sm:w-56"><span className="text-sm font-medium">Año gravable</span><Combobox value={String(y)} onChange={(v) => setY(+v)} options={years.map((v) => ({ value: String(v), label: `${v} (declaras en ${v + 1})` }))} /></div>
        <div className="grid w-full gap-1 sm:w-56"><span className="text-sm font-medium">¿Quién declara?</span><Combobox value={mid} onChange={setMid} options={data.members.map((m) => ({ value: m.id, label: m.nombre, icon: "user", hint: m.rol }))} /></div>
        <div className="grid w-full gap-1 sm:w-48"><span className="text-sm font-medium">UVT del año {y}</span>
          {ro ? <p className="h-10 content-center font-medium">{$(U)}</p> : <MoneyAutosave value={U} onSave={(v) => actions!.saveUvt(y, v)} />}</div>
      </Card>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
        {RTABS.map(([k, l, i]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap hover:bg-hover", tab === k && "bg-brand-soft font-semibold text-link")}><Icon name={i} className="size-4" />{l}</button>
        ))}
      </div>

      {tab === "resumen" && (
        <div className="grid gap-4">
          <Notice tone={debe ? "warn" : cerca ? "info" : "ok"} title={debe ? "Sí, todo indica que debes declarar renta" : cerca ? "Estás cerca de los topes: revisa con cuidado" : "Por ahora no superas los topes para declarar"}>
            {quien} · año gravable {y}. {fecha ? <>Tu fecha límite: <b>{fmtDate(fecha.fecha, { long: true, year: true })}</b>.</> : ro ? <>La fecha límite depende de los dos últimos dígitos del NIT.</> : <>Mira tu fecha en el <Link href="/calendario" className="underline">Calendario fiscal</Link>.</>}
          </Notice>
          <KpiGrid className="xl:grid-cols-3">
            <Kpi icon={C.saldo >= 0 ? "receipt" : "piggy-bank"} tone={C.saldo >= 0 ? "red" : "green"} label={C.saldo >= 0 ? "Impuesto estimado a pagar" : "Saldo estimado a favor"} value={<Money value={Math.abs(C.saldo)} />} sub={`Impuesto ${$(C.imp)} − retenciones ${$(C.ret)}`} />
            <Kpi icon="landmark" label="Patrimonio líquido" value={<Money value={P.liquido} />} sub="Bienes − deudas" />
            <Kpi icon="arrow-down-to-line" tone="green" label="Ingresos brutos del año" value={<Money value={C.brutos} />} />
          </KpiGrid>
          <Card className="gap-2 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Tu ruta para declarar</h2>
            {([
              ["Revisa tus ingresos", Object.keys(tax.ing ?? {}).length > 0, "ingresos"],
              ["Registra tus bienes", P.B.length > 0 || data.book.assets.length > 0, "bienes"],
              [`Revisa tus dependientes${deps.length ? ` (${deps.length})` : ""}`, data.members.some((m) => m.dep_de === mid), "dependientes"],
              ["Agrega tus deducciones", Object.values(tax.ded ?? {}).some((v) => +(v ?? 0) > 0), "deducciones"],
              ["Reúne los documentos", ndocs >= RDOCS.length * 0.6, "documentos"],
            ] as [string, boolean, Tab][]).map(([l, ok, t], i) => (
              <button key={l} type="button" onClick={() => setTab(t)} className="flex items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-hover">
                <span className={cn("grid size-7 place-items-center rounded-full text-xs font-semibold", ok ? "bg-success text-white" : "bg-muted")}>{ok ? <CircleCheck className="size-4" /> : i + 1}</span>
                <span className="flex-1">{l}</span>{ok && <StatusPill tone="pagado">Listo</StatusPill>}
              </button>
            ))}
            {!ro && <Link href="/contador" className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-hover"><span className="grid size-7 place-items-center rounded-full bg-muted text-xs">6</span>Comparte con tu contador</Link>}
            <p className="pt-2 text-xs text-muted-foreground">Estimación para la cédula general. No incluye dividendos, ganancias ocasionales ni anticipo del año siguiente. El valor final lo determina el contador.</p>
          </Card>
        </div>
      )}

      {tab === "topes" && (
        <Card className="gap-4 p-5 shadow-card ring-0">
          <h2 className="font-semibold">Los topes de la DIAN para el año {y}</h2>
          {T.map((t) => (
            <div key={t.l} className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-2"><p className="flex-1 font-medium">{t.l}</p><Money value={t.v} className="font-semibold" />{t.pasa && <StatusPill tone="vencido">Supera</StatusPill>}</div>
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
        </Card>
      )}

      {tab === "ingresos" && (
        <Card className="gap-1 p-5 shadow-card ring-0">
          <h2 className="font-semibold">Ingresos, aportes y retenciones</h2>
          <p className="text-sm text-muted-foreground">Calculados con lo que registraste en Mirai. {!ro && "Deja vacío para usar el valor estimado (gris). Los salarios incluyen 12 meses más las primas."}</p>
          {RIK.map(([k, l, h]) => ingRow(k, l, h))}
        </Card>
      )}

      {tab === "bienes" && (
        <div className="grid gap-4">
          <Card className="gap-3 p-5 shadow-card ring-0">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Bienes de {quien}</h2>
              {!ro && <div className="flex gap-2"><Button variant="outline" onClick={async () => { const n = await actions!.importBienes(); toast(n ? `Traje ${n} bien${n === 1 ? "" : "es"} de Mi dinero. Completa el costo fiscal y el avalúo.` : "No hay bienes nuevos en Mi dinero.") }}><Download /> Traer de Mi dinero</Button><Button onClick={() => setBien({ tipo: "inmueble", nombre: "", costo: 0, avaluo: 0, valor31: 0, pct: 100, member_id: mid })}><Plus /> Agregar bien</Button></div>}
            </div>
            {!P.B.length ? <p className="text-sm text-muted-foreground">Aún no registras bienes para {quien}.</p> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 font-medium">Bien</th><th className="font-medium">Identificación</th><th className="text-right font-medium">Costo fiscal</th><th className="text-right font-medium">Avalúo</th><th className="text-right font-medium">%</th><th className="text-right font-medium">Valor a declarar</th>{!ro && <th />}</tr></thead>
                <tbody>{P.B.map((b) => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="py-2"><div className="flex items-center gap-2"><Icon name={BT[b.tipo]?.i ?? "tag"} className="size-4 text-muted-foreground" /><div><p className="font-medium">{b.nombre}</p><p className="text-xs text-muted-foreground">{BT[b.tipo]?.l}{b.entidad ? ` · ${b.entidad}` : ""}{b.fecha_adq ? ` · desde ${fmtDate(b.fecha_adq)}` : ""}</p></div></div></td>
                    <td>{b.ident || "—"}</td><td className="text-right tabular-nums"><Money value={b.costo} /></td><td className="text-right tabular-nums"><Money value={b.avaluo} /></td><td className="text-right">{b.pct}%</td>
                    <td className="text-right font-medium tabular-nums"><Money value={(bValor(b) * (+b.pct || 100)) / 100} /></td>
                    {!ro && <td className="text-right whitespace-nowrap"><Button size="icon-sm" variant="ghost" aria-label={`Editar ${b.nombre}`} onClick={() => setBien(b)}><Pencil /></Button><Button size="icon-sm" variant="ghost" className="text-danger" aria-label={`Eliminar ${b.nombre}`} onClick={() => actions!.delBien(b.id!, b.nombre)}><Trash2 /></Button></td>}
                  </tr>
                ))}</tbody>
                <tfoot><tr><td colSpan={5} className="py-2 font-semibold">Total bienes</td><td className="text-right font-semibold"><Money value={P.bv} /></td>{!ro && <td />}</tr></tfoot>
              </table></div>
            )}
            <p className="text-xs text-muted-foreground">Los inmuebles se declaran por el mayor valor entre el costo fiscal y el avalúo catastral.</p>
          </Card>
          {esTit && (
            <Card className="gap-1 p-5 shadow-card ring-0">
              <h2 className="font-semibold">También suman a tu patrimonio (de Mi dinero)</h2>
              {([["Cuentas y efectivo", P.cuentas], ["Inversiones", P.invs], ["Lo que te deben", P.cobr], ["Otros bienes sin detalle", P.otrosAct]] as [string, number][]).map(([l, v]) => <div key={l} className="flex justify-between border-b py-2 text-sm last:border-0"><span>{l}</span><Money value={v} /></div>)}
              <div className="flex justify-between pt-2 font-semibold"><span>Patrimonio bruto</span><Money value={P.bruto} /></div>
            </Card>
          )}
        </div>
      )}

      {tab === "deudas" && (
        <Card className="gap-1 p-5 shadow-card ring-0">
          <h2 className="font-semibold">Deudas al 31 de diciembre</h2>
          {!esTit ? <p className="text-sm text-muted-foreground">Las deudas registradas en Mirai se asignan al titular del libro.</p> : <>
            {data.liabilitiesNamed.map((l, i) => <div key={i} className="flex justify-between border-b py-2 text-sm"><span>{l.nombre}</span><Money value={conv(l.valor, l.currency, data.book.settings.trm)} /></div>)}
            {data.book.loans.filter((L) => L.kind === "pagar").map((L) => <div key={L.id} className="flex justify-between border-b py-2 text-sm"><span>{L.concepto || loanName(L, data.book.contacts, data.book.entities)}</span><Money value={loanEngine(L, today).saldo} /></div>)}
            <div className="flex justify-between pt-2 font-semibold"><span>Total deudas</span><Money value={P.deudas} /></div>
            <p className="pt-2 text-xs text-muted-foreground">Pide a cada entidad el certificado de saldo al 31 de diciembre.</p>
          </>}
        </Card>
      )}

      {tab === "dependientes" && (
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            {data.members.filter((m) => m.id !== mid).map((m) => {
              const d = depInfo(m, today)
              const otro = m.dep_de && m.dep_de !== mid ? data.members.find((x) => x.id === m.dep_de)?.nombre : null
              return (
                <Card key={m.id} className="flex-row items-center gap-3 p-4 shadow-card ring-0">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-link">{m.nombre.slice(0, 1)}</span>
                  <div className="min-w-0 flex-1"><p className="font-medium">{m.nombre}</p><p className="text-xs text-muted-foreground">{m.rol}{d.e !== null ? ` · ${d.e} años` : ""}{m.doc ? ` · ${m.doc}` : ""}</p>
                    <div className="mt-1">{otro ? <StatusPill tone="gray">Lo declara {otro}</StatusPill> : m.dep_de === mid ? <StatusPill tone={d.ok ? "pagado" : "porVencer"}>{d.ok ? "Válido" : d.why}</StatusPill> : <StatusPill tone="gray">No es tu dependiente</StatusPill>}</div>
                    {m.dep_de === mid && d.ok && <p className="mt-1 text-xs text-muted-foreground">{d.why}</p>}
                  </div>
                  {!ro && <Button size="sm" variant="outline" onClick={() => setDep(m.id)}>Datos</Button>}
                </Card>
              )
            })}
            {data.members.length <= 1 && <p className="text-sm text-muted-foreground">{ro ? "No hay otros integrantes registrados." : <>Agrega a tu familia en <Link className="underline" href="/perfil">Perfil</Link> para usar dependientes.</>}</p>}
          </div>
          <Card className="gap-2 p-5 shadow-card ring-0">
            <h2 className="font-semibold">¿Cuánto te ahorran?</h2>
            <p className="text-sm">Tienes <b>{C.nD}</b> dependiente{C.nD === 1 ? "" : "s"} válido{C.nD === 1 ? "" : "s"}.</p>
            <div className="flex justify-between border-b py-2 text-sm"><span>10 % de tus ingresos laborales (tope 32 UVT al mes) — dentro del límite del 40 %</span><Money value={C.dep10} /></div>
            <div className="flex justify-between py-2 text-sm"><span>72 UVT por dependiente adicional (hasta 4) — fuera del límite</span><Money value={C.dep72} /></div>
            {C.nD > 0 && <p className="text-xs text-muted-foreground">Elegimos la combinación más conveniente: {C.useA ? "10 % por uno y 72 UVT por los demás" : "72 UVT por cada uno"}.</p>}
          </Card>
        </div>
      )}

      {tab === "deducciones" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="gap-1 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Deducciones y beneficios</h2>
            <p className="text-sm text-muted-foreground">Escribe lo que pagaste en el año según tus certificados.</p>
            {RDK.map(([k, l, h, tope]) => (
              <div key={k} className="grid gap-2 border-b py-3 last:border-0">
                <div><p className="font-medium">{l}</p><p className="text-sm text-muted-foreground">{h}{tope ? ` (${$(tope * U)})` : ""}</p></div>
                {ro ? <Money value={+(tax.ded?.[k as RdkKey] ?? 0)} className="font-medium" /> : <MoneyAutosave value={+(tax.ded?.[k as RdkKey] ?? 0)} onSave={(v) => save({ ded: { ...tax.ded, [k]: v } })} />}
              </div>
            ))}
          </Card>
          <Card className="gap-1 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Cómo quedan aplicadas</h2>
            {([[`Cesantías exentas (${Math.round(C.cesPct * 100)} %)`, C.cesEx], ["Aportes voluntarios y AFC", C.vol], ["Dependientes (10 %)", C.dep10], ["Intereses de vivienda", C.intViv], ["Medicina prepagada", C.prep], ["50 % del 4×1000", C.gmf], ["Intereses ICETEX", C.icetex], ["Renta exenta del 25 %", C.r25]] as [string, number][]).map(([l, v]) => <div key={l} className="flex justify-between border-b py-2 text-sm"><span>{l}</span><Money value={v} /></div>)}
            <div className="flex justify-between py-2 font-medium"><span>Subtotal</span><Money value={C.sub} /></div>
            <div className="flex justify-between py-2 text-sm"><span>Límite (40 % de la renta líquida, máx. 1.340 UVT)</span><Money value={C.lim} /></div>
            {C.recorte > 0 && <Notice tone="warn" title={`Pierdes ${$(C.recorte)} por el límite`} />}
            <div className="flex justify-between py-2 font-semibold"><span>Aplicado</span><Money value={C.apl} /></div>
            <div className="flex justify-between border-t py-2 text-sm"><span>Fuera del límite: dependientes adicionales + 1 % factura electrónica</span><Money value={C.dep72 + C.fe} /></div>
          </Card>
        </div>
      )}

      {tab === "documentos" && <Docs data={data} y={y} docs={tax.docs ?? {}} ro={ro} actions={actions} fileUrl={fileUrl} onToggle={(k, v) => save({ docs: { ...tax.docs, [k]: v } })} />}

      {tab === "borrador" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="gap-1 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Borrador del impuesto</h2><p className="text-sm text-muted-foreground">Cédula general · formulario 210</p>
            {rLines(C).map(([l, v]) => <div key={l} className={cn("flex justify-between border-b py-2 text-sm", l.startsWith("=") && "font-semibold")}><span>{l}</span><Money value={v} /></div>)}
          </Card>
          <Card className="gap-1 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Tabla del artículo 241</h2>
            <p className="text-sm">Tu renta gravable: <b>{new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(C.RLG / U)} UVT</b></p>
            <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Desde (UVT)</th><th className="font-medium">Hasta</th><th className="font-medium">Tarifa</th><th className="font-medium">Más</th></tr></thead>
              <tbody>{TRAMOS241.map(([a, b, t, m]) => { const on = C.RLG / U > a && C.RLG / U <= b || (a === 0 && C.RLG / U <= b); return <tr key={a} className={cn("border-t", on && "bg-brand-soft font-semibold")}><td className="py-1.5">{a}</td><td>{b === Infinity ? "En adelante" : b}</td><td>{t} %</td><td>{m} UVT</td></tr> })}</tbody></table>
          </Card>
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
    <Card className="gap-2 p-5 shadow-card ring-0">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Documentos ({n} de {RDOCS.length})</h2>{!ro && <span className="text-xs text-muted-foreground">Tu contador ve este avance y los archivos que subas.</span>}</div>
      <Progress value={(n / RDOCS.length) * 100} className="h-2" />
      {RDOCS.map(([k, l, h]) => (
        <div key={k} className="grid gap-2 border-b py-3 last:border-0">
          <div className="flex items-start gap-3">
            <Checkbox checked={!!docs[k] || files(k).length > 0} disabled={ro} onCheckedChange={(v) => onToggle(k, v === true)} aria-label={l} className="mt-0.5" />
            <div className="flex-1"><p className="font-medium">{l}</p><p className="text-sm text-muted-foreground">{h}</p></div>
            {!ro && <Button size="sm" variant="ghost" disabled={busy === k} onClick={() => { setTarget(k); input.current?.click() }}>{busy === k ? <Spinner /> : <Upload />} Subir</Button>}
          </div>
          {files(k).map((f) => (
            <div key={f.id} className="ml-7 flex items-center gap-2 text-sm">
              <Paperclip className="size-3.5 text-muted-foreground" />
              <button type="button" className="min-w-0 flex-1 truncate text-left text-link underline" onClick={async () => { const u = await fileUrl(f.path); if (u) window.open(u, "_blank") }}>{f.nombre}</button>
              <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(f.size / 1024))} KB</span>
              {!ro && <Button size="icon-xs" variant="ghost" className="text-danger" aria-label={`Quitar ${f.nombre}`} onClick={() => actions!.delAttachment(f.id)}><Trash2 /></Button>}
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
    </Card>
  )
}

