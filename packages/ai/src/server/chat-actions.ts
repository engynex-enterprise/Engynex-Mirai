// Acciones del chat que no van por streaming (antes el cuerpo de apps/web/features/chat/actions.ts, F2-F): datos para
// las sugerencias, confirmar o cancelar una propuesta, leer un adjunto (foto o PDF), título con IA, duplicar y detalles
// de una conversación. También las lecturas y cambios de hilos que la web hace directo con RLS ("chat propio") y que la
// API expone (listar, mensajes, renombrar, fijar, archivar, borrar). Todo con el cliente de la persona (RLS). Solo servidor.
import { z } from "zod"
import { puedeProponer, registraAlgo, sinPermiso } from "../chat/permisos"
import { TIPO_INFO, destino } from "../chat/propuestas"
import { autoTitle, preview, smartTitle } from "../chat/history"
import type { ModelMessage } from "ai"
import { aiStream, aiText, AiUnavailable, filePart } from "../run"
import { aiSettings } from "../model"
import { chatTools } from "../chat/tools"
import { clip } from "../compact"
import { MSG_COLS, PROPUESTA_TIPOS, THREAD_COLS, toMsg, type ChatAdjunto, type ChatHints, type ChatMeta, type ChatMsg, type ChatThread, type Propuesta } from "../chat/types"
import type { AiFile } from "./ai-actions"
import { categorizer, chatAi, chatHintsFor, loadChatBook } from "./chat-book"
import { escribir } from "./confirm"
import { whoOf, type AiCtx, type Sb } from "./ctx"

const Ids = z.object({ messageId: z.uuid(), propId: z.uuid() })

/** Nombre, rol, banderas del libro y estado de la IA (créditos) para la pantalla del chat. */
export const chatHintsWith = (ctx: AiCtx, sb: Sb): Promise<ChatHints> => chatHintsFor(ctx, sb)

export type ConfirmResult = { ok: true; msg: string; href: string; tablas: string[]; propuesta: Propuesta } | { ok: false; msg: string }

async function loadProp(sb: Sb, messageId: string, propId: string) {
  if (!Ids.safeParse({ messageId, propId }).success) return { meta: {} as ChatMeta, p: undefined }
  const { data } = await sb.from("chat_messages").select("id,meta").eq("id", messageId).maybeSingle()
  const meta = (data?.meta ?? {}) as ChatMeta
  const p = meta.propuestas?.find((x) => x.id === propId)
  return { meta, p }
}

/**
 * Confirma una propuesta del chat: recién aquí se escribe en el libro. El permiso depende del tipo (lib/chat/permisos.ts:
 * "Registra sus gastos" confirma gastos e ingresos; Colabora y superiores, todo) y la escritura valida y recalcula los
 * datos con el libro de hoy (server/confirm.ts). `write` permite cambiar la escritura (la API usa su puerto).
 */
export async function chatConfirmWith(ctx: AiCtx, sb: Sb, messageId: string, propId: string, write: (p: Propuesta) => ReturnType<typeof escribir> = (p) => escribir(ctx, sb, p)): Promise<ConfirmResult> {
  const { meta, p } = await loadProp(sb, messageId, propId)
  if (!p || !(PROPUESTA_TIPOS as readonly string[]).includes(p.tipo)) return { ok: false, msg: "No encontramos esta propuesta. Pídela de nuevo en el chat." }
  const T = TIPO_INFO[p.tipo]
  const dest = destino(p.tipo, p.datos?.kind)
  if (p.estado === "hecho") return { ok: true, msg: T.ok, href: dest.href, tablas: T.tablas, propuesta: p }
  if (p.estado === "cancelado") return { ok: false, msg: "Esta propuesta ya se canceló." }
  if (!puedeProponer(ctx.household.access, p.tipo)) return { ok: false, msg: sinPermiso(ctx.household.access, p.tipo).replace(/\*\*/g, "") }
  const r = await write(p)
  if (!r.ok) return r
  const done: Propuesta = { ...p, estado: "hecho", registroId: r.id, datos: { ...p.datos, ...r.datos } }
  await sb.from("chat_messages").update({ meta: { ...meta, propuestas: meta.propuestas!.map((x) => (x.id === p.id ? done : x)) } as never }).eq("id", messageId)
  return { ok: true, msg: T.ok, href: dest.href, tablas: T.tablas, propuesta: done }
}

/** Cancela una propuesta (no escribe nada en el libro). */
export async function chatCancelWith(sb: Sb, messageId: string, propId: string): Promise<{ ok: boolean; propuesta?: Propuesta }> {
  const { meta, p } = await loadProp(sb, messageId, propId)
  if (!p || p.estado !== "pendiente") return { ok: false }
  const done: Propuesta = { ...p, estado: "cancelado" }
  await sb.from("chat_messages").update({ meta: { ...meta, propuestas: meta.propuestas!.map((x) => (x.id === p.id ? done : x)) } as never }).eq("id", messageId)
  return { ok: true, propuesta: done }
}

/** Tope de cada adjunto del chat, del total y cuántos van juntos. */
export const CHAT_FILE_MAX = 6 * 1024 * 1024
export const CHAT_FILES_TOTAL = 6 * 1024 * 1024
export const CHAT_FILES_N = 5
/**
 * Tipos que lee el chat: fotos, PDF y texto. Word, Excel y CSV los convierte a texto el navegador antes de enviarlos
 * (features/chat/files.ts), así el servidor no abre documentos de Office.
 */
export const CHAT_FILE_TYPES = /^(image\/(png|jpe?g|webp|gif|heic|heif|avif)|application\/pdf|text\/(plain|csv|markdown|tab-separated-values))$/
const esTexto = (t: string) => t.startsWith("text/")
/** Máximo de caracteres de un documento de texto que se le pasa a la IA. */
const TEXTO_MAX = 60_000

export type AttachFile = AiFile & { name: string }
export type AttachInput = { files: AttachFile[]; text?: string; threadId?: string | null; tono?: "simple" | "fin" }
export type AttachResult = { ok: true; threadId: string; titulo: string; nuevo: boolean; user: ChatMsg; answer: ChatMsg } | { ok: false; msg: string }

/** Validación de los adjuntos antes del límite de tasa (mismo orden que la web). null = sirven. */
export function attachProblem(ctx: Pick<AiCtx, "household">, files: (AttachFile | null | undefined)[] | null): string | null {
  if (!registraAlgo(ctx.household.access)) return "Tu rol en este hogar es de solo lectura: no puedes registrar documentos."
  const list = (files ?? []).filter(Boolean) as AttachFile[]
  if (!list.length || list.some((f) => !f.size)) return "Elige una foto, un PDF o un documento."
  if (list.length > CHAT_FILES_N) return `Envía hasta ${CHAT_FILES_N} archivos a la vez.`
  if (list.some((f) => f.size > CHAT_FILE_MAX)) return "Cada archivo puede pesar hasta 6 MB."
  if (list.reduce((a, f) => a + f.size, 0) > CHAT_FILES_TOTAL) return "Entre todos los archivos pasan de 6 MB. Envía menos a la vez."
  if (list.some((f) => !CHAT_FILE_TYPES.test(f.type))) return "Usa fotos (JPG, PNG), PDF, Word, Excel o CSV."
  return null
}

/** Texto de un documento (base64 → UTF-8), recortado. */
const textoDe = (f: AttachFile) => Buffer.from(f.data, "base64").toString("utf8").slice(0, TEXTO_MAX)

/** Lo que se le pide a la IA cuando la persona solo adjunta, sin escribir nada. */
const PEDIDO = "Lee lo que te comparto, identifica cada movimiento y a qué tipo de registro corresponde (gasto del día a día, pago de un gasto fijo, cobro de una suscripción, compra con tarjeta, deuda o cuota) y prepárame los registros para confirmar."

/**
 * Adjuntos del chat (fotos, PDF o documentos), ya validados con attachProblem y el límite `chatAdjunto`. La IA los lee
 * con la instrucción de la persona (escrita o dictada) y las MISMAS herramientas del chat: consulta el libro y prepara
 * una tarjeta por cada movimiento en el módulo que corresponde (gasto, pago de un fijo, cobro de suscripción, compra con
 * tarjeta, deuda con pago único, cuota…). Nada se escribe hasta que la persona confirma.
 */
export async function chatAttachWith(ctx: AiCtx, sb: Sb, input: AttachInput): Promise<AttachResult> {
  const files = input.files
  const text = String(input.text ?? "").trim().slice(0, 4000)
  let threadId = input.threadId || null
  let titulo = ""
  let nuevo = false
  if (threadId) {
    const { data } = await sb.from("chat_threads").select("id,titulo").eq("id", threadId).is("deleted_at", null).maybeSingle()
    if (!data) threadId = null
    else titulo = data.titulo
  }
  if (!threadId) {
    titulo = autoTitle(text || `Leer ${files.length > 1 ? `${files.length} documentos` : files[0].name}`)
    const { data, error } = await sb.from("chat_threads").insert({ book_id: ctx.book.id, user_id: ctx.user.id, titulo }).select("id").single()
    if (error) return { ok: false, msg: error.message }
    threadId = data.id
    nuevo = true
  }
  // Historia reciente (antes de guardar este mensaje), para que "lee esto" siga lo que venían hablando.
  const { data: prev } = nuevo ? { data: [] } : await sb.from("chat_messages").select("role,content").eq("thread_id", threadId).is("deleted_at", null).order("created_at", { ascending: false }).limit(6)
  const adjuntos: ChatAdjunto[] = files.map((f) => ({ nombre: f.name.slice(0, 80), tipo: f.type, tam: f.size }))
  const { data: u, error: ue } = await sb.from("chat_messages").insert({ book_id: ctx.book.id, thread_id: threadId, role: "user", content: text || (files.length > 1 ? `Te comparto ${files.length} documentos.` : "Te comparto un documento."), adjuntos: adjuntos as never }).select(MSG_COLS).single()
  if (ue) return { ok: false, msg: ue.message }

  const meta: ChatMeta = { fuente: "ia" }
  let content = ""
  const ai = await chatAi(ctx)
  const ocrOff = ai.allowed && (await aiSettings(ctx.book.id)).ocr === false && files.some((f) => !esTexto(f.type))
  if (!ai.allowed || ocrOff) {
    meta.fuente = "upsell"; meta.aviso = ai.premium ? "apagada" : "plan"
    content = ocrOff ? "La lectura de fotos y PDF está **desactivada** en Ajustes › Inteligencia artificial."
      : ai.premium ? "Para leer fotos, PDF y documentos necesito la inteligencia artificial, que está **apagada** en Ajustes › Inteligencia artificial."
        : "Leer facturas, recibos, extractos y documentos es parte de **Mirai Premium**. Mientras tanto, escríbeme el gasto, por ejemplo: *Registra un gasto de 45 mil en mercado*."
  } else {
    const { book, datos, today, X } = await loadChatBook(sb, ctx.book.id, ctx.household.id)
    const { rules, categorize, creditos } = categorizer(ctx, sb, book, true)
    const propuestas: Propuesta[] = []
    const consultas = new Set<string>()
    const hist = (prev ?? []).reverse().filter((m) => m.content.trim())
    while (hist.length && hist[0].role !== "user") hist.shift()
    const parts: Exclude<ModelMessage["content"], string> = [
      { type: "text", text: `DATOS:\n${datos}` },
      ...files.flatMap((f) => esTexto(f.type)
        ? [{ type: "text" as const, text: `DOCUMENTO «${f.name.slice(0, 80)}»:\n${textoDe(f)}` }]
        : [{ type: "text" as const, text: `ARCHIVO «${f.name.slice(0, 80)}»:` }, filePart({ data: f.data, mediaType: f.type })]),
      { type: "text", text: `PEDIDO DE LA PERSONA: ${text || PEDIDO}` },
    ]
    const messages = [
      ...hist.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: clip(m.content, m.role === "user" ? 600 : 400) }) as ModelMessage),
      { role: "user", content: parts } as ModelMessage,
    ]
    try {
      const r = await aiStream({
        ...whoOf(ctx), feature: "documento", tono: input.tono, messages, maxSteps: 8,
        tools: chatTools({ b: book, today, access: ctx.household.access, rules, X, categorize, onTool: (label) => { consultas.add(label.replace(/^Revisando /, "")) }, onPropuesta: (p) => { propuestas.push(p) } }),
        onDelta: (t) => { content += t }, shown: () => propuestas.length > 0,
      })
      meta.provider = r.provider
      const cr = (r.creditos ?? 0) + creditos()
      if (cr) meta.creditos = Math.round(cr * 100) / 100
    } catch (e) {
      if (!content && !propuestas.length) {
        if (e instanceof AiUnavailable) { meta.fuente = "upsell"; meta.aviso = /créditos/i.test(e.message) ? "creditos" : /plan/i.test(e.message) ? "plan" : "apagada"; content = e.message }
        else { meta.fuente = "error"; content = "No pude leer el documento en este momento. Intenta de nuevo en un rato, con una foto más clara, o escríbeme los datos." }
      }
    }
    if (consultas.size) meta.consultas = [...consultas]
    if (propuestas.length) meta.propuestas = propuestas
    if (!content.trim()) {
      if (propuestas.length) content = `Preparé ${propuestas.length === 1 ? "el registro" : `**${propuestas.length} registros**`}. Revisa los datos y toca **Confirmar**${propuestas.length > 1 ? " en cada uno o **Confirmar todos**" : ""}.`
      else if (meta.fuente === "ia") { meta.fuente = "error"; content = "No logré leer nada en el documento. Prueba con una foto más clara o escríbeme los datos." }
    }
  }
  const { data: a, error: ae } = await sb.from("chat_messages").insert({ book_id: ctx.book.id, thread_id: threadId, role: "assistant", content, meta: meta as never }).select(MSG_COLS).single()
  if (ae) return { ok: false, msg: ae.message }
  await sb.from("chat_threads").update({ updated_at: new Date().toISOString(), ultimo: preview(content) }).eq("id", threadId)
  return { ok: true, threadId: threadId!, titulo, nuevo, user: toMsg(u), answer: toMsg(a) }
}

export type TitleResult = { ok: true; titulo: string; fuente: "ia" | "algoritmo" } | { ok: false; msg: string }

/** Título nuevo para una conversación: con IA (modelo barato) si se puede; si no, con un algoritmo. */
export async function chatTitleWith(ctx: AiCtx, sb: Sb, threadId: string): Promise<TitleResult> {
  const { data: msgs } = await sb.from("chat_messages").select("role,content").eq("thread_id", threadId).is("deleted_at", null).order("created_at").limit(12)
  if (!msgs?.length) return { ok: false, msg: "La conversación está vacía." }
  let titulo = smartTitle(msgs)
  let fuente: "ia" | "algoritmo" = "algoritmo"
  // "Solo mira" no gasta créditos de IA del hogar: su título sale del algoritmo.
  if (registraAlgo(ctx.household.access) && (await chatAi(ctx)).allowed) {
    try {
      const { text } = await aiText({ ...whoOf(ctx), feature: "chat_titulo", prompt: msgs.map((m) => `${m.role === "user" ? "Persona" : "Asesor"}: ${clip(m.content, m.role === "user" ? 200 : 120)}`).join("\n") })
      const t = text.replace(/^["'“«\s]+|["'”»\s.]+$/g, "").replace(/\s+/g, " ").trim()
      if (t.length >= 3 && t.length <= 70) { titulo = t.charAt(0).toUpperCase() + t.slice(1); fuente = "ia" }
    } catch { /* se queda el del algoritmo */ }
  }
  const { error } = await sb.from("chat_threads").update({ titulo, titulo_auto: true }).eq("id", threadId)
  if (error) return { ok: false, msg: error.message }
  return { ok: true, titulo, fuente }
}

/** Copia una conversación con todos sus mensajes ("… (copia)"). */
export async function chatDuplicateWith(ctx: AiCtx, sb: Sb, threadId: string): Promise<{ ok: true; id: string; titulo: string } | { ok: false; msg: string }> {
  const { data: t } = await sb.from("chat_threads").select("titulo,ultimo").eq("id", threadId).is("deleted_at", null).maybeSingle()
  if (!t) return { ok: false, msg: "No encontramos la conversación." }
  const titulo = `${t.titulo} (copia)`.slice(0, 80)
  const { data: n, error } = await sb.from("chat_threads").insert({ book_id: ctx.book.id, user_id: ctx.user.id, titulo, titulo_auto: false, ultimo: t.ultimo }).select("id").single()
  if (error) return { ok: false, msg: error.message }
  const { data: msgs } = await sb.from("chat_messages").select("role,content,meta,adjuntos,created_at").eq("thread_id", threadId).is("deleted_at", null).order("created_at")
  if (msgs?.length) {
    const { error: e2 } = await sb.from("chat_messages").insert(msgs.map((m) => ({ book_id: ctx.book.id, thread_id: n.id, role: m.role, content: m.content, meta: m.meta, adjuntos: m.adjuntos, created_at: m.created_at })))
    if (e2) return { ok: false, msg: e2.message }
  }
  return { ok: true, id: n.id, titulo }
}

export type ThreadInfo = { mensajes: number; preguntas: number; creditos: number; algoritmo: number }

/** Detalles de una conversación: mensajes, preguntas y créditos de IA que costó. */
export async function chatThreadInfoWith(sb: Sb, threadId: string): Promise<ThreadInfo> {
  const { data } = await sb.from("chat_messages").select("role,meta").eq("thread_id", threadId).is("deleted_at", null)
  const rows = data ?? []
  const metas = rows.filter((r) => r.role === "assistant").map((r) => (r.meta ?? {}) as ChatMeta)
  return {
    mensajes: rows.length, preguntas: rows.filter((r) => r.role === "user").length,
    creditos: Math.round(metas.reduce((s, m) => s + (+(m.creditos ?? 0) || 0), 0) * 100) / 100,
    algoritmo: metas.filter((m) => m.fuente === "algoritmo" || (m.fuente === "consejero" && !m.creditos)).length,
  }
}

// ── Hilos (la web los lee y cambia directo con RLS: features/chat/hooks.ts; la API los expone igual) ──

/** Conversaciones del libro de la persona (RLS "chat propio"), de la más reciente a la más antigua. */
export async function listThreadsWith(ctx: Pick<AiCtx, "book" | "user">, sb: Sb, o: { archivados?: boolean; limit?: number } = {}): Promise<ChatThread[]> {
  let q = sb.from("chat_threads").select(THREAD_COLS).eq("book_id", ctx.book.id).eq("user_id", ctx.user.id).is("deleted_at", null)
  if (o.archivados !== undefined) q = q.eq("archivado", o.archivados)
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(Math.min(500, Math.max(1, o.limit ?? 200)))
  if (error) throw error
  return (data ?? []) as ChatThread[]
}

/** Mensajes vivos de una conversación, en orden. null si la conversación no existe (o no es de la persona). */
export async function threadMessagesWith(sb: Sb, threadId: string): Promise<ChatMsg[] | null> {
  const { data: t, error: te } = await sb.from("chat_threads").select("id").eq("id", threadId).is("deleted_at", null).maybeSingle()
  if (te) throw te
  if (!t) return null
  const { data, error } = await sb.from("chat_messages").select(MSG_COLS).eq("thread_id", threadId).is("deleted_at", null).order("created_at")
  if (error) throw error
  return (data ?? []).map(toMsg)
}

export type ThreadPatch = { titulo?: string; fijado?: boolean; archivado?: boolean }

/** Renombrar, fijar o archivar (como features/chat/hooks.ts). false si la conversación no existe. */
export async function patchThreadWith(sb: Sb, threadId: string, p: ThreadPatch): Promise<boolean> {
  const patch: Record<string, unknown> = {}
  if (p.titulo !== undefined) { patch.titulo = p.titulo.trim().slice(0, 80); patch.titulo_auto = false }
  if (p.fijado !== undefined) patch.fijado = p.fijado
  if (p.archivado !== undefined) patch.archivado = p.archivado
  const { data, error } = await sb.from("chat_threads").update(patch as never).eq("id", threadId).is("deleted_at", null).select("id")
  if (error) throw error
  return !!data?.length
}

/** Borrado lógico de una conversación (sus mensajes quedan ocultos con ella). false si no existe. */
export async function deleteThreadWith(sb: Sb, threadId: string): Promise<boolean> {
  const { data, error } = await sb.from("chat_threads").update({ deleted_at: new Date().toISOString() }).eq("id", threadId).is("deleted_at", null).select("id")
  if (error) throw error
  return !!data?.length
}

/** "Deshacer" del borrado (como el toast de la web). false si no estaba borrada o no es de la persona. */
export async function restoreThreadWith(sb: Sb, threadId: string): Promise<boolean> {
  const { data, error } = await sb.from("chat_threads").update({ deleted_at: null }).eq("id", threadId).not("deleted_at", "is", null).select("id")
  if (error) throw error
  return !!data?.length
}
