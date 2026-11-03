// Acciones del chat que no van por streaming (antes el cuerpo de apps/web/features/chat/actions.ts, F2-F): datos para
// las sugerencias, confirmar o cancelar una propuesta, leer un adjunto (foto o PDF), título con IA, duplicar y detalles
// de una conversación. También las lecturas y cambios de hilos que la web hace directo con RLS ("chat propio") y que la
// API expone (listar, mensajes, renombrar, fijar, archivar, borrar). Todo con el cliente de la persona (RLS). Solo servidor.
import { z } from "zod"
import { formatCOP, todayBogota } from "@mirai/domain"
import { can } from "@mirai/domain/household/roles"
import { puedeProponer, registraAlgo, sinPermiso } from "../chat/permisos"
import { TIPO_INFO, destino } from "../chat/propuestas"
import { autoTitle, preview, smartTitle } from "../chat/history"
import { aiText } from "../run"
import { clip } from "../compact"
import { MSG_COLS, PROPUESTA_TIPOS, THREAD_COLS, toMsg, type ChatAdjunto, type ChatHints, type ChatMeta, type ChatMsg, type ChatThread, type Propuesta } from "../chat/types"
import { imageOf, readInvoiceWith, readLoanDocWith, readReceiptWith, type AiFile } from "./ai-actions"
import { chatAi, chatHintsFor } from "./chat-book"
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

const KIND_RE = { prestamo: /extracto|pr[eé]stamo|cr[eé]dito|pagar[eé]|tabla de amortizaci|libranza|deuda/i, comprobante: /comprobante|transferencia|consignaci|nequi|daviplata|pse/i }

/** Tope del adjunto del chat y tipos permitidos (foto o PDF). */
export const CHAT_FILE_MAX = 6 * 1024 * 1024
export const CHAT_FILE_TYPES = /^(image\/(png|jpe?g|webp|gif|heic|heif|avif)|application\/pdf)$/

export type AttachInput = { file: (AiFile & { name: string }) | null; text?: string; threadId?: string | null }
export type AttachResult = { ok: true; threadId: string; titulo: string; nuevo: boolean; user: ChatMsg; answer: ChatMsg } | { ok: false; msg: string }

/** Validación del adjunto antes del límite de tasa (mismo orden que la web). null = sirve. */
export function attachProblem(ctx: Pick<AiCtx, "household">, f: AttachInput["file"]): string | null {
  if (!registraAlgo(ctx.household.access)) return "Tu rol en este hogar es de solo lectura: no puedes registrar documentos."
  if (!f || !f.size) return "Elige una foto o un PDF"
  if (f.size > CHAT_FILE_MAX) return "El archivo pesa más de 6 MB."
  if (!CHAT_FILE_TYPES.test(f.type)) return "Usa una foto (JPG, PNG) o un PDF."
  return null
}

/**
 * Adjunto del chat (foto o PDF), ya validado con attachProblem y el límite `chatAdjunto`. Usa las mismas lecturas de
 * los formularios: factura o recibo → tarjeta para registrar el gasto; comprobante → resumen; extracto o documento de
 * préstamo → resumen con enlace a Le debo.
 */
export async function chatAttachWith(ctx: AiCtx, sb: Sb, input: AttachInput): Promise<AttachResult> {
  const f = input.file!
  const text = String(input.text ?? "").trim().slice(0, 1000)
  let threadId = input.threadId || null
  let titulo = ""
  let nuevo = false
  if (threadId) {
    const { data } = await sb.from("chat_threads").select("id,titulo").eq("id", threadId).is("deleted_at", null).maybeSingle()
    if (!data) threadId = null
    else titulo = data.titulo
  }
  const kind = KIND_RE.prestamo.test(text) ? "prestamo" : KIND_RE.comprobante.test(text) ? "comprobante" : "factura"
  // "Registra sus gastos" lee facturas (sus gastos); los comprobantes y documentos de deudas son de quien planea.
  if (kind !== "factura" && !can(ctx.household.access, "planear")) return { ok: false, msg: "Con tu rol puedes leer facturas y recibos de tus gastos. Los comprobantes y documentos de deudas los registra quien administra el hogar." }
  const label = kind === "prestamo" ? "documento de préstamo" : kind === "comprobante" ? "comprobante" : "factura"
  if (!threadId) {
    titulo = autoTitle(text || `Leer ${label}: ${f.name}`)
    const { data, error } = await sb.from("chat_threads").insert({ book_id: ctx.book.id, user_id: ctx.user.id, titulo }).select("id").single()
    if (error) return { ok: false, msg: error.message }
    threadId = data.id
    nuevo = true
  }
  const adj: ChatAdjunto = { nombre: f.name.slice(0, 80), tipo: f.type, tam: f.size }
  const { data: u, error: ue } = await sb.from("chat_messages").insert({ book_id: ctx.book.id, thread_id: threadId, role: "user", content: text || `Te comparto ${kind === "factura" ? "una factura" : kind === "comprobante" ? "un comprobante" : "un documento de préstamo"}.`, adjuntos: [adj] as never }).select(MSG_COLS).single()
  if (ue) return { ok: false, msg: ue.message }

  const meta: ChatMeta = { fuente: "lectura" }
  let content = ""
  const img = () => imageOf(f)
  const ai = await chatAi(ctx)
  if (!ai.allowed) {
    meta.fuente = "upsell"; meta.aviso = ai.premium ? "apagada" : "plan"
    content = ai.premium ? "Para leer fotos y PDF necesito la inteligencia artificial, que está **apagada** en Ajustes › Inteligencia artificial." : "Leer facturas, recibos y extractos con una foto es parte de **Mirai Premium**. Mientras tanto, escríbeme el gasto, por ejemplo: *Registra un gasto de 45 mil en mercado*."
  } else if (kind === "factura") {
    const r = await readInvoiceWith(ctx, sb, img)
    if (!r.ok) { meta.fuente = "error"; content = r.msg }
    else {
      const { data: cat } = r.category_id ? await sb.from("categories").select("nombre").eq("id", r.category_id).maybeSingle() : { data: null }
      const p: Propuesta = { id: crypto.randomUUID(), tipo: "gasto", estado: "pendiente", datos: { valor: r.valor, descripcion: r.comercio, fecha: r.fecha ?? todayBogota(), category_id: r.category_id, categoria: cat?.nombre ?? null, cat_src: r.category_id ? "ia" : null } }
      meta.propuestas = [p]
      content = `Leí la factura de **${r.comercio}** por **${formatCOP(r.valor)}**${r.fecha ? ` del ${r.fecha}` : ""}. Revisa los datos y toca **Confirmar** para registrar el gasto.`
    }
  } else if (kind === "comprobante") {
    const r = await readReceiptWith(ctx, img)
    content = r.ok ? `Leí el comprobante: ${r.valor ? `**${formatCOP(r.valor)}**` : "no encontré el valor"}${r.fecha ? `, del ${r.fecha}` : ""}${r.referencia ? `, referencia ${r.referencia}` : ""}. Si es un pago de una deuda, regístralo en **Préstamos** desde el detalle de la deuda.` : r.msg
    if (!r.ok) meta.fuente = "error"
  } else {
    const r = await readLoanDocWith(ctx, img, "pagar")
    if (!r.ok) { meta.fuente = "error"; content = r.msg }
    else {
      const d = r.d
      const rows = [
        d.acreedor && `- Entidad: **${d.acreedor}**`, d.monto && `- Monto: **${formatCOP(d.monto)}**`, d.saldo_actual && `- Saldo actual: **${formatCOP(d.saldo_actual)}**`,
        d.valor_cuota && `- Cuota: **${formatCOP(d.valor_cuota)}**${d.plazo_cuotas ? ` (${d.plazo_cuotas} cuotas)` : ""}`, d.tasa_mensual && `- Tasa: ${d.tasa_mensual} % mensual`, d.tasa_ea && `- Tasa: ${d.tasa_ea} % E.A.`,
      ].filter(Boolean)
      content = `Esto encontré en el documento:\n\n${rows.join("\n") || "- No pude leer los datos principales."}\n\nPara llevarle el control, agrégalo en [Le debo](/le-debo?nuevo=1): ahí puedes leer el mismo documento y se llenan los datos solos.`
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
