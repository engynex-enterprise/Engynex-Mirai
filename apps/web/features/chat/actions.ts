"use server"

import { z } from "zod"
import { getAppContext } from "@/lib/dal"
import { limitError } from "@/lib/security/rate-limit"
import { supabaseServer } from "@/utils/supabase/server"
import { formatCOP, todayBogota } from "@/lib/domain"
import { can } from "@/lib/household/roles"
import { puedeProponer, registraAlgo, sinPermiso } from "@/lib/chat/permisos"
import { TIPO_INFO, destino } from "@/lib/chat/propuestas"
import { autoTitle, preview, smartTitle } from "@/lib/chat/history"
import { aiText } from "@/lib/ai/run"
import { clip } from "@/lib/ai/compact"
import { MSG_COLS, PROPUESTA_TIPOS, toMsg, type ChatAdjunto, type ChatHints, type ChatMeta, type ChatMsg, type Propuesta } from "@/lib/chat/types"
import { readInvoice, readLoanDoc, readReceipt } from "@/features/ai/actions"
import { chatAi, chatHintsFor } from "./server"
import { escribir } from "./confirm"

// Acciones del chat que no van por streaming: datos para las sugerencias, confirmar o cancelar una propuesta y leer un
// adjunto (foto o PDF de una factura, recibo, comprobante o extracto). El streaming está en app/api/chat/route.ts.
// Renombrar, fijar, borrar y calificar se hacen desde el navegador (RLS "chat propio").

/** Nombre, rol, banderas del libro y estado de la IA (créditos) para la pantalla del chat. */
export async function chatHints(): Promise<ChatHints> {
  const ctx = await getAppContext()
  return chatHintsFor(ctx, await supabaseServer())
}

type Res = { ok: true; msg: string; href: string; tablas: string[]; propuesta: Propuesta } | { ok: false; msg: string }

const Ids = z.object({ messageId: z.uuid(), propId: z.uuid() })

async function loadProp(messageId: string, propId: string) {
  const sb = await supabaseServer()
  if (!Ids.safeParse({ messageId, propId }).success) return { sb, meta: {} as ChatMeta, p: undefined }
  const { data } = await sb.from("chat_messages").select("id,meta").eq("id", messageId).maybeSingle()
  const meta = (data?.meta ?? {}) as ChatMeta
  const p = meta.propuestas?.find((x) => x.id === propId)
  return { sb, meta, p }
}

/**
 * Confirma una propuesta del chat: recién aquí se escribe en el libro. El permiso depende del tipo (lib/chat/permisos.ts:
 * "Registra sus gastos" confirma gastos e ingresos; Colabora y superiores, todo) y la escritura valida y recalcula los
 * datos con el libro de hoy (features/chat/confirm.ts).
 */
export async function chatConfirm(messageId: string, propId: string): Promise<Res> {
  const ctx = await getAppContext()
  const { sb, meta, p } = await loadProp(messageId, propId)
  if (!p || !(PROPUESTA_TIPOS as readonly string[]).includes(p.tipo)) return { ok: false, msg: "No encontramos esta propuesta. Pídela de nuevo en el chat." }
  const T = TIPO_INFO[p.tipo]
  const dest = destino(p.tipo, p.datos?.kind)
  if (p.estado === "hecho") return { ok: true, msg: T.ok, href: dest.href, tablas: T.tablas, propuesta: p }
  if (p.estado === "cancelado") return { ok: false, msg: "Esta propuesta ya se canceló." }
  if (!puedeProponer(ctx.household.access, p.tipo)) return { ok: false, msg: sinPermiso(ctx.household.access, p.tipo).replace(/\*\*/g, "") }
  const r = await escribir(ctx, sb, p)
  if (!r.ok) return r
  const done: Propuesta = { ...p, estado: "hecho", registroId: r.id, datos: { ...p.datos, ...r.datos } }
  await sb.from("chat_messages").update({ meta: { ...meta, propuestas: meta.propuestas!.map((x) => (x.id === p.id ? done : x)) } as never }).eq("id", messageId)
  return { ok: true, msg: T.ok, href: dest.href, tablas: T.tablas, propuesta: done }
}

/** Cancela una propuesta (no escribe nada en el libro). */
export async function chatCancel(messageId: string, propId: string): Promise<{ ok: boolean; propuesta?: Propuesta }> {
  await getAppContext()
  const { sb, meta, p } = await loadProp(messageId, propId)
  if (!p || p.estado !== "pendiente") return { ok: false }
  const done: Propuesta = { ...p, estado: "cancelado" }
  await sb.from("chat_messages").update({ meta: { ...meta, propuestas: meta.propuestas!.map((x) => (x.id === p.id ? done : x)) } as never }).eq("id", messageId)
  return { ok: true, propuesta: done }
}

const KIND_RE = { prestamo: /extracto|pr[eé]stamo|cr[eé]dito|pagar[eé]|tabla de amortizaci|libranza|deuda/i, comprobante: /comprobante|transferencia|consignaci|nequi|daviplata|pse/i }

/**
 * Adjunto del chat (foto o PDF). Usa las lecturas que ya existen (features/ai/actions.ts): factura o recibo → tarjeta
 * para registrar el gasto; comprobante → resumen; extracto o documento de préstamo → resumen con enlace a Le debo.
 */
export async function chatAttach(fd: FormData): Promise<{ ok: true; threadId: string; titulo: string; nuevo: boolean; user: ChatMsg; answer: ChatMsg } | { ok: false; msg: string }> {
  const ctx = await getAppContext()
  if (!registraAlgo(ctx.household.access)) return { ok: false, msg: "Tu rol en este hogar es de solo lectura: no puedes registrar documentos." }
  const f = fd.get("file")
  if (!(f instanceof File) || !f.size) return { ok: false, msg: "Elige una foto o un PDF" }
  if (f.size > 6 * 1024 * 1024) return { ok: false, msg: "El archivo pesa más de 6 MB." }
  if (!/^(image\/(png|jpe?g|webp|gif|heic|heif|avif)|application\/pdf)$/.test(f.type)) return { ok: false, msg: "Usa una foto (JPG, PNG) o un PDF." }
  const lim = await limitError("chatAdjunto", ctx.user.id, "Enviaste muchos archivos seguidos")
  if (lim) return { ok: false, msg: lim }
  const sb = await supabaseServer()
  const text = String(fd.get("text") ?? "").trim().slice(0, 1000)
  let threadId = String(fd.get("threadId") ?? "") || null
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
  const ai = await chatAi(ctx)
  if (!ai.allowed) {
    meta.fuente = "upsell"; meta.aviso = ai.premium ? "apagada" : "plan"
    content = ai.premium ? "Para leer fotos y PDF necesito la inteligencia artificial, que está **apagada** en Ajustes › Inteligencia artificial." : "Leer facturas, recibos y extractos con una foto es parte de **Mirai Premium**. Mientras tanto, escríbeme el gasto, por ejemplo: *Registra un gasto de 45 mil en mercado*."
  } else if (kind === "factura") {
    const r = await readInvoice(fd)
    if (!r.ok) { meta.fuente = "error"; content = r.msg }
    else {
      const { data: cat } = r.category_id ? await sb.from("categories").select("nombre").eq("id", r.category_id).maybeSingle() : { data: null }
      const p: Propuesta = { id: crypto.randomUUID(), tipo: "gasto", estado: "pendiente", datos: { valor: r.valor, descripcion: r.comercio, fecha: r.fecha ?? todayBogota(), category_id: r.category_id, categoria: cat?.nombre ?? null, cat_src: r.category_id ? "ia" : null } }
      meta.propuestas = [p]
      content = `Leí la factura de **${r.comercio}** por **${formatCOP(r.valor)}**${r.fecha ? ` del ${r.fecha}` : ""}. Revisa los datos y toca **Confirmar** para registrar el gasto.`
    }
  } else if (kind === "comprobante") {
    const r = await readReceipt(fd)
    content = r.ok ? `Leí el comprobante: ${r.valor ? `**${formatCOP(r.valor)}**` : "no encontré el valor"}${r.fecha ? `, del ${r.fecha}` : ""}${r.referencia ? `, referencia ${r.referencia}` : ""}. Si es un pago de una deuda, regístralo en **Préstamos** desde el detalle de la deuda.` : r.msg
    if (!r.ok) meta.fuente = "error"
  } else {
    const r = await readLoanDoc(fd, "pagar")
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

/** Título nuevo para una conversación: con IA (modelo barato) si se puede; si no, con un algoritmo. */
export async function chatTitle(threadId: string): Promise<{ ok: true; titulo: string; fuente: "ia" | "algoritmo" } | { ok: false; msg: string }> {
  const ctx = await getAppContext()
  const sb = await supabaseServer()
  const { data: msgs } = await sb.from("chat_messages").select("role,content").eq("thread_id", threadId).is("deleted_at", null).order("created_at").limit(12)
  if (!msgs?.length) return { ok: false, msg: "La conversación está vacía." }
  let titulo = smartTitle(msgs)
  let fuente: "ia" | "algoritmo" = "algoritmo"
  // "Solo mira" no gasta créditos de IA del hogar: su título sale del algoritmo.
  if (registraAlgo(ctx.household.access) && (await chatAi(ctx)).allowed) {
    try {
      const { text } = await aiText({ householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "chat_titulo", prompt: msgs.map((m) => `${m.role === "user" ? "Persona" : "Asesor"}: ${clip(m.content, m.role === "user" ? 200 : 120)}`).join("\n") })
      const t = text.replace(/^["'“«\s]+|["'”»\s.]+$/g, "").replace(/\s+/g, " ").trim()
      if (t.length >= 3 && t.length <= 70) { titulo = t.charAt(0).toUpperCase() + t.slice(1); fuente = "ia" }
    } catch { /* se queda el del algoritmo */ }
  }
  const { error } = await sb.from("chat_threads").update({ titulo, titulo_auto: true }).eq("id", threadId)
  if (error) return { ok: false, msg: error.message }
  return { ok: true, titulo, fuente }
}

/** Copia una conversación con todos sus mensajes ("… (copia)"). */
export async function chatDuplicate(threadId: string): Promise<{ ok: true; id: string; titulo: string } | { ok: false; msg: string }> {
  const ctx = await getAppContext()
  const sb = await supabaseServer()
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

/** Detalles de una conversación: mensajes, preguntas y créditos de IA que costó. */
export async function chatThreadInfo(threadId: string): Promise<{ mensajes: number; preguntas: number; creditos: number; algoritmo: number }> {
  await getAppContext()
  const sb = await supabaseServer()
  const { data } = await sb.from("chat_messages").select("role,meta").eq("thread_id", threadId).is("deleted_at", null)
  const rows = data ?? []
  const metas = rows.filter((r) => r.role === "assistant").map((r) => (r.meta ?? {}) as ChatMeta)
  return {
    mensajes: rows.length, preguntas: rows.filter((r) => r.role === "user").length,
    creditos: Math.round(metas.reduce((s, m) => s + (+(m.creditos ?? 0) || 0), 0) * 100) / 100,
    algoritmo: metas.filter((m) => m.fuente === "algoritmo" || (m.fuente === "consejero" && !m.creditos)).length,
  }
}
