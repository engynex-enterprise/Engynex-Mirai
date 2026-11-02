"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { FileUp, History, Sparkles, Upload } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/mirai/page-header"
import { Combobox } from "@/components/mirai/combobox"
import { FormField } from "@/components/mirai/field"
import { Money } from "@/components/mirai/money"
import { Notice } from "@/components/mirai/notice"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { StatusPill } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useList } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { qk } from "@/lib/supabase/tables"
import { csvExternalIds, detectSubs, localCat, localHormiga, parseCSV, type CsvRow } from "@/lib/domain"
import { fmtDate, todayISO } from "@/lib/format"
import { categoryOptions, memberOptions, useCategories, useKeywordRules, useMembers, usePaymentMethods, useSettings } from "@/features/catalogs/hooks"
import { parsePaySource, paySourceOptions } from "@/features/cards/pay-source"
import { classifyBatch } from "@/features/expenses/use-ai-category"
import { importV4Backup } from "./actions"

/** `ext`: id estable del movimiento (no deja importarlo dos veces). `hManual`: la persona cambió la marca de hormiga. */
type Row = CsvRow & { hormiga: boolean; dup: boolean; manual?: boolean; src?: "ia" | null; ext: string; hManual?: boolean }

/** Extracto de ejemplo (los 8 movimientos de SAMPLE_CSV de la v4) con fechas recientes. */
function sampleCsv() {
  const t = new Date(todayISO() + "T12:00:00")
  const d = (n: number) => { const x = new Date(t.getTime() - n * 864e5); return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}` }
  return ["Fecha;Descripción;Valor", `${d(9)};COMPRA EXITO CALLE 80;-245.300`, `${d(8)};RAPPI*RESTAURANTE;-38.900`, `${d(7)};PAGO NOMINA;4.750.000`, `${d(6)};JUAN VALDEZ CAFE;-9.800`,
    `${d(5)};UBER TRIP;-17.400`, `${d(4)};TERPEL EDS;-160.000`, `${d(3)};CUOTA DE MANEJO;-14.900`, `${d(2)};FARMACIA;-52.000`].join("\n")
}

/** Excel (.xlsx) → texto separado por ';' para el mismo lector de CSV. */
async function xlsxToCsv(file: File) {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  const lines: string[] = []
  ws.eachRow((row) => {
    const cells = (row.values as unknown[]).slice(1).map((v) => {
      if (v instanceof Date) return `${String(v.getUTCDate()).padStart(2, "0")}/${String(v.getUTCMonth() + 1).padStart(2, "0")}/${v.getUTCFullYear()}`
      if (v && typeof v === "object" && "result" in (v as object)) return String((v as { result: unknown }).result ?? "")
      if (v && typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text ?? "")
      return String(v ?? "").replace(/;/g, ",")
    })
    lines.push(cells.join(";"))
  })
  return lines.join("\n")
}

export function ImportView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const router = useRouter()
  const { data: cats = [] } = useCategories()
  const { data: rules = [] } = useKeywordRules()
  const { data: members = [] } = useMembers()
  const { data: cfg } = useSettings()
  const { data: history = [] } = useList("expenses", { order: { column: "created_at" } })
  const { data: extras = [] } = useList("extra_incomes")
  const { data: subs = [] } = useList("subscriptions")
  const { data: methods = [] } = usePaymentMethods()
  const { data: cards = [] } = useList("credit_cards", { order: { column: "created_at" } })
  const [fuente, setFuente] = useState<string>("")
  const [txt, setTxt] = useState("")
  const [rows, setRows] = useState<Row[] | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [quien, setQuien] = useState("familia")
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [v4Pending, startV4] = useTransition()
  const umbral = Number(cfg?.umbral ?? 25000)

  const read = (text: string) => {
    setErr(null)
    const r = parseCSV(text, rules)
    if (r.err !== undefined || !r.rows) { setRows(null); setErr(r.err ?? "No se pudo leer el archivo"); return }
    const key = (f: string, d: string, v: number) => `${f}|${d.toLowerCase().trim()}|${Math.round(v)}`
    const seen = new Set(history.map((g) => key(g.fecha, g.descripcion, Number(g.valor))))
    const ya = new Set([...history.map((g) => g.external_id), ...extras.map((g) => g.external_id)].filter(Boolean))
    const ids = csvExternalIds(r.rows)
    setSkipped(r.skipped ?? 0)
    const base: Row[] = r.rows.map((x, i) => {
      const cat = x.abono ? null : x.category_id ?? localCat(x.descripcion, { rules, expenses: history, categories: cats })?.category_id ?? null
      const dup = ya.has(ids[i]) || (!x.abono && seen.has(key(x.fecha, x.descripcion, x.valor)))
      return { ...x, ext: ids[i], category_id: cat, incl: x.incl && !dup, dup, hormiga: !x.abono && localHormiga({ descripcion: x.descripcion, valor: x.valor, category_id: cat, fixed_expense_id: null } as never, cats, umbral) }
    })
    setRows(base)
    void categorizeAI(base)
  }

  // La IA decide siempre la categoría (lo local va como "categoría probable"); respeta lo que la persona cambió a mano.
  // Sin IA (apagada o plan Gratis) queda la categoría local.
  const run = useRef(0)
  const categorizeAI = async (base: Row[]) => {
    const id = ++run.current
    const todo = base.map((x, i) => ({ x, i })).filter(({ x }) => !x.dup && !x.abono)
    if (!todo.length) return
    setAiBusy(true)
    const ai = await classifyBatch(todo.map(({ x }) => ({ descripcion: x.descripcion, valor: x.valor })), history)
    if (id !== run.current) return
    setAiBusy(false)
    if (!ai) return
    setRows((rs) => rs && rs.map((x, j) => {
      const k = todo.findIndex((t) => t.i === j)
      const a = k >= 0 ? ai.find((y) => y.i === k) : undefined
      return a && !x.manual ? { ...x, category_id: a.category_id ?? x.category_id, hormiga: x.hManual ? x.hormiga : a.hormiga ?? x.hormiga, src: a.category_id ? "ia" : x.src } : x
    }))
  }

  const onFile = async (f: File) => {
    try { const text = /\.xlsx$/i.test(f.name) ? await xlsxToCsv(f) : await f.text(); setTxt(text); read(text) }
    catch { setErr("No se pudo leer el archivo") }
  }

  const sel = useMemo(() => rows?.filter((r) => r.incl) ?? [], [rows])
  const importar = async () => {
    if (!sel.length) return toast.error("Selecciona al menos un movimiento")
    setBusy(true)
    const sb = createClient()
    const src = parsePaySource(fuente)
    const member_id = quien === "familia" ? null : quien
    const otros = cats.find((c) => c.nombre === "Otros")?.id ?? null
    const gastos = sel.filter((r) => !r.abono)
    const entradas = sel.filter((r) => r.abono)
    const errores: string[] = []
    const hsrc = (r: Row) => (r.hManual ? ("manual" as const) : r.src === "ia" ? ("ia" as const) : ("regla" as const))
    if (src.kind === "tarjeta") {
      // Extracto de la tarjeta: cada débito es una compra con tarjeta (y su gasto); cada abono, un pago a la tarjeta.
      const rs = await Promise.all([
        ...gastos.map((r) => sb.rpc("add_card_purchase", { p_card: src.id, p_fecha: r.fecha, p_descripcion: r.descripcion, p_valor: r.valor, p_cuotas: 1, p_category: (r.category_id ?? otros) ?? undefined, p_como_gasto: true, p_external_id: r.ext, p_member: member_id ?? undefined })),
        ...entradas.map((r) => sb.rpc("pay_credit_card", { p_card: src.id, p_valor: r.valor, p_fecha: r.fecha, p_tipo: "otro", p_nota: `Importado: ${r.descripcion}` })),
      ])
      rs.forEach((x) => x.error && errores.push(x.error.message))
    } else {
      if (gastos.length) {
        const { error } = await sb.from("expenses").insert(gastos.map((r) => ({
          book_id: bookId, fecha: r.fecha, descripcion: r.descripcion, valor: r.valor, category_id: r.category_id ?? otros,
          member_id, payment_method_id: src.id, hormiga: r.hormiga, hormiga_src: hsrc(r), origen: "importar" as const, external_id: r.ext,
        })))
        if (error) errores.push(error.message)
      }
      if (entradas.length) {
        const { error } = await sb.from("extra_incomes").insert(entradas.map((r) => ({ book_id: bookId, fecha: r.fecha, descripcion: r.descripcion, valor: r.valor, member_id, payment_method_id: src.id, external_id: r.ext })))
        if (error) errores.push(error.message)
      }
    }
    setBusy(false)
    invalidateBook(qc, bookId, "expenses"); invalidateBook(qc, bookId, "extra_incomes"); invalidateBook(qc, bookId, "credit_cards"); invalidateBook(qc, bookId, "card_purchases")
    if (errores.length) return toast.error("No se pudieron importar todos los movimientos", { description: errores[0] })
    await Promise.all([qc.refetchQueries({ queryKey: qk(bookId, "expenses") }), qc.refetchQueries({ queryKey: qk(bookId, "extra_incomes") })]) // el detector de duplicados usa el historial al día
    const partes = [gastos.length && `${gastos.length} gasto${gastos.length === 1 ? "" : "s"}`, entradas.length && (src.kind === "tarjeta" ? `${entradas.length} pago${entradas.length === 1 ? "" : "s"} a la tarjeta` : `${entradas.length} ingreso${entradas.length === 1 ? "" : "s"} extra`)].filter(Boolean).join(" y ")
    // ¿Quedaron cobros que se repiten cada mes? Son posibles suscripciones.
    const lista = qc.getQueriesData<typeof history>({ queryKey: qk(bookId, "expenses") }).map(([, d]) => d).find((d) => Array.isArray(d) && d.length) ?? history
    const nuevas = detectSubs(lista.map((g) => ({ ...g, valor: Number(g.valor) })), subs)
    toast.success(`Importamos ${partes}`, nuevas.length ? { description: `Encontramos ${nuevas.length} cobro${nuevas.length === 1 ? "" : "s"} que se repite${nuevas.length === 1 ? "" : "n"} cada mes: ¿son suscripciones?`, action: { label: "Revisar", onClick: () => router.push("/suscripciones") } } : undefined)
    setRows(null); setTxt("")
  }

  const set = (i: number, p: Partial<Row>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...p } : r)))

  return (
    <div className="grid gap-6">
      <PageHeader id="importar" description="Descarga el extracto de tu banca en línea en formato CSV o Excel y súbelo aquí. Los débitos se vuelven gastos y se clasifican solos con tus reglas." />
      {!rows ? (
        <Card className="shadow-card ring-0">
          <CardContent className="grid gap-5">
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                <Upload className="size-4" /> Subir archivo
                <input type="file" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
              </label>
              <Button variant="soft" onClick={() => { const s = sampleCsv(); setTxt(s); read(s) }}><Sparkles /> Probar con un extracto de ejemplo</Button>
            </div>
            <FormField label="O pega aquí el contenido" htmlFor="imp-txt" hint="Separador ; o , · fechas dd/mm/aaaa · valores como 1.234.567,89 o -45000">
              <Textarea id="imp-txt" rows={8} className="font-mono text-sm" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={"Fecha;Descripción;Valor\n05/10/2026;COMPRA EXITO;-245.300"} />
            </FormField>
            {err && <Notice tone="bad" title="No se pudo leer el archivo">{err}</Notice>}
            <Button className="w-fit" disabled={!txt.trim()} onClick={() => read(txt)}><FileUp /> Leer movimientos</Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-card ring-0">
          <CardHeader>
            <CardTitle className="text-base">Revisa antes de importar</CardTitle>
            <CardDescription>{sel.length} de {rows.length} seleccionados · {skipped} líneas ignoradas{rows.some((r) => r.dup) && ` · ${rows.filter((r) => r.dup).length} ya estaban registrados (desmarcados)`}{aiBusy && " · categorizando con IA…"}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader><TableRow><TableHead className="w-10"><span className="sr-only">Incluir</span></TableHead><TableHead>Fecha</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="w-64">Categoría</TableHead><TableHead>Hormiga</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i} className={r.incl ? "" : "opacity-55"}>
                      <TableCell><Checkbox checked={r.incl} onCheckedChange={(c) => set(i, { incl: c === true })} aria-label={`Incluir ${r.descripcion}`} /></TableCell>
                      <TableCell>{fmtDate(r.fecha)}</TableCell>
                      <TableCell className="font-medium"><span className="flex items-center gap-2.5"><EntityLogo name={r.descripcion} icon={cats.find((c) => c.id === r.category_id)?.icon ?? "receipt"} seed={r.category_id ?? r.descripcion} size={32} /><span>{r.descripcion}{r.abono && <StatusPill tone="pagado" className="ml-2" hint="Plata que te entró. Si la marcas, queda como ingreso extra (o como pago a la tarjeta, si el extracto es de tu tarjeta).">entrada</StatusPill>}{r.dup && <StatusPill tone="warn" className="ml-2" hint="Ya está registrado (mismo movimiento de este extracto, o un gasto con la misma fecha, descripción y valor). Lo dejamos sin marcar para no duplicarlo.">ya registrado</StatusPill>}</span></span></TableCell>
                      <TableCell className="text-right"><Money value={r.valor} className="font-semibold" /></TableCell>
                      <TableCell>{r.abono ? <span className="text-sm text-muted-foreground">Entrada de plata</span> : <Combobox value={r.category_id} onChange={(v) => set(i, { category_id: v, manual: true, src: null })} options={categoryOptions(cats)} className="h-9" />}</TableCell>
                      <TableCell>{!r.abono && <Checkbox checked={r.hormiga} onCheckedChange={(c) => set(i, { hormiga: c === true, hManual: true })} aria-label={`Hormiga ${r.descripcion}`} />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="grid gap-2 md:hidden">
              {rows.map((r, i) => (
                <li key={i} className={`grid gap-2 rounded-lg border p-3 ${r.incl ? "" : "opacity-55"}`}>
                  <label className="flex items-start gap-3">
                    <Checkbox checked={r.incl} onCheckedChange={(c) => set(i, { incl: c === true })} className="mt-0.5" />
                    <span className="grid flex-1"><b>{r.descripcion}</b><span className="text-xs text-muted-foreground">{fmtDate(r.fecha)}{r.abono && " · entrada de plata"}{r.dup && " · ya registrado"}</span></span>
                    <Money value={r.valor} className="font-bold" />
                  </label>
                  {!r.abono && <Combobox value={r.category_id} onChange={(v) => set(i, { category_id: v, manual: true, src: null })} options={categoryOptions(cats)} className="h-9" />}
                  {!r.abono && <label className="flex items-center gap-2 text-sm"><Checkbox checked={r.hormiga} onCheckedChange={(c) => set(i, { hormiga: c === true, hManual: true })} /> Es gasto hormiga</label>}
                </li>
              ))}
            </ul>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <FormField label="¿De qué cuenta o tarjeta es este extracto?" htmlFor="imp-src" tip="Si es el extracto de tu tarjeta de crédito, elígela: los débitos quedan como compras con tarjeta (sube lo que debes) y los abonos como pagos a la tarjeta. Si es de tu cuenta, los abonos quedan como ingresos extra.">
                <Combobox id="imp-src" value={fuente} onChange={(v) => setFuente(v ?? "")} options={paySourceOptions(methods, cards)} placeholder="Elige (opcional)" />
              </FormField>
              <FormField label="¿De quién son estos gastos?" htmlFor="imp-q"><Combobox id="imp-q" value={quien} onChange={setQuien} options={memberOptions(members)} /></FormField>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setRows(null); setTxt("") }}>Descartar</Button>
                <SubmitButton disabled={!sel.length || !canEdit} loading={busy} loadingText="Importando…" onClick={importar}>Importar seleccionados</SubmitButton>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {canEdit && (
        <Card className="shadow-card ring-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><History className="size-5 text-brand" /> ¿Vienes de la versión anterior de Mirai?</CardTitle>
            <CardDescription>Sube el respaldo JSON que descargaste en Ajustes › Respaldo de la versión 4. Traemos tus ingresos, gastos, gastos fijos, préstamos, metas, inversiones y todo lo demás a este libro.</CardDescription>
          </CardHeader>
          <CardContent>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-hover">
              {v4Pending ? <Spinner /> : <Upload className="size-4" />} Subir respaldo (.json)
              <input type="file" accept=".json,application/json" className="sr-only" disabled={v4Pending} onChange={(e) => {
                const f = e.target.files?.[0]; if (!f) return
                startV4(async () => {
                  try {
                    const rep = await importV4Backup(await f.text())
                    const total = Object.values(rep).reduce((a, b) => a + b, 0)
                    toast.success("Respaldo importado", { description: `${total} registros traídos a este libro.` })
                    qc.clear(); router.refresh()
                  } catch (er) { toast.error("No se pudo importar el respaldo", { description: (er as Error).message }) }
                })
              }} />
            </label>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
