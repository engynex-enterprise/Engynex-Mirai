"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { FileUp, History, Sparkles, Upload } from "lucide-react"
import { toast } from "sonner"
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
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useList } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { qk } from "@/lib/supabase/tables"
import { localCat, localHormiga, parseCSV, type CsvRow } from "@/lib/domain"
import { fmtDate, todayISO } from "@/lib/format"
import { categoryOptions, memberOptions, useCategories, useKeywordRules, useMembers, useSettings } from "@/features/catalogs/hooks"
import { importV4Backup } from "./actions"

type Row = CsvRow & { hormiga: boolean; dup: boolean }

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
  const [txt, setTxt] = useState("")
  const [rows, setRows] = useState<Row[] | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [quien, setQuien] = useState("familia")
  const [busy, setBusy] = useState(false)
  const [v4Pending, startV4] = useTransition()
  const umbral = Number(cfg?.umbral ?? 25000)

  const read = (text: string) => {
    setErr(null)
    const r = parseCSV(text, rules)
    if (r.err !== undefined || !r.rows) { setRows(null); setErr(r.err ?? "No se pudo leer el archivo"); return }
    const key = (f: string, d: string, v: number) => `${f}|${d.toLowerCase().trim()}|${Math.round(v)}`
    const seen = new Set(history.map((g) => key(g.fecha, g.descripcion, Number(g.valor))))
    setSkipped(r.skipped ?? 0)
    setRows(r.rows.map((x) => {
      const cat = x.category_id ?? localCat(x.descripcion, { rules, expenses: history, categories: cats })?.category_id ?? null
      const dup = seen.has(key(x.fecha, x.descripcion, x.valor))
      return { ...x, category_id: cat, incl: x.incl && !dup, dup, hormiga: localHormiga({ descripcion: x.descripcion, valor: x.valor, category_id: cat, fixed_expense_id: null } as never, cats, umbral) }
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
    const { error } = await createClient().from("expenses").insert(sel.map((r) => ({
      book_id: bookId, fecha: r.fecha, descripcion: r.descripcion, valor: r.valor, category_id: r.category_id ?? cats.find((c) => c.nombre === "Otros")?.id ?? null,
      member_id: quien === "familia" ? null : quien, hormiga: r.hormiga, hormiga_src: "manual" as const, origen: "importar" as const,
    })))
    setBusy(false)
    if (error) return toast.error("No se pudieron importar", { description: error.message })
    invalidateBook(qc, bookId, "expenses")
    await qc.refetchQueries({ queryKey: qk(bookId, "expenses") }) // el detector de duplicados usa el historial al día
    toast.success(`${sel.length} gastos importados`)
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
            <CardDescription>{sel.length} de {rows.length} seleccionados · {skipped} líneas ignoradas{rows.some((r) => r.dup) && ` · ${rows.filter((r) => r.dup).length} ya estaban registrados (desmarcados)`}</CardDescription>
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
                      <TableCell className="font-medium">{r.descripcion}{r.dup && <span className="ml-2 text-xs text-warning">ya registrado</span>}</TableCell>
                      <TableCell className="text-right"><Money value={r.valor} /></TableCell>
                      <TableCell><Combobox value={r.category_id} onChange={(v) => set(i, { category_id: v })} options={categoryOptions(cats)} className="h-9" /></TableCell>
                      <TableCell><Checkbox checked={r.hormiga} onCheckedChange={(c) => set(i, { hormiga: c === true })} aria-label={`Hormiga ${r.descripcion}`} /></TableCell>
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
                    <span className="grid flex-1"><b>{r.descripcion}</b><span className="text-xs text-muted-foreground">{fmtDate(r.fecha)}{r.dup && " · ya registrado"}</span></span>
                    <Money value={r.valor} className="font-bold" />
                  </label>
                  <Combobox value={r.category_id} onChange={(v) => set(i, { category_id: v })} options={categoryOptions(cats)} className="h-9" />
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={r.hormiga} onCheckedChange={(c) => set(i, { hormiga: c === true })} /> Es gasto hormiga</label>
                </li>
              ))}
            </ul>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <FormField label="¿De quién son estos gastos?" htmlFor="imp-q"><Combobox id="imp-q" value={quien} onChange={setQuien} options={memberOptions(members)} /></FormField>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setRows(null); setTxt("") }}>Descartar</Button>
                <Button onClick={importar} disabled={busy || !canEdit}>{busy && <Spinner />} Importar seleccionados</Button>
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
