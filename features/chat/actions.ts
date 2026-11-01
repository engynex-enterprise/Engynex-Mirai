"use server"

import { z } from "zod"
import { requireRole } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { loadBookData } from "@/lib/book-data"
import { aiObject, AiUnavailable } from "@/lib/ai/run"
import { CONS_RE, finCtx, norm, todayBogota } from "@/lib/domain"

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
  const { data: prev } = await sb.from("chat_messages").select("role,content").eq("thread_id", threadId).is("deleted_at", null).order("created_at", { ascending: false }).limit(10)
  const hist = (prev ?? []).reverse().map((m) => `${m.role === "user" ? "Usuario" : "Asesor"}: ${m.content}`).join("\n")
  const isCons = CONS_RE.test(norm(q))
  let answer = "", go: string | null = null
  try {
    const [book, { data: fund }] = await Promise.all([loadBookData(sb, ctx.book.id), sb.from("emergency_funds").select("activo,saldo").eq("book_id", ctx.book.id).maybeSingle()])
    const datos = finCtx({ ...book, fund: fund ? { on: fund.activo, saldo: +fund.saldo } : null }, todayBogota())
    const { object } = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id, schema: Reply,
      prompt: `Eres el asesor financiero de Mirai para una familia colombiana (cifras en pesos COP). ${input.tono === "fin"
        ? "El usuario sabe de finanzas: puedes usar términos técnicos (flujo de caja, DTI, liquidez, TEA, amortización) con precisión."
        : "El usuario NO sabe de finanzas: habla en español sencillo de Colombia, frases cortas, sin tecnicismos (si usas uno, explícalo entre paréntesis)."}
Datos reales del usuario: ${JSON.stringify(datos)}
Conversación:
${hist}
Decide: si el último mensaje describe una decisión concreta de gastar, comprar, endeudarse, sacar tarjeta o crédito, prestar dinero, invertir, abonar o empeñar (algo que quiere evaluar antes de hacerlo), la acción es "consejero". En cualquier otro caso responde tú.
"respuesta": tu respuesta (máx 180 palabras, puedes usar **negritas** y listas con guiones). Si la acción es consejero, una frase corta diciendo que lo vamos a analizar con sus números.`,
    })
    answer = object.respuesta
    if (object.accion === "consejero") go = q
  } catch (e) {
    if (isCons) { answer = "Esto vale la pena analizarlo con tus números. Te llevo al **Consejo antes de gastar** para revisarlo paso a paso."; go = q }
    else if (e instanceof AiUnavailable) answer = `${e.message} Mientras tanto, puedes usar el **Consejo antes de gastar**, que funciona con tus números aunque no haya IA.`
    else answer = "No pude conectarme con la IA en este momento. Intenta de nuevo en un rato o revisa el proveedor en Ajustes › Integraciones."
  }
  await sb.from("chat_messages").insert({ book_id: ctx.book.id, thread_id: threadId, role: "assistant", content: answer, meta: go ? { go } : {} })
  await sb.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId)
  return { threadId, answer, go }
}
