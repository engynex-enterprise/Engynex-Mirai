import { z } from "zod"
import type { ModelMessage } from "ai"
import { getAppContext } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { AiUnavailable, aiStream, logAlgorithm, tokensFor } from "@/lib/ai/run"
import { quickAnswer } from "@/lib/ai/router"
import { clip } from "@/lib/ai/compact"
import { ATIPOS, addDays, formatCOP, iso, toDay, type KeywordRuleIn } from "@/lib/domain"
import { autoTitle, preview } from "@/lib/chat/history"
import { continueDecision, detectDecision, detectQuickAction, preguntaValor } from "@/lib/chat/intent"
import { followUps, rng } from "@/lib/chat/suggestions"
import { decisionView } from "@/lib/chat/decision-view"
import { chatTools, resolveCategory } from "@/lib/chat/tools"
import { MSG_COLS, toMsg, type ChatEvent, type ChatMeta, type Consulta, type Propuesta } from "@/lib/chat/types"
import { analyzeInput, interpretText } from "@/features/advisor/engine"
import { chatAi, loadChatBook } from "@/features/chat/server"

// Chat de Mirai en streaming (burbuja y /consejero). Responde una línea JSON por evento (lib/chat/types.ts › ChatEvent).
// Orden para cada mensaje, del más barato al más caro:
//   1. Decisión ("¿me conviene…?"): consejero con los cálculos de lib/domain (+ concepto de la IA si hay) → tarjeta.
//   2. "Registra un gasto de 15 mil en almuerzo": tarjeta para confirmar (sin IA).
//   3. Preguntas de datos ("¿cuánto gasté este mes?"): quickAnswer, al instante y sin tokens.
//   4. Sin IA en el plan o apagada: aviso amable con lo que sí puede hacer.
//   5. IA en streaming con herramientas de consulta y de propuesta (confirmación antes de escribir).

export const maxDuration = 60

const Body = z.object({
  threadId: z.string().uuid().nullable().optional(),
  text: z.string().max(4000).default(""),
  tono: z.enum(["simple", "fin"]).default("simple"),
  /** Id de la respuesta a regenerar (se borra y se responde de nuevo el último mensaje de la persona). */
  regenerate: z.string().uuid().optional(),
  /** Id del mensaje de la persona que se editó (se borra desde ahí y se envía el texto nuevo). */
  editId: z.string().uuid().optional(),
})

const $ = (v: number) => formatCOP(Math.round(v))

/** Texto de la respuesta a una decisión: primero la respuesta natural (IA o plantillas variadas), luego lo que falta. */
function decisionText(c: Consulta, faltan: string[]) {
  const v = decisionView(c)
  const ask = faltan.length ? `Para afinar el análisis, cuéntame: ${faltan.join(" ")}` : ""
  return [v.intro, ask].filter(Boolean).join("\n\n")
}

export async function POST(req: Request) {
  const ctx = await getAppContext()
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ msg: "Solicitud inválida" }, { status: 400 })
  const body = parsed.data
  const sb = await supabaseServer()
  const canEdit = ctx.household.role !== "viewer"
  const ac = new AbortController()
  req.signal.addEventListener("abort", () => ac.abort())
  const enc = new TextEncoder()
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatEvent) => {
        if (closed) return
        try { controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`)) } catch { closed = true }
      }
      try {
        // ── 1. Conversación (propia por RLS) ──
        let threadId = body.threadId ?? null
        let titulo = ""
        if (threadId) {
          const { data } = await sb.from("chat_threads").select("id,titulo").eq("id", threadId).is("deleted_at", null).maybeSingle()
          if (!data) threadId = null
          else titulo = data.titulo
        }
        const nowIso = () => new Date().toISOString()
        let text = body.text.trim().slice(0, 4000)

        // ── 2. Editar / regenerar: se borra (lógico) desde ese mensaje y se responde de nuevo ──
        if (threadId && (body.editId || body.regenerate)) {
          const { data: target } = await sb.from("chat_messages").select("id,role,created_at").eq("id", (body.editId ?? body.regenerate)!).eq("thread_id", threadId).maybeSingle()
          if (target) {
            await sb.from("chat_messages").update({ deleted_at: nowIso() }).eq("thread_id", threadId).gte("created_at", target.created_at).is("deleted_at", null)
            if (body.regenerate) {
              const { data: lastU } = await sb.from("chat_messages").select("content").eq("thread_id", threadId).eq("role", "user").is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle()
              text = lastU?.content ?? text
            }
          }
        }
        if (!text) { emit({ t: "error", msg: "Escribe tu pregunta" }); return }

        if (!threadId) {
          titulo = autoTitle(text)
          const { data, error } = await sb.from("chat_threads").insert({ book_id: ctx.book.id, user_id: ctx.user.id, titulo }).select("id").single()
          if (error) throw new Error(error.message)
          threadId = data.id
          emit({ t: "thread", id: threadId, titulo, nuevo: true })
        } else emit({ t: "thread", id: threadId, titulo, nuevo: false })

        // La respuesta anterior (para seguir una decisión a la que le faltaban datos).
        const { data: prevA } = await sb.from("chat_messages").select("meta").eq("thread_id", threadId).eq("role", "assistant").is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle()
        const pendiente = ((prevA?.meta ?? {}) as ChatMeta).pendiente

        if (!body.regenerate) {
          const { data: u, error } = await sb.from("chat_messages").insert({ book_id: ctx.book.id, thread_id: threadId, role: "user", content: text }).select(MSG_COLS).single()
          if (error) throw new Error(error.message)
          emit({ t: "user", msg: toMsg(u) })
        }

        // ── 3. Responder ──
        const [cb, ai] = await Promise.all([loadChatBook(sb, ctx.book.id), chatAi(ctx)])
        const { book, facts, flags, datos, today } = cb
        let rulesMemo: KeywordRuleIn[] | null = null
        const rules = async () => (rulesMemo ??= ((await sb.from("keyword_rules").select("keyword,category_id").eq("book_id", ctx.book.id).is("deleted_at", null)).data ?? []) as KeywordRuleIn[])
        let content = ""
        const meta: ChatMeta = {}
        const say = (t: string) => { content += t; emit({ t: "delta", text: t }) }
        const who = { householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id }

        // Si el mensaje nuevo ya es una decisión completa (con su valor), no se mezcla con la anterior.
        const own = detectDecision(text)
        const comb = pendiente && !(own && +(own.input.valor ?? 0)) ? continueDecision(pendiente.txt, text) : null
        const dec = comb ? detectDecision(comb) ?? own : own
        const quick = !dec ? detectQuickAction(text) : null
        const qa = !dec && !quick ? quickAnswer(text, facts) : null

        if (dec) {
          // Consejero sin formulario: la frase → interpretación → análisis con tus números → tarjeta en el chat.
          const txt = comb ?? text
          emit({ t: "tool", label: "Revisando tus números" })
          const it = dec.confiable || !ai.allowed ? { d: dec.input } : await interpretText(ctx, txt, true)
          const d = it.d
          meta.fuente = "consejero"
          if (!+(d.valor ?? 0)) {
            const preguntas = [preguntaValor(d), ...(d.dudas ?? dec.faltan).filter((q) => q !== preguntaValor(d))].slice(0, 3)
            say(`Te ayudo a decidir si **${(ATIPOS[d.tipo]?.l ?? "esto").toLowerCase()}** te conviene con tus números. Me falta un dato:\n\n${preguntas.map((q) => `- ${q}`).join("\n")}`)
            meta.pendiente = { txt }
          } else {
            emit({ t: "tool", label: ai.allowed ? "Analizando con tus números y la IA" : "Analizando con tus números" })
            const c = await analyzeInput(ctx, sb, book, d, txt, ai.allowed)
            meta.decision = c
            if (c.provider) meta.provider = c.provider
            if (c.creditos) meta.creditos = c.creditos
            emit({ t: "card", decision: c })
            const faltan = (d.dudas?.length ? d.dudas : dec.faltan).slice(0, 2)
            say(decisionText(c, faltan))
            if (faltan.length) meta.pendiente = { txt }
          }
        } else if (quick) {
          meta.fuente = "algoritmo"
          if (!canEdit) say("Tu rol en este hogar es **solo lectura**: puedes consultar todo, pero no registrar movimientos. Pídele al dueño del hogar que te dé permiso de edición.")
          else {
            const fecha = quick.cuando === "ayer" ? iso(addDays(toDay(today), -1)) : today
            const cat = quick.tipo === "gasto" ? resolveCategory(book, await rules(), quick.descripcion) : { id: null, nombre: null }
            const p: Propuesta = { id: crypto.randomUUID(), tipo: quick.tipo, estado: "pendiente", datos: { valor: quick.valor, descripcion: quick.descripcion, fecha, category_id: cat.id, categoria: cat.nombre } }
            meta.propuestas = [p]
            emit({ t: "card", propuesta: p })
            say(`Listo, preparé el ${quick.tipo} de **${$(quick.valor)}** (${quick.descripcion}). Revisa los datos y toca **Confirmar** para guardarlo.`)
          }
          await logAlgorithm({ ...who, feature: "frase_libre", evitados: tokensFor("frase_libre", text) })
        } else if (qa) {
          meta.fuente = "algoritmo"
          say(qa)
          await logAlgorithm({ ...who, feature: "chat", evitados: tokensFor("chat", `${datos}\n${text}`) })
        } else if (!ai.allowed) {
          meta.fuente = "upsell"
          meta.aviso = ai.premium ? "apagada" : "plan"
          say(ai.premium
            ? "La inteligencia artificial está **apagada** en este libro. Actívala en **Ajustes › Inteligencia artificial** para conversar conmigo. Mientras tanto te respondo al instante preguntas como *¿cuánto gasté este mes?* y analizo compras con tus números."
            : "Para esta pregunta necesito la **inteligencia artificial**, que es parte de Mirai Premium.\n\nCon tu plan te respondo al instante con tus números, por ejemplo:\n- *¿Cuánto gasté este mes?* o *¿Cuánto debo en total?*\n- *¿Me conviene comprar un celular de 3 millones a 12 cuotas?*\n- *Registra un gasto de 15 mil en almuerzo*")
        } else {
          // ── IA en streaming con herramientas ──
          const { data: rows } = await sb.from("chat_messages").select("role,content").eq("thread_id", threadId).is("deleted_at", null).order("created_at", { ascending: false }).limit(14)
          const hist = (rows ?? []).reverse().filter((m) => m.content.trim())
          const recent = hist.slice(-10)
          while (recent.length && recent[0].role !== "user") recent.shift()
          const older = hist.slice(0, hist.length - recent.length).filter((m) => m.role === "user").map((m) => clip(m.content, 60))
          const messages: ModelMessage[] = recent.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: clip(m.content, m.role === "user" ? 1500 : 900) }) as ModelMessage)
          if (!messages.length) messages.push({ role: "user", content: text })
          messages[0] = { role: "user", content: `DATOS:\n${datos}\n\n${older.length ? `ANTES HABLAMOS DE: ${clip(older.join("; "), 240)}\n\n` : ""}${messages[0].content as string}` }
          const consultas = new Set<string>()
          const propuestas: Propuesta[] = []
          meta.fuente = "ia"
          emit({ t: "tool", label: "Pensando" })
          try {
            const r = await aiStream({
              ...who, feature: "chat", tono: body.tono, messages, abortSignal: ac.signal, maxSteps: 5,
              tools: chatTools({ b: book, today, canEdit, rules, onTool: (label) => { consultas.add(label.replace(/^Revisando /, "")); emit({ t: "tool", label }) }, onPropuesta: (p) => { propuestas.push(p); emit({ t: "card", propuesta: p }) } }),
              onDelta: (t) => say(t), shown: () => propuestas.length > 0,
            })
            meta.provider = r.provider
            if (r.creditos) meta.creditos = r.creditos
          } catch (e) {
            if (!content) {
              if (e instanceof AiUnavailable) { meta.fuente = "upsell"; meta.aviso = /créditos/i.test(e.message) ? "creditos" : /plan/i.test(e.message) ? "plan" : "apagada"; say(e.message) }
              else { meta.fuente = "error"; say("No pude conectarme con la IA en este momento. Intenta de nuevo en un rato o revisa el proveedor en **Ajustes › Inteligencia artificial**.") }
            }
          }
          if (consultas.size) meta.consultas = [...consultas]
          if (propuestas.length) meta.propuestas = propuestas
          if (ac.signal.aborted) meta.detenido = true
          if (!content && propuestas.length) content = "Revisa los datos y toca **Confirmar** para guardarlo."
        }

        // ── 4. Guardar la respuesta y sugerir el siguiente paso ──
        if (!meta.detenido && meta.fuente !== "error") {
          const { data: asked } = await sb.from("chat_messages").select("content").eq("thread_id", threadId).eq("role", "user").is("deleted_at", null).order("created_at", { ascending: false }).limit(6)
          meta.sugerencias = followUps(text, rng(Date.now() % 100000), { flags, month: toDay(today).getMonth() + 1, ia: ai.allowed, canEdit, asked: (asked ?? []).map((a) => a.content) })
        }
        const { data: saved, error } = await sb.from("chat_messages").insert({ book_id: ctx.book.id, thread_id: threadId, role: "assistant", content, meta: meta as never }).select(MSG_COLS).single()
        if (error) throw new Error(error.message)
        await sb.from("chat_threads").update({ updated_at: nowIso(), ultimo: preview(content) }).eq("id", threadId)
        emit({ t: "done", msg: toMsg(saved) })
      } catch (e) {
        emit({ t: "error", msg: (e as Error).message?.slice(0, 200) || "No pudimos responder. Intenta de nuevo." })
      } finally {
        if (!closed) { closed = true; try { controller.close() } catch { /* ya cerrado */ } }
      }
    },
    cancel() { closed = true; ac.abort() },
  })
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } })
}
