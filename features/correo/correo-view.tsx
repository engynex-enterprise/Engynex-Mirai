"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw, Search, Unplug } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Combobox } from "@/components/mirai/combobox"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { Money } from "@/components/mirai/money"
import { Notice } from "@/components/mirai/notice"
import { PageHeader } from "@/components/mirai/page-header"
import { StatusPill } from "@/components/mirai/status-pill"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { SubmitButton } from "@/components/mirai/submit-button"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { invalidateBook, useList } from "@/hooks/use-book-data"
import { localCat, localHormiga } from "@/lib/domain"
import { fmtDate } from "@/lib/format"
import { categoryOptions, useCategories, useKeywordRules, useSettings } from "@/features/catalogs/hooks"
import { classifyBatch } from "@/features/expenses/use-ai-category"
import { googleDisconnect, scanMail, type MailRow } from "./actions"
import { MAILQ_DEFAULT } from "./query"

type Row = MailRow & { incl: boolean; category_id: string | null; hormiga: boolean; src: "ia" | "regla" | null; manual?: boolean }

export function CorreoView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const params = useSearchParams()
  const { data: cats = [] } = useCategories()
  const { data: rules = [] } = useKeywordRules()
  const { data: history = [] } = useList("expenses")
  const { data: cfg } = useSettings()
  const [q, setQ] = useState(MAILQ_DEFAULT)
  const [state, setState] = useState<"idle" | "buscando" | "vacio" | "error" | "ok">("idle")
  const [msg, setMsg] = useState("")
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const { data: conn, isPending } = useQuery({ queryKey: ["google-conn"], queryFn: async () => (await createClient().from("google_connections_public").select("email,scopes").maybeSingle()).data })
  const gmail = !!conn?.scopes?.some((s) => s.includes("gmail"))

  useEffect(() => {
    const g = params.get("google")
    if (g === "ok") toast.success("Google conectado")
    else if (g === "error") toast.error("No pudimos conectar con Google", { description: "Intenta de nuevo. Si sigue fallando, revisa que la dirección de retorno esté autorizada en Google Cloud." })
    else if (g === "cancelado") toast("Conexión cancelada")
  }, [params])

  const scan = async () => {
    setState("buscando"); setRows([])
    const r = await scanMail(q)
    if (!r.ok) { setState("error"); setMsg(r.msg ?? ""); return }
    if (!r.rows.length) return setState("vacio")
    const umbral = +(cfg?.umbral ?? 25000)
    const base: Row[] = r.rows.map((x) => { const hit = localCat(x.comercio, { rules, expenses: history, categories: cats }); return { ...x, incl: true, category_id: hit?.category_id ?? null, src: hit?.src === "regla" ? "regla" : null, hormiga: localHormiga({ descripcion: x.comercio, valor: x.valor, category_id: hit?.category_id ?? null }, cats, umbral) } })
    setRows(base); setState("ok")
    // La IA decide siempre la categoría (lo de las reglas va como "categoría probable"), salvo en las filas que la
    // persona ya cambió a mano mientras respondía. Sin IA (apagada o plan Gratis) queda lo local.
    setAiBusy(true)
    const ai = await classifyBatch(base.map((x) => ({ descripcion: x.comercio, valor: x.valor })), history)
    setAiBusy(false)
    if (ai) setRows((rs) => rs.map((x, i) => { const a = ai.find((y) => y.i === i); return a && !x.manual ? { ...x, category_id: a.category_id ?? x.category_id, hormiga: a.hormiga ?? x.hormiga, src: a.category_id ? "ia" : x.src } : x }))
  }
  const save = async () => {
    const sel = rows.filter((r) => r.incl)
    if (!sel.length) return toast("Elige al menos un movimiento")
    setSaving(true)
    const { error } = await createClient().from("expenses").insert(sel.map((r) => ({ book_id: bookId, fecha: r.fecha, descripcion: r.comercio, valor: r.valor, category_id: r.category_id, hormiga: r.hormiga, hormiga_src: "ia" as const, origen: "correo" as const, external_id: `gmail:${r.id}`, cat_src: r.src })))
    setSaving(false)
    if (error) return toast.error("No se pudieron guardar", { description: error.message })
    toast.success(`Registramos ${sel.length} gasto${sel.length === 1 ? "" : "s"} desde tu correo`)
    invalidateBook(qc, bookId, "expenses"); setRows([]); setState("idle")
  }

  return (
    <div className="grid gap-6">
      <PageHeader id="correo" title="Gastos desde el correo" description="Mirai lee las notificaciones de compras de tus bancos en Gmail y te propone registrarlas. Tú revisas y confirmas." />
      {isPending ? <Skeleton className="h-32" /> : !gmail ? (
        <Card className="items-center gap-4 p-8 text-center shadow-card ring-0">
          <span className="relative"><IsoIcon k="correo" size={64} /><span className="absolute -right-3 -bottom-2"><BrandLogo k="gmail" size={32} /></span></span>
          <div><h2 className="text-lg font-semibold">Conecta tu Gmail</h2><p className="max-w-md text-muted-foreground">Solo pedimos permiso de lectura. Mirai busca los correos de compras de tus bancos; no lee nada más ni envía correos.</p></div>
          <Button variant="outline" size="lg" onClick={() => { location.href = "/api/google/connect?s=gmail&back=/correo" }}><BrandLogo k="google" size={20} bare /> Conectar con Google</Button>
          <p className="text-xs text-muted-foreground">Puedes desconectarlo cuando quieras.</p>
        </Card>
      ) : (
        <>
          <Card className="gap-3 p-5 shadow-card ring-0">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill tone="pagado" check>Conectado: {conn?.email}</StatusPill>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={async () => { await googleDisconnect(); qc.invalidateQueries({ queryKey: ["google-conn"] }); toast("Google desconectado") }}><Unplug /> Desconectar</Button>
              <Button onClick={scan} disabled={state === "buscando" || !canEdit}>{state === "buscando" ? <Spinner /> : <RefreshCw />} Buscar compras recientes</Button>
            </div>
            <Collapsible>
              <CollapsibleTrigger asChild><Button variant="link" size="sm" className="px-0"><Search /> Búsqueda avanzada</Button></CollapsibleTrigger>
              <CollapsibleContent className="grid gap-2 pt-2"><Textarea rows={3} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Búsqueda de Gmail" /><p className="text-xs text-muted-foreground">Usa la sintaxis de Gmail. Agrega el remitente exacto de tu banco si no aparece.</p></CollapsibleContent>
            </Collapsible>
          </Card>
          {state === "buscando" && <Card className="gap-3 p-5 shadow-card ring-0"><p className="flex items-center gap-2 font-medium"><Spinner /> Buscando en tu correo…</p><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></Card>}
          {state === "vacio" && <Notice tone="info" title="No encontré correos nuevos de compras">Prueba con la búsqueda avanzada, agregando el remitente exacto de tu banco.</Notice>}
          {state === "error" && <Notice tone="bad" title="Hubo un problema al leer el correo">{msg}</Notice>}
          {state === "ok" && (
            <Card className="gap-3 p-5 shadow-card ring-0">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold">Revisa antes de guardar ({rows.filter((r) => r.incl).length} de {rows.length}){aiBusy && <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground"><Spinner /> Categorizando con IA…</span>}</h2><SubmitButton disabled={!rows.some((r) => r.incl) || !canEdit} loading={saving} onClick={save}>Guardar seleccionados</SubmitButton></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="w-8 py-2" /><th className="font-medium">Fecha</th><th className="font-medium">Comercio</th><th className="font-medium">Categoría</th><th className="text-right font-medium">Valor</th></tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2"><Checkbox checked={r.incl} onCheckedChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, incl: v === true } : x)))} aria-label={`Incluir ${r.comercio}`} /></td>
                    <td className="whitespace-nowrap">{fmtDate(r.fecha)}</td>
                    <td><div className="flex items-center gap-2.5"><EntityLogo name={r.comercio} icon={cats.find((c) => c.id === r.category_id)?.icon ?? "receipt"} seed={r.category_id ?? r.comercio} size={32} /><div className="grid min-w-0"><p className="font-medium">{r.comercio}</p><p className="max-w-64 truncate text-xs text-muted-foreground">{r.asunto}</p>{r.hormiga && <StatusPill tone="porVencer" className="mt-1 h-5 w-fit" hint="Gasto pequeño y frecuente que se puede evitar.">hormiga</StatusPill>}</div></div></td>
                    <td className="min-w-48"><Combobox value={r.category_id ?? ""} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, category_id: v, src: null, manual: true } : x)))} options={categoryOptions(cats)} placeholder="Elige" /></td>
                    <td className="text-right font-medium tabular-nums"><Money value={r.valor} /></td>
                  </tr>
                ))}</tbody>
              </table></div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
