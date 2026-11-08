"use client"

import { useMemo, useRef, useState } from "react"
import { uploadFile } from "@/lib/files/upload"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { ExternalLink, ImagePlus, Pencil, Phone, Plus, RefreshCw, Reply, Send, Trash2, X } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Combobox } from "@/components/mirai/combobox"
import { FormField } from "@/components/mirai/field"
import { ListToolbar, NoResults, useListControls, type ListFilter } from "@/components/mirai/list-toolbar"
import { Notice } from "@/components/mirai/notice"
import { Panel } from "@/components/mirai/panel"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { IconButton } from "@/components/mirai/tip"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { cn } from "@/lib/utils"
import { autoMap, buildTemplateMessage, caseConfig, esPlantillaDeMeta, isNamed, pickTemplate, sampleValues, templateSlots, WA_CASES, WA_VARS, type MetaTemplate, type ParamPreview, type WaCase, type WaCaseCfg, type WaMap, type WaSettings } from "@/lib/notify/whatsapp"
import { bodyVarCount, canEdit, draftComponents, emptyDraft, isDynamicUrl, metaToDraft, REJECT_REASON, STATUS_LABEL, validateDraft, WA_CATEGORIES, WA_LANGS, type DraftButton, type TemplateDraft } from "@/lib/notify/wa-templates"
import { adminTestDefaults } from "./api"
import { useAsk, useDialogTarget } from "./ui"
import { adminWaDeleteTemplate, adminWaPreview, adminWaSaveSettings, adminWaSaveTemplate, adminWaSendTest, adminWaState, type WaState } from "./api"

const QK = ["admin", "wa"] as const
const CAT_N: Record<string, string> = { UTILITY: "Utilidad", MARKETING: "Marketing", AUTHENTICATION: "Autenticación" }

// ── Subir imagen (bucket público `public-assets`, carpeta whatsapp/, por la API) ────────────────────────────────

async function uploadImage(f: File) {
  if (!["image/png", "image/jpeg"].includes(f.type)) throw new Error("La imagen debe ser JPG o PNG.")
  if (f.size > 5 * 1024 * 1024) throw new Error("La imagen pesa más de 5 MB.")
  const r = await uploadFile({ bucket: "public-assets", body: f, name: f.name, folder: "whatsapp" })
  if (!r.publicUrl) throw new Error("No se pudo obtener la dirección de la imagen.")
  return r.publicUrl
}

/** Escoger la imagen del encabezado: subir una, usar la de marca o dejar la por defecto. */
function ImagePicker({ value, onChange, fallback, fallbackLabel, id }: { value: string; onChange: (url: string) => void; fallback: string; fallbackLabel: string; id: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const shown = value || fallback
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {shown ? <img src={shown} alt="Imagen del encabezado" className="h-16 w-[120px] rounded-md object-cover ring-1 ring-border" /> : <span className="grid h-16 w-[120px] place-items-center rounded-md bg-muted text-xs text-muted-foreground">Sin imagen</span>}
      <div className="grid gap-1">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()}>{busy ? <Spinner /> : <ImagePlus />} {value ? "Cambiar" : "Subir imagen"}</Button>
          {value && <Button size="sm" variant="ghost" onClick={() => onChange("")}><X /> Quitar</Button>}
        </div>
        <span className="text-xs text-muted-foreground">{value ? "Imagen propia" : fallbackLabel} · JPG o PNG hasta 5 MB, ideal 1125 × 600</span>
      </div>
      <input ref={ref} id={id} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Imagen del encabezado" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ""
        if (!f) return
        setBusy(true)
        try { onChange(await uploadImage(f)); toast.success("Imagen subida") } catch (err) { toast.error("No se pudo subir", { description: (err as Error).message }) } finally { setBusy(false) }
      }} />
    </div>
  )
}

// ── Vista previa tipo burbuja de WhatsApp ───────────────────────────────────────────────────────────────────────

/** Reemplaza {{n}} por el valor (en negrita) o por el ejemplo. */
function fill(text: string, values: Record<string, string>, prefix: string) {
  const parts = String(text ?? "").split(/(\{\{\s*\w+\s*\}\})/g)
  return parts.map((p, i) => {
    const m = p.match(/^\{\{\s*(\w+)\s*\}\}$/)
    if (!m) return <span key={i}>{p}</span>
    const v = values[`${prefix}.${m[1]}`]
    return <b key={i} className={cn(!v && "text-sky-700 dark:text-sky-300")}>{v || p}</b>
  })
}

export function WaBubble({ tpl, values = {}, image, className }: { tpl: MetaTemplate; values?: Record<string, string>; image?: string; className?: string }) {
  const c = (t: string) => (tpl.components ?? []).find((x) => x.type?.toUpperCase() === t)
  const h = c("HEADER"), body = c("BODY"), foot = c("FOOTER"), btns = c("BUTTONS")?.buttons ?? []
  const hf = (h?.format ?? "TEXT").toUpperCase()
  const img = image || h?.example?.header_handle?.[0]
  return (
    <div className={cn("rounded-xl bg-[#efeae2] p-3 dark:bg-[#0b141a]", className)}>
      <div className="max-w-[340px] overflow-hidden rounded-lg rounded-tl-none bg-white text-[13.5px] text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
        {h && hf === "IMAGE" && (img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt="" className="aspect-[1.91/1] w-full object-cover p-1 pb-0" />
          : <div className="m-1 grid aspect-[1.91/1] place-items-center rounded bg-black/10 text-xs">Imagen</div>)}
        {h && ["VIDEO", "DOCUMENT", "LOCATION"].includes(hf) && <div className="m-1 grid aspect-[1.91/1] place-items-center rounded bg-black/10 text-xs">{hf === "VIDEO" ? "Video" : hf === "DOCUMENT" ? "Documento" : "Ubicación"}</div>}
        <div className="grid gap-1 px-2.5 pt-1.5 pb-1">
          {h && hf === "TEXT" && <p className="font-bold">{fill(h.text ?? "", values, "header")}</p>}
          <p className="whitespace-pre-wrap break-words">{fill(body?.text ?? "", values, "body")}</p>
          {foot?.text && <p className="text-[12px] text-[#667781] dark:text-[#8696a0]">{foot.text}</p>}
          <p className="text-right text-[11px] text-[#667781] dark:text-[#8696a0]">7:00 a. m.</p>
        </div>
        {btns.map((b, i) => (
          <div key={i} className="flex items-center justify-center gap-1.5 border-t border-black/10 py-2 text-[13.5px] font-medium text-[#027eb5] dark:border-white/10 dark:text-[#53bdeb]">
            {b.type?.toUpperCase() === "URL" ? <ExternalLink className="size-3.5" /> : b.type?.toUpperCase() === "PHONE_NUMBER" ? <Phone className="size-3.5" /> : <Reply className="size-3.5" />}{b.text}
          </div>
        ))}
      </div>
    </div>
  )
}

const statusPill = (t: MetaTemplate) => {
  const s = STATUS_LABEL[String(t.status ?? "").toUpperCase()] ?? { label: t.status ?? "—", tone: "gray" as const }
  return <StatusPill tone={s.tone}>{s.label}</StatusPill>
}
const tplKey = (t: MetaTemplate) => `${t.name}|${t.language}`

// ── Editor de plantillas (crear / editar) ──────────────────────────────────────────────────────────────────────

function TemplateDialog({ initial, edit, state, open, onOpenChange }: { initial: TemplateDraft; edit?: MetaTemplate; state: WaState; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [d, setD] = useState<TemplateDraft>(initial)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof TemplateDraft>(k: K, v: TemplateDraft[K]) => setD((x) => ({ ...x, [k]: v }))
  const check = useMemo(() => validateDraft(d, { editing: !!edit }), [d, edit])
  const n = bodyVarCount(d.body)
  const preview: MetaTemplate = useMemo(() => { try { return { name: d.name, language: d.language, components: draftComponents(d, "vista") } as MetaTemplate } catch { return { name: d.name, language: d.language, components: [] } } }, [d])
  const values = Object.fromEntries([...d.examples.map((x, i) => [`body.${i + 1}`, x]), ...(d.header.type === "text" && d.header.example ? [["header.1", d.header.example]] : [])])
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const addVar = () => {
    const el = bodyRef.current, tag = `{{${n + 1}}}`
    const at = el?.selectionStart ?? d.body.length
    set("body", `${d.body.slice(0, at)}${tag}${d.body.slice(at)}`)
  }
  const setBtn = (i: number, b: DraftButton) => set("buttons", d.buttons.map((x, j) => (j === i ? b : x)))
  const save = async () => {
    setBusy(true)
    const r = await adminWaSaveTemplate(d, edit ? { id: edit.id!, status: edit.status } : undefined).catch((e) => ({ ok: false, msg: (e as Error).message }))
    setBusy(false)
    toast[r.ok ? "success" : "error"](r.ok ? (edit ? "Cambios enviados a Meta" : "Plantilla enviada a Meta") : "Meta no la aceptó", { description: r.msg, duration: 15000 })
    if (r.ok) { qc.invalidateQueries({ queryKey: QK }); onOpenChange(false) }
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} wide="xl" title={edit ? `Editar ${edit.name} (${edit.language})` : "Nueva plantilla de WhatsApp"}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={check.errors.length > 0} loading={busy} loadingText="Enviando a Meta…" hint={check.errors[0] ?? "Revisa la plantilla"} onClick={save}><Send /> {edit ? "Enviar cambios a Meta" : "Crear y enviar a Meta"}</SubmitButton></>}
      description={edit ? "Meta vuelve a revisar la plantilla después de editarla. El nombre y el idioma no se pueden cambiar." : "Se crea en tu cuenta de WhatsApp Business y Meta la revisa (de minutos a 24 horas). Después la puedes asignar a un caso."}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nombre" htmlFor="wt-n" required tip="Solo minúsculas sin tildes, números y guiones bajos. Por ejemplo mirai_pago_proximo." hint={!edit ? "minúsculas_y_guiones_bajos" : undefined}>
              <Input id="wt-n" className="h-11" disabled={!!edit} value={d.name} maxLength={512} onChange={(e) => set("name", e.target.value.toLowerCase().replace(/\s+/g, "_"))} placeholder="mirai_pago_proximo" />
            </FormField>
            <FormField label="Idioma" htmlFor="wt-l" tip={false}><Combobox id="wt-l" value={d.language} onChange={(x) => !edit && set("language", x)} options={WA_LANGS} /></FormField>
          </div>
          <FormField label="Categoría" tip={false}>
            <ChoiceCards value={d.category} onChange={(x) => set("category", x as TemplateDraft["category"])} items={WA_CATEGORIES.map((c) => ({ value: c.value, label: c.label, desc: c.desc, icon: c.value === "UTILITY" ? "bell-ring" : "megaphone" }))} />
          </FormField>
          <FormField label="Encabezado" tip={false}>
            <Segmented value={d.header.type} onChange={(x) => set("header", x === "none" ? { type: "none" } : x === "text" ? { type: "text", text: "", example: "" } : { type: "image", url: state.defaultImage })} items={[{ value: "none", label: "Sin encabezado" }, { value: "text", label: "Texto" }, { value: "image", label: "Imagen" }]} />
          </FormField>
          {d.header.type === "text" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Texto del encabezado" htmlFor="wt-h" tip="Máximo 60 caracteres, sin emojis. Puede tener una variable {{1}}." hint={`${d.header.text.length}/60`}><Input id="wt-h" className="h-11" maxLength={60} value={d.header.text} onChange={(e) => set("header", { ...d.header, type: "text", text: e.target.value } as TemplateDraft["header"])} /></FormField>
              {/\{\{/.test(d.header.text) && <FormField label="Ejemplo de {{1}}" htmlFor="wt-he" tip={false}><Input id="wt-he" className="h-11" value={(d.header as { example?: string }).example ?? ""} onChange={(e) => set("header", { ...d.header, example: e.target.value } as TemplateDraft["header"])} /></FormField>}
            </div>
          )}
          {d.header.type === "image" && (
            <FormField label="Imagen del encabezado" htmlFor="wt-img" tip="Meta la usa como ejemplo para aprobar la plantilla. Al enviar, Mirai pone la imagen que escojas para cada caso (o la de marca).">
              <ImagePicker id="wt-img" value={d.header.url === state.defaultImage ? "" : d.header.url} onChange={(u) => set("header", { type: "image", url: u || state.defaultImage })} fallback={state.defaultImage} fallbackLabel="Imagen de marca de Mirai" />
            </FormField>
          )}
          <FormField label="Mensaje" htmlFor="wt-b" required tip="Máximo 1.024 caracteres. Las variables {{1}}, {{2}}… se llenan con datos de Mirai al enviar; no pueden ir al inicio ni al final ni pegadas." hint={`${d.body.length}/1024 · ${n} variable${n === 1 ? "" : "s"}`}>
            <Textarea id="wt-b" ref={bodyRef} rows={5} value={d.body} onChange={(e) => set("body", e.target.value)} />
            <Button size="sm" variant="soft" className="w-fit" onClick={addVar}><Plus /> Agregar variable {`{{${n + 1}}}`}</Button>
          </FormField>
          {n > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: n }, (_, i) => (
              <FormField key={i} label={`Ejemplo de {{${i + 1}}}`} htmlFor={`wt-e${i}`} tip={false}><Input id={`wt-e${i}`} className="h-11" value={d.examples[i] ?? ""} onChange={(e) => { const ex = [...d.examples]; ex[i] = e.target.value; set("examples", ex) }} /></FormField>
            ))}</div>
          )}
          <FormField label="Pie (opcional)" htmlFor="wt-f" tip={false} hint={`${d.footer.length}/60`}><Input id="wt-f" className="h-11" maxLength={60} value={d.footer} onChange={(e) => set("footer", e.target.value)} /></FormField>
          <FormField label="Botones (opcional)" tip="Hasta 10: enlaces (máx. 2), llamar (máx. 1) y respuestas rápidas. Un enlace que termina en {{1}} cambia según el aviso (por ejemplo /gastos-fijos).">
            <div className="grid gap-2">
              {d.buttons.map((b, i) => (
                <div key={i} className="grid gap-2 rounded-lg bg-secondary/60 p-3 sm:grid-cols-[120px_1fr_auto] sm:items-start">
                  <StatusPill tone="info" className="w-fit">{b.type === "url" ? "Enlace" : b.type === "phone" ? "Llamar" : "Respuesta rápida"}</StatusPill>
                  <div className="grid gap-2">
                    <Input aria-label="Texto del botón" placeholder="Texto del botón" maxLength={25} value={b.text} onChange={(e) => setBtn(i, { ...b, text: e.target.value })} />
                    {b.type === "url" && <Input aria-label="Enlace" placeholder="https://mirai.engynex.com/{{1}}" value={b.url} onChange={(e) => setBtn(i, { ...b, url: e.target.value })} />}
                    {b.type === "url" && isDynamicUrl(b.url) && <Input aria-label="Ejemplo del final del enlace" placeholder="Ejemplo del final: inicio" value={b.example ?? ""} onChange={(e) => setBtn(i, { ...b, example: e.target.value })} />}
                    {b.type === "phone" && <Input aria-label="Teléfono" placeholder="+57 601 123 4567" value={b.phone} onChange={(e) => setBtn(i, { ...b, phone: e.target.value })} />}
                  </div>
                  <IconButton label={`Quitar el botón ${i + 1}`} icon="trash-2" destructive onClick={() => set("buttons", d.buttons.filter((_, j) => j !== i))} />
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => set("buttons", [...d.buttons, { type: "url", text: "Abrir Mirai", url: `${state.base}/{{1}}`, example: "inicio" }])}><ExternalLink /> Enlace</Button>
                <Button size="sm" variant="outline" onClick={() => set("buttons", [...d.buttons, { type: "quick_reply", text: "" }])}><Reply /> Respuesta rápida</Button>
                <Button size="sm" variant="outline" onClick={() => set("buttons", [...d.buttons, { type: "phone", text: "Llamar", phone: "" }])}><Phone /> Llamar</Button>
              </div>
            </div>
          </FormField>
        </FieldGroup>
        <div className="grid content-start gap-3 lg:sticky lg:top-0">
          <p className="text-sm font-semibold">Vista previa</p>
          <WaBubble tpl={preview} values={values} image={d.header.type === "image" ? d.header.url : undefined} />
          {check.errors.length > 0 && <div className="grid gap-1 rounded-lg bg-danger-soft/60 p-3"><p className="text-xs font-semibold text-danger">Falta para enviarla a Meta:</p><ul className="grid list-disc gap-1 pl-5 text-xs text-danger">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
          {check.warnings.length > 0 && <ul className="grid list-disc gap-1 pl-5 text-xs text-warning">{check.warnings.map((e) => <li key={e}>{e}</li>)}</ul>}
          {!check.errors.length && <p className="text-xs text-success">La plantilla cumple las reglas de Meta. Igual Meta puede rechazarla por el contenido.</p>}
        </div>
      </div>
    </ResponsiveDialog>
  )
}

// ── Pestaña Plantillas ─────────────────────────────────────────────────────────────────────────────────────────

const st = (t: MetaTemplate) => String(t.status ?? "").toUpperCase()
const TPL_FILTERS: ListFilter<MetaTemplate>[] = [
  { value: "todas", label: "Todas", icon: "list" },
  { value: "aprobadas", label: "Aprobadas", icon: "circle-check", match: (t) => st(t) === "APPROVED" },
  { value: "revision", label: "En revisión", icon: "hourglass", match: (t) => ["PENDING", "IN_APPEAL"].includes(st(t)) },
  { value: "problemas", label: "Rechazadas o en pausa", icon: "circle-alert", match: (t) => ["REJECTED", "PAUSED", "DISABLED", "LIMIT_EXCEEDED"].includes(st(t)) },
]

function PlantillasTab({ state, settings, onDefault }: { state: WaState; settings: WaSettings; onDefault: (t: MetaTemplate) => void }) {
  const qc = useQueryClient()
  const ask = useAsk()
  const edit = useDialogTarget<{ draft: TemplateDraft; tpl?: MetaTemplate }>()
  const [del, setDel] = useState<string | null>(null)
  const uses = (t: MetaTemplate) => [settings.template === t.name ? "Por defecto" : null, ...WA_CASES.filter((c) => settings.casos[c.k]?.template === t.name).map((c) => c.n)].filter(Boolean) as string[]
  const c = useListControls(state.templates, { text: (t) => `${t.name} ${t.language} ${CAT_N[String(t.category)] ?? t.category}`, filters: TPL_FILTERS })
  const borrar = async (t: MetaTemplate) => {
    if (!(await ask.confirm({ title: `¿Eliminar la plantilla ${t.name} (${t.language}) en Meta?`, description: "No se puede deshacer y el nombre no se puede reutilizar durante 30 días.", confirmLabel: "Eliminar", destructive: true }))) return
    setDel(tplKey(t))
    const r = await adminWaDeleteTemplate(t.name, t.id).catch((e) => ({ ok: false, msg: (e as Error).message }))
    setDel(null)
    toast[r.ok ? "success" : "error"](r.ok ? "Plantilla eliminada" : "No se pudo eliminar", { description: r.msg, duration: 12000 })
    qc.invalidateQueries({ queryKey: QK })
  }
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{state.templates.length} plantilla{state.templates.length === 1 ? "" : "s"} en la cuenta de WhatsApp Business{state.numero ? ` · número ${state.numero}` : ""}.</p>
        <Button onClick={() => edit.show({ draft: { ...emptyDraft(settings.lang || "es_CO"), header: { type: "image", url: state.defaultImage }, buttons: [{ type: "url", text: "Abrir Mirai", url: `${state.base}/{{1}}`, example: "inicio" }] } })}><Plus /> Nueva plantilla</Button>
      </div>
      <ListToolbar c={c} placeholder="Buscar plantilla" filters={TPL_FILTERS} />
      {!c.rows.length ? <NoResults c={c}>{c.filtered ? "No hay plantillas con esa búsqueda o ese filtro." : "Aún no hay plantillas en la cuenta."}</NoResults> : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {c.rows.map((t) => {
            const reason = t.rejected_reason && t.rejected_reason !== "NONE" ? REJECT_REASON[t.rejected_reason] ?? t.rejected_reason : ""
            const u = uses(t)
            return (
              <Card key={t.id ?? tplKey(t)} className="h-full gap-3 p-5 shadow-card ring-0">
                <div className="flex items-start gap-3">
                  <ToneIcon icon="message-circle" tone={st(t) === "APPROVED" ? "green" : st(t) === "REJECTED" ? "red" : "amber"} />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <p className="truncate font-semibold" title={t.name}>{t.name}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{statusPill(t)}<span>{t.language}</span>·<span>{CAT_N[String(t.category)] ?? t.category}</span>{isNamed(t) && <span>· variables con nombre</span>}{t.quality_score?.score && t.quality_score.score !== "UNKNOWN" && <span>· calidad {t.quality_score.score}</span>}</p>
                  </div>
                </div>
                {reason && <p className="text-xs text-danger">Motivo del rechazo: {reason}</p>}
                {u.length > 0 && <div className="flex flex-wrap gap-1">{u.map((x) => <StatusPill key={x} tone="pagado">{x}</StatusPill>)}</div>}
                <WaBubble tpl={t} values={Object.fromEntries(templateSlots(t).map((x) => [x.key, x.example ?? ""]))} />
                <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
                  {st(t) === "APPROVED" && settings.template !== t.name && <Button size="sm" variant="soft" onClick={() => onDefault(t)}>Usar por defecto</Button>}
                  {canEdit(t.status) && String(t.category).toUpperCase() !== "AUTHENTICATION" && <Button size="sm" variant="outline" onClick={() => edit.show({ draft: metaToDraft(t), tpl: t })}><Pencil /> Editar</Button>}
                  <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" disabled={del === tplKey(t)} onClick={() => borrar(t)}>{del === tplKey(t) ? <Spinner /> : <Trash2 />} Eliminar</Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      {edit.value && <TemplateDialog key={edit.key} initial={edit.value.draft} edit={edit.value.tpl} state={state} open={edit.open} onOpenChange={edit.onOpenChange} />}
      {ask.node}
    </div>
  )
}

// ── Pestaña Casos de envío ─────────────────────────────────────────────────────────────────────────────────────

const VAR_OPTIONS = [...WA_VARS.map((v) => ({ value: v.k, label: v.l, hint: v.ej })), { value: "fijo", label: "Texto fijo…" }]

/** Plantilla, asignación de variables e imagen para un caso (o para la plantilla por defecto). */
function CaseEditor({ caso, cfg, onChange, state, settings, isDefault }: { caso: WaCase; cfg: WaCaseCfg; onChange: (c: WaCaseCfg) => void; state: WaState; settings: WaSettings; isDefault?: boolean }) {
  // Las de ejemplo de Meta ("Integration Test", hello_world) no se ofrecen: le llegarían a la persona en inglés y sin sus datos.
  const approved = state.templates.filter((t) => String(t.status).toUpperCase() === "APPROVED" && !esPlantillaDeMeta(t.name))
  const names = [...new Set(approved.map((t) => t.name))]
  const eff = isDefault ? { template: cfg.template ?? "", lang: cfg.lang ?? "es_CO", map: cfg.map ?? {}, headerImage: cfg.headerImage ?? "" } : caseConfig({ ...settings, casos: { ...settings.casos, [caso]: cfg } }, caso)
  const tpl = eff.template ? pickTemplate(state.templates, eff.template, eff.lang) : null
  const langs = approved.filter((t) => t.name === eff.template).map((t) => ({ value: t.language, label: t.language }))
  const slots = tpl ? templateSlots(tpl) : []
  const auto = tpl ? autoMap(tpl) : {}
  const map = { ...auto, ...eff.map }
  const vals = sampleValues(caso, state.base)
  const media = slots.find((s) => s.key === "header.media")
  const img = eff.headerImage || state.defaultImage
  let built: ParamPreview[] | string | null = null
  if (tpl) { try { built = buildTemplateMessage("573000000000", tpl, vals, { map, media: { link: img } }).preview } catch (e) { built = (e as Error).message } }
  const values = Array.isArray(built) ? Object.fromEntries(built.map((p) => [p.key, p.value])) : {}
  const setMap = (key: string, m: WaMap) => onChange({ ...cfg, ...(isDefault || cfg.template ? {} : { template: eff.template, lang: eff.lang }), map: { ...map, [key]: m } })
  const own = isDefault || !!cfg.template
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Plantilla" htmlFor={`wc-${caso}`} tip={false}>
            <Combobox id={`wc-${caso}`} value={isDefault ? cfg.template ?? "" : cfg.template ?? ""} onChange={(x) => onChange(x ? { ...cfg, template: x, lang: approved.find((t) => t.name === x && t.language === settings.lang)?.language ?? approved.find((t) => t.name === x)?.language, map: {} } : { headerImage: cfg.headerImage })}
              options={[...(isDefault ? [{ value: "", label: "Ninguna (texto libre: solo llega si la persona escribió en las últimas 24 h)" }] : [{ value: "", label: `Usar la por defecto (${settings.template || "texto libre"})` }]), ...names.map((n) => ({ value: n, label: n }))]} placeholder={isDefault ? "Ninguna" : "Usar la por defecto"} />
          </FormField>
          {own && langs.length > 1 && <FormField label="Idioma" htmlFor={`wl-${caso}`} tip={false}><Combobox id={`wl-${caso}`} value={eff.lang} onChange={(x) => onChange({ ...cfg, lang: x })} options={langs} /></FormField>}
        </div>
        {eff.template && !tpl && <p className="text-sm text-danger">La plantilla “{eff.template}” no está aprobada en {eff.lang}. Escoge otra o espera la aprobación.</p>}
        {media && (
          <FormField label={media.label} htmlFor={`wi-${caso}`} tip="Se envía en el encabezado de la plantilla. Debe ser una dirección pública: Mirai la guarda en su almacenamiento público.">
            <ImagePicker id={`wi-${caso}`} value={cfg.headerImage ?? ""} onChange={(u) => onChange({ ...cfg, headerImage: u })} fallback={isDefault ? state.defaultImage : settings.headerImage || state.defaultImage} fallbackLabel={isDefault ? "Imagen de marca de Mirai" : "Imagen por defecto"} />
          </FormField>
        )}
        {slots.filter((s) => s.key !== "header.media").length > 0 && (
          <FormField label="Qué dato va en cada variable" tip="Escoge un dato de Mirai o escribe un texto fijo. Lo que no cambies se asigna solo según el texto de la plantilla.">
            <div className="grid gap-2">{slots.filter((s) => s.key !== "header.media").map((s) => {
              const m = map[s.key] ?? { src: "resumen" }
              return (
                <div key={s.key} className="grid gap-2 rounded-lg bg-secondary/60 p-3 sm:grid-cols-[180px_1fr] sm:items-center">
                  <span className="text-sm font-medium">{s.label}</span>
                  <div className="grid gap-2">
                    <Combobox value={m.src} onChange={(x) => setMap(s.key, x === "fijo" ? { src: "fijo", text: m.src === "fijo" ? m.text : "" } : { src: x as WaMap["src"] } as WaMap)} options={VAR_OPTIONS} />
                    {m.src === "fijo" && <Input aria-label={`Texto fijo para ${s.label}`} value={m.text} maxLength={500} onChange={(e) => setMap(s.key, { src: "fijo", text: e.target.value })} placeholder="Texto que siempre se envía" />}
                  </div>
                </div>
              )
            })}</div>
          </FormField>
        )}
        {!own && <p className="text-xs text-muted-foreground">Usa la plantilla por defecto con los datos de este caso. Escoge una plantilla para cambiar su asignación.</p>}
      </FieldGroup>
      <div className="grid content-start gap-2">
        <p className="text-sm font-semibold">Así se vería</p>
        {tpl ? <WaBubble tpl={tpl} values={values} image={img} /> : <p className="rounded-lg bg-secondary/60 p-3 text-sm text-muted-foreground">{eff.template ? "Sin vista previa." : "Texto libre con el mensaje completo."}</p>}
        {typeof built === "string" && <p className="text-xs text-danger">{built}</p>}
      </div>
    </div>
  )
}

/** "Probar plantilla": muestra los valores que se enviarán (calculados en el servidor) y envía a un número. */
function TestDialog({ caso, cfg, open, onOpenChange }: { caso: WaCase; cfg?: WaCaseCfg; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const { data: defs } = useQuery({ queryKey: ["admin", "test-defaults"], queryFn: () => adminTestDefaults() })
  const { data: pv, isPending } = useQuery({ queryKey: ["admin", "wa-preview", caso, JSON.stringify(cfg ?? {})], queryFn: () => adminWaPreview(caso, cfg) })
  const [to, setTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<ParamPreview[] | null>(null)
  const val = to ?? defs?.whatsapp ?? ""
  const valid = val.replace(/\D/g, "").length >= 10
  const name = caso === "resumen" ? "Plantilla por defecto" : WA_CASES.find((c) => c.k === caso)?.n
  const send = async () => {
    setBusy(true)
    const r = await adminWaSendTest({ caso, to: val, override: cfg }).catch((e) => ({ ok: false, msg: (e as Error).message, preview: undefined }))
    setBusy(false)
    toast[r.ok ? "success" : "error"](r.ok ? "Prueba enviada" : "No se pudo enviar", { description: r.msg, duration: 15000 })
    qc.invalidateQueries({ queryKey: ["admin", "envios"] })
    if (r.ok) setSent(r.preview ?? [])
  }
  const rows = sent ?? (pv?.ok ? pv.preview : null)
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`Probar · ${name}`} description="Envía este caso con datos de ejemplo, con la plantilla y la asignación de la pantalla (aunque no las hayas guardado). Meta cobra el mensaje."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>{sent ? "Cerrar" : "Cancelar"}</Button><SubmitButton disabled={!valid} loading={busy} loadingText="Enviando…" hint="Escribe un celular de 10 dígitos" onClick={send}><Send /> {sent ? "Enviar otra vez" : "Enviar prueba"}</SubmitButton></>}>
      <FieldGroup>
        <div className="grid gap-1.5 rounded-lg bg-secondary/60 p-3 text-sm">
          <p className="font-semibold">Valores que se enviarán{pv?.template ? ` · ${pv.template}` : ""}</p>
          {isPending ? <Skeleton className="h-12" /> : rows ? rows.map((p) => <p key={p.key} className="grid gap-0.5"><span className="text-xs text-muted-foreground">{p.label} · {p.src}</span><span className="break-all">{p.value}</span></p>) : <p className="text-danger">{pv?.msg}</p>}
        </div>
        {sent && <Notice tone="ok" title="Prueba enviada">Revisa el celular. El resultado también queda en Registro de envíos.</Notice>}
        <FormField label="Celular (Colombia)" htmlFor="wt-to" required tip={false}>
          <Input id="wt-to" className="h-11" type="tel" inputMode="numeric" placeholder="315 123 4567" value={val} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function WhatsAppPanel() {
  const qc = useQueryClient()
  const { data: state, isPending, isFetching } = useQuery({ queryKey: QK, queryFn: () => adminWaState() })
  // Cambios sin guardar; sin cambios se muestra lo guardado.
  const [draft, setDraft] = useState<WaSettings | null>(null)
  const s = draft ?? state?.settings
  const dirty = !!draft
  const [saving, setSaving] = useState(false)
  const test = useDialogTarget<{ caso: WaCase; cfg?: WaCaseCfg }>()
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState("plantillas")
  if (isPending || !state || !s) return <div className="grid gap-6"><Skeleton className="h-20 rounded-lg" /><Skeleton className="h-10 w-80" /><div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-80 rounded-lg" />)}</div></div>
  const up = (x: WaSettings) => setDraft(x)
  const setCase = (k: WaCase, c: WaCaseCfg) => up({ ...s, casos: { ...s.casos, [k]: c } })
  const save = async (x = s) => {
    setSaving(true)
    const r = await adminWaSaveSettings(x).catch((e) => ({ ok: false, msg: (e as Error).message }))
    setSaving(false)
    if (!r.ok) return void toast.error("No se pudo guardar", { description: r.msg })
    toast.success("Ajustes de WhatsApp guardados"); await qc.invalidateQueries({ queryKey: QK }); setDraft(null); qc.invalidateQueries({ queryKey: ["admin", "globals"] })
  }
  const refresh = async () => { setRefreshing(true); const r = await adminWaState(true); qc.setQueryData(QK, r); setRefreshing(false); toast[r.ok ? "success" : "error"](r.ok ? "Estado actualizado desde Meta" : "No se pudo leer Meta", { description: r.msg }) }
  const defCfg: WaCaseCfg = { template: s.template, lang: s.lang, map: s.map, headerImage: s.headerImage }
  return (
    <div className="grid gap-6">
      <Notice tone="info" title="Cómo funciona">
        <p>WhatsApp solo deja escribirle primero a una persona con una <b>plantilla aprobada por Meta</b>. Aquí ves las plantillas de tu cuenta, creas nuevas (Meta las revisa) y escoges cuál usa Mirai en cada caso y qué dato va en cada variable.</p>
        <p className="mt-1">El número, el token y el ID de la cuenta se configuran en <Link href="/admin/integraciones" className="font-medium text-link underline">Integraciones globales › WhatsApp</Link>.{!state.activa && " Hoy la integración está apagada: las pruebas funcionan igual."}</p>
      </Notice>
      {!state.ok && <Notice tone="bad" title="No se pudo leer la cuenta de Meta">{state.msg}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={tab} onChange={setTab} items={[{ value: "plantillas", label: "Plantillas", icon: "layers" }, { value: "casos", label: "Casos de envío", icon: "route" }, { value: "ajustes", label: "Ajustes", icon: "settings" }]} />
        <Button variant="outline" disabled={refreshing || isFetching} onClick={refresh}>{refreshing ? <Spinner /> : <RefreshCw />} Refrescar desde Meta</Button>
      </div>
      {dirty && (
        <Notice tone="warn" title="Tienes cambios sin guardar" className="sticky top-2 z-10"
          action={<div className="flex gap-2"><Button variant="ghost" onClick={() => setDraft(null)}>Descartar</Button><SubmitButton loading={saving} onClick={() => save()}>Guardar cambios</SubmitButton></div>}>
          Los casos y ajustes cambian cuando guardes.
        </Notice>
      )}
      {tab === "plantillas" && (state.tieneWaba
        ? <PlantillasTab state={state} settings={s} onDefault={(t) => { const x = { ...s, template: t.name, lang: t.language, map: {} }; setDraft(x); void save(x) }} />
        : <Notice tone="warn" title="Falta el ID de la cuenta de WhatsApp Business">Guárdalo en Integraciones globales › WhatsApp para ver y crear plantillas.</Notice>)}
      {tab === "casos" && (
        <div className="grid gap-4">
          <Panel title="Plantilla por defecto" icon="message-circle" description="La usan todos los casos que no tengan una propia."
            action={<Button size="sm" variant="soft" onClick={() => test.show({ caso: "resumen", cfg: defCfg })}><Send /> Probar</Button>}>
            {esPlantillaDeMeta(s.template) && <Notice tone="bad" title={`“${s.template}” es la plantilla de prueba de Meta`}>Siempre llega el mensaje “Integration Test” y no tu resumen. Escoge una plantilla tuya (por ejemplo mirai_resumen).</Notice>}
            <CaseEditor caso="resumen" isDefault cfg={defCfg} onChange={(c) => up({ ...s, template: c.template ?? "", lang: c.lang || s.lang, map: c.map ?? {}, headerImage: c.headerImage ?? "" })} state={state} settings={s} />
          </Panel>
          {WA_CASES.map((c) => {
            const cfg = s.casos[c.k] ?? {}
            return (
              <Panel key={c.k} icon={c.icon} description={c.d}
                title={<span className="flex flex-wrap items-center gap-2">{c.n}{cfg.template ? <StatusPill tone={esPlantillaDeMeta(cfg.template) ? "vencido" : "pagado"}>{cfg.template}</StatusPill> : <StatusPill tone="gray">Por defecto</StatusPill>}</span>}
                action={<Button size="sm" variant="soft" onClick={() => test.show({ caso: c.k, cfg })}><Send /> Probar</Button>}>
                <CaseEditor caso={c.k} cfg={cfg} onChange={(x) => setCase(c.k, x)} state={state} settings={s} />
              </Panel>
            )
          })}
        </div>
      )}
      {tab === "ajustes" && (
        <Panel title="Ajustes de WhatsApp" icon="settings">
          <FieldGroup>
            <FormField label="Idioma por defecto" htmlFor="wa-lang" tip="Idioma en que Mirai busca la plantilla aprobada (si hay varias traducciones) y con el que se crean las nuevas.">
              <Combobox id="wa-lang" value={s.lang} onChange={(x) => up({ ...s, lang: x })} options={WA_LANGS} />
            </FormField>
            <FormField label="Imagen de encabezado por defecto" htmlFor="wa-img" tip="Para las plantillas con imagen en el encabezado. Cada caso puede tener la suya.">
              <ImagePicker id="wa-img" value={s.headerImage} onChange={(u) => up({ ...s, headerImage: u })} fallback={state.defaultImage} fallbackLabel="Imagen de marca de Mirai" />
            </FormField>
            <FormField label="Dirección de Mirai para enlaces y botones" htmlFor="wa-base" tip="Se usa en el dato “Enlace a Mirai” y en el final de los botones con enlace variable ({{1}}). Vacía = la dirección del sitio." hint={`Ahora: ${state.base}`}>
              <Input id="wa-base" className="h-11" type="url" placeholder="https://mirai.engynex.com" value={s.enlaceBase} onChange={(e) => up({ ...s, enlaceBase: e.target.value.trim() })} />
            </FormField>
          </FieldGroup>
        </Panel>
      )}
      {test.value && <TestDialog key={test.key} caso={test.value.caso} cfg={test.value.cfg} open={test.open} onOpenChange={test.onOpenChange} />}
    </div>
  )
}
