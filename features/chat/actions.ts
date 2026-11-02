"use server"

import { z } from "zod"
import { requireRole } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { loadBookData } from "@/lib/book-data"
import { aiObject, AiUnavailable, logAlgorithm, tokensFor } from "@/lib/ai/run"
import { chatFacts, quickAnswer } from "@/lib/ai/router"
import { chatWindow, clip, toLines, topN } from "@/lib/ai/compact"
import { CONS_RE, norm, todayBogota } from "@/lib/domain"

const Reply = z.object({ accion: z.enum(["consejero", "responder"]), respuesta: z.string() })

/** Envía un mensaje al asesor (chatSend de la v4). Crea la conversación si no existe y guarda ambos mensajes. */
export async function chatSend(input: { threadId: string | null; q: string; tono: "simple" | "fin" }): Promise<{ threadId: string; answer: string; go: string | null }> {
  const ctx = await requireRole("viewer")
  const q = input.q.trim().slice(0, 2000)
  if (!q) throw new Error("Escribe tu pregunta")
  const sb = await supabaseServer()
  let threadId = input.threadId
  if (!threadId) {
    const { data, error } = await sb.from("chat_threads").insert({ book_id: ctx.book.id, user_id: ctx.user.id, titulo: q.slice(0, 48) }).select("id").single()
    if (error) throw new Error(error.message)
    threadId = data.id
  }
  await sb.from("chat_messages").insert({ book_id: ctx.book.id, thread_id: threadId, role: "user", content: q })
  // Ventana: los últimos 6 mensajes completos (recortados) + un resumen de una línea de lo anterior.
  const { data: prev } = await sb.from("chat_messages").select("role,content").eq("thread_id", threadId).is("deleted_at", null).order("created_at", { ascending: false }).limit(30)
  const win = chatWindow((prev ?? []).reverse(), { keep: 6 })
  const isCons = CONS_RE.test(norm(q))
  let answer = "", go: string | null = null
  try {
    const [book, { data: fund }] = await Promise.all([loadBookData(sb, ctx.book.id), sb.from("emergency_funds").select("activo,saldo").eq("book_id", ctx.book.id).maybeSingle()])
    const f = chatFacts({ ...book, fund: fund ? { on: fund.activo, saldo: +fund.saldo } : null }, todayBogota())
    // Contexto compacto: hechos ya calculados, solo las 8 categorías con más gasto y cifras redondeadas.
    const datos = toLines({
      mes: f.mes, ingreso_mensual: f.ingreso_mensual, gasto_mes_hasta_hoy: f.gasto_mes, gasto_mes_anterior: f.gasto_mes_anterior,
      gasto_por_categoria_mes: topN(f.por_categoria, 8), gastos_fijos_mes: f.gastos_fijos_mes, cuotas_deudas_mes: f.cuotas_deudas_mes,
      suscripciones_mes: f.suscripciones_mes, hormiga_mes: f.hormiga_mes, disponible: f.disponible, fondo_emergencia: f.fondo_emergencia,
      deudas: f.deudas.slice(0, 6).map((d) => ({ nombre: clip(d.nombre, 30), saldo: d.saldo })), te_deben: f.te_deben,
      metas: f.metas.slice(0, 5).map((m) => ({ nombre: clip(m.nombre, 30), objetivo: m.objetivo, ahorrado: m.ahorrado })),
    })
    const prompt = `DATOS:\n${datos}\n\n${win.resumen ? `ANTES PREGUNTÓ: ${win.resumen}\n\n` : ""}CONVERSACIÓN:\n${win.text}`
    // Preguntas de datos ("¿cuánto gasté en mercado?") se responden con los números, sin IA.
    const quick = isCons ? null : quickAnswer(q, f)
    if (quick) {
      answer = quick
      await logAlgorithm({ householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "chat", evitados: tokensFor("chat", prompt) })
    } else {
      const { object } = await aiObject({ householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "chat", tono: input.tono, schema: Reply, prompt })
      answer = object.respuesta
      if (object.accion === "consejero") go = q
    }
  } catch (e) {
    if (isCons) { answer = "Esto vale la pena analizarlo con tus números. Te llevo al **Consejo antes de gastar** para revisarlo paso a paso."; go = q }
    else if (e instanceof AiUnavailable) answer = `${e.message} Mientras tanto, puedes usar el **Consejo antes de gastar**, que funciona con tus números aunque no haya IA.`
    else answer = "No pude conectarme con la IA en este momento. Intenta de nuevo en un rato o revisa el proveedor en Ajustes › Inteligencia artificial."
  }
  await sb.from("chat_messages").insert({ book_id: ctx.book.id, thread_id: threadId, role: "assistant", content: answer, meta: go ? { go } : {} })
  await sb.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId)
  return { threadId, answer, go }
}
