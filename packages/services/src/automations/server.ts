// Automatizaciones en el servidor (motor puro en @mirai/domain/automations). Movido de apps/web/lib/automations/server.ts
// (F2-E-4): lo usan la web (runner del navegador y cron) y los trabajos de la API (outbox de automation_events).
import type { Database, Json } from "@mirai/db"
import type { LoadedBook } from "@mirai/domain/book-data"
import { formatCOP } from "@mirai/domain/money"
import { todayBogota } from "@mirai/domain/dates"
import { fijoStatus } from "@mirai/domain/fixed"
import { fijoValor } from "@mirai/domain/reparto"
import type { PlanInfo } from "@mirai/domain/plans"
import { runGraph } from "@mirai/domain/automations/engine"
import { runnable } from "@mirai/domain/automations/limits"
import { parseGraph, triggerOf } from "@mirai/domain/automations/schema"
import { EVENT_TRIGGERS, STATE_TRIGGERS, V2_PENDING_AT, type ActionAdapter, type Refs, type RunResult, type TriggerEvent } from "@mirai/domain/automations/types"
import { horaBogota } from "../notify/digest"
import { planOf } from "../plan"
import { rt, type AiTextInput, type Db } from "../runtime"
import { queuedEventFor, scheduledEvent, stateEvents, type BookExtras, type QueuedEvent } from "./detect"
import { notifyHousehold } from "./notify"
import { avisoDeDisparador } from "./notify-rules"

const supabaseAdmin = () => rt().admin()
const loadBookData = (db: Db, bookId: string) => rt().loadBook(db, bookId)
/** IA del nodo "Consejo de la IA" (la pone cada app en configureServices). */
const aiText = (o: AiTextInput) => {
  const f = rt().aiText
  if (!f) throw new Error("La IA de las automatizaciones todavía no está disponible aquí.")
  return f(o)
}
type AutoRow = Database["public"]["Tables"]["automations"]["Row"]

/** Todo lo que necesita el motor para un libro (con la clave de servicio: el servidor actúa en nombre de la automatización). */
export type BookCtx = { db: Db; bookId: string; householdId: string; book: LoadedBook; extras: BookExtras; refs: Refs; plan: PlanInfo; /** Dueño del hogar (si la automatización no tiene creador). */ owner: string | null }

export async function loadCtx(bookId: string): Promise<BookCtx> {
  const db = supabaseAdmin()
  const [{ data: bk }, book, { data: fondo }] = await Promise.all([
    db.from("books").select("household_id").eq("id", bookId).single(),
    loadBookData(db, bookId),
    db.from("emergency_funds").select("activo,saldo").eq("book_id", bookId).maybeSingle(),
  ])
  if (!bk) throw new Error("No existe el libro")
  const [{ data: fam }, plan, { data: own }] = await Promise.all([
    db.from("family_members").select("id,nombre,user_id").eq("household_id", bk.household_id).is("deleted_at", null),
    planOf(bk.household_id),
    db.from("household_members").select("user_id").eq("household_id", bk.household_id).eq("role", "owner").limit(1).maybeSingle(),
  ])
  return {
    db, bookId, householdId: bk.household_id, book, plan, owner: own?.user_id ?? null,
    extras: { fondo: { activo: !!fondo?.activo, saldo: Number(fondo?.saldo ?? 0) } },
    refs: {
      categorias: Object.fromEntries(book.categories.map((c) => [c.id, c.nombre])),
      metas: Object.fromEntries(book.goals.map((g) => [g.id, g.nombre])),
      miembros: Object.fromEntries((fam ?? []).map((m) => [m.id, m.nombre])),
      fijos: Object.fromEntries(book.fixedExpenses.map((f) => [f.id, f.nombre])),
      personas: Object.fromEntries((fam ?? []).filter((m) => m.user_id).map((m) => [m.user_id!, m.nombre])),
    },
  }
}

const nota = (a: AutoRow) => `Creado por la automatización “${a.nombre}”`

/** Suma a una meta o al fondo de emergencia. */
async function aportar(ctx: BookCtx, a: AutoRow, destino: "meta" | "fondo", goalId: string | null | undefined, monto: number, fecha: string) {
  if (monto <= 0) return "El monto da $0: no se apartó nada"
  if (destino === "fondo") {
    await ctx.db.from("emergency_funds").upsert({ book_id: ctx.bookId, activo: true, saldo: ctx.extras.fondo.saldo }, { onConflict: "book_id", ignoreDuplicates: true })
    const { data: f } = await ctx.db.from("emergency_funds").select("saldo").eq("book_id", ctx.bookId).single()
    const saldo = Number(f?.saldo ?? 0) + monto
    const { error } = await ctx.db.from("emergency_funds").update({ activo: true, saldo }).eq("book_id", ctx.bookId)
    if (error) throw new Error(error.message)
    await ctx.db.from("fund_movements").insert({ book_id: ctx.bookId, tipo: "guardar", valor: monto, fecha, nota: nota(a) })
    ctx.extras.fondo = { activo: true, saldo }
    return `Se guardaron ${formatCOP(monto)} en tu fondo de emergencia`
  }
  if (!goalId) throw new Error("Elige la meta en la automatización")
  const { data: g } = await ctx.db.from("goals").select("id,nombre,ahorrado").eq("id", goalId).eq("book_id", ctx.bookId).is("deleted_at", null).maybeSingle()
  if (!g) throw new Error("La meta ya no existe")
  const { error } = await ctx.db.from("goals").update({ ahorrado: Number(g.ahorrado) + monto }).eq("id", g.id)
  if (error) throw new Error(error.message)
  return `Se aportaron ${formatCOP(monto)} a “${g.nombre}”`
}

/** Acciones de verdad sobre la base (todas limitadas al libro de la automatización). */
export function makeAdapter(ctx: BookCtx, a: AutoRow, runKey: string): ActionAdapter {
  // A quién y con qué tipo de aviso (matriz de Ajustes › Alertas) sale cada aviso de esta automatización.
  // Las acciones que escriben actúan como quien creó la automatización (o el dueño del hogar).
  const actor = a.created_by ?? ctx.owner
  const avisoTo = (ev: TriggerEvent, para: string | undefined) => ({
    para, autor: ev.data.autor ? String(ev.data.autor) : null, creador: a.created_by, aviso: avisoDeDisparador(ev.kind, ev.data),
  })
  return {
    async run(kind, p, ev, node) {
      const rowId = ev.data.row_id ? String(ev.data.row_id) : null
      switch (kind) {
        case "aviso":
          return notifyHousehold({ householdId: ctx.householdId, bookId: ctx.bookId, titulo: p.titulo ?? "Aviso", mensaje: p.mensaje ?? "", canales: p.canales ?? "app", dedupe: `auto:${runKey}:${node.id}`, ...avisoTo(ev, p.para) })
        case "crear_ingreso": {
          if (!p.monto || p.monto <= 0) return "El monto da $0: no se registró nada"
          // Con la marca de automatización: este ingreso no vuelve a disparar automatizaciones (sin bucles).
          if (!actor) throw new Error("El hogar no tiene dueño: no se puede registrar el ingreso")
          const { error } = await ctx.db.rpc("automation_create_income", {
            p_user: actor, p_book: ctx.bookId, p_fecha: p.fecha ?? ev.hoy, p_descripcion: p.descripcion || "Ingreso automático", p_valor: p.monto, p_category: p.category_id ?? undefined,
          })
          if (error) throw new Error(error.message)
          return `Se registró el ingreso “${p.descripcion}” por ${formatCOP(p.monto)}`
        }
        case "pagar_fijo": {
          const f = ctx.book.fixedExpenses.find((x) => x.id === p.fixed_expense_id)
          if (!f) throw new Error("El gasto fijo ya no existe: elige otro en la automatización")
          const st = fijoStatus(f, ev.hoy)
          const per = st.venc[0] ?? st.prox
          if (!per) return `“${f.nombre}” ya está al día: no había nada pendiente`
          const valor = p.monto && p.monto > 0 ? p.monto : Math.round(fijoValor(f, per.per))
          if (!valor) throw new Error(`“${f.nombre}” no tiene valor: usa el monto del disparador`)
          const q = per.per.endsWith("Q1") ? " (1ª quincena)" : per.per.endsWith("Q2") ? " (2ª quincena)" : ""
          // Actúa como quien creó la automatización: la base revisa su rol y la auditoría queda a su nombre.
          if (!actor) throw new Error("El hogar no tiene dueño: no se puede registrar el pago")
          const { error } = await ctx.db.rpc("automation_pay_fixed", { p_user: actor, p_fixed: f.id!, p_periodo: per.per, p_fecha: ev.hoy, p_valor: valor, p_desc_suffix: q })
          if (error) throw new Error(/ya está pagado/.test(error.message) ? `“${f.nombre}” ya estaba pagado en ese periodo` : error.message)
          f.payments.push({ periodo: per.per, fecha: ev.hoy, valor })
          return `“${f.nombre}”${q} quedó pagado por ${formatCOP(valor)}`
        }
        case "movimiento": {
          if (!p.monto || p.monto <= 0) return "El monto da $0: no se creó nada"
          if (p.tipo === "gasto") {
            const { error } = await ctx.db.from("expenses").insert({
              book_id: ctx.bookId, fecha: p.fecha ?? ev.hoy, descripcion: p.descripcion || "Gasto automático", valor: p.monto, category_id: p.category_id || null,
              origen: "manual", external_id: `auto:${runKey}:${node.id}`.slice(0, 200), nota: nota(a),
            })
            if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message)
            return `Se creó el gasto “${p.descripcion}” por ${formatCOP(p.monto)}`
          }
          return aportar(ctx, a, p.tipo === "ahorro" ? "fondo" : "meta", p.goal_id, p.monto, p.fecha ?? ev.hoy)
        }
        case "apartar":
          return aportar(ctx, a, p.destino ?? "meta", p.goal_id, p.monto ?? 0, p.fecha ?? ev.hoy)
        case "categorizar": {
          if (!rowId || ev.data.tabla !== "expenses") throw new Error("No hay un gasto para categorizar")
          const { error } = await ctx.db.from("expenses").update({ category_id: p.category_id || null }).eq("id", rowId).eq("book_id", ctx.bookId)
          if (error) throw new Error(error.message)
          return `Categoría asignada: ${(p.category_id && ctx.refs.categorias?.[p.category_id]) || "elegida"}`
        }
        case "marcar_hormiga": {
          if (!rowId || ev.data.tabla !== "expenses") throw new Error("No hay un gasto para marcar")
          const { error } = await ctx.db.from("expenses").update({ hormiga: true, hormiga_src: "regla", hormiga_razon: nota(a) }).eq("id", rowId).eq("book_id", ctx.bookId)
          if (error) throw new Error(error.message)
          return "Gasto marcado como hormiga"
        }
        case "agenda": {
          const { error } = await ctx.db.from("calendar_events").insert({ book_id: ctx.bookId, titulo: (p.titulo || "Recordatorio").slice(0, 120), fecha: p.fecha ?? ev.hoy, tipo: "egreso", monto: p.monto ?? 0, anual: false, nota: nota(a) })
          if (error) throw new Error(error.message)
          return `Agregado a tu agenda: “${p.titulo}” el ${p.fecha}`
        }
        case "esperar":
          return "Esperó"
        case "ia": {
          const b = ctx.book
          const gastoMes = b.expenses.filter((x) => x.fecha.startsWith(ev.hoy.slice(0, 7))).reduce((t, x) => t + Number(x.valor), 0)
          const contexto = `Datos del libro (estimados): gastos registrados este mes ${formatCOP(gastoMes)}; ${b.goals.length} metas; fondo de emergencia ${formatCOP(ctx.extras.fondo.saldo)}. ${String(ev.data.resumen ?? "")}`
          const { text } = await aiText({
            householdId: ctx.householdId, bookId: ctx.bookId, userId: a.created_by, feature: "automatizacion", maxOutputTokens: 400,
            system: "Eres el consejero financiero de Mirai para familias en Colombia sin conocimientos financieros. Responde en español de Colombia con tuteo, en máximo 3 frases cortas, concretas y amables. Montos en pesos colombianos. No inventes datos.",
            prompt: `${p.pregunta}\n\n${contexto}`,
          })
          await notifyHousehold({ householdId: ctx.householdId, bookId: ctx.bookId, titulo: "Consejo de la IA", mensaje: text.trim().slice(0, 1000), canales: p.canales ?? "app", dedupe: `auto:${runKey}:${node.id}`, ...avisoTo(ev, p.para) })
          return `Consejo enviado: ${text.trim().slice(0, 140)}`
        }
      }
    },
  }
}

const asJson = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as NonNullable<Json>

/** Guarda el resultado en el historial y en la automatización. */
async function saveResult(ctx: BookCtx, a: AutoRow, runId: string, r: RunResult, prevSteps: unknown[] = []) {
  await ctx.db.from("automation_runs").update({
    estado: r.status, pasos: asJson([...prevSteps, ...r.steps]), error: r.error ?? null,
    reanudar_at: r.resume ? `${r.resume.at}T12:00:00Z` : null, pendientes: r.resume ? asJson(r.resume.nodes) : null,
  }).eq("id", runId)
  await ctx.db.from("automations").update({ ultima_ejecucion: new Date().toISOString(), ultimo_estado: r.status, ejecuciones: (a.ejecuciones ?? 0) + 1 }).eq("id", a.id)
  a.ejecuciones = (a.ejecuciones ?? 0) + 1
}

/**
 * Ejecuta una automatización para un evento una sola vez: la fila de automation_runs con (automation_id, clave) única
 * hace de candado idempotente (dos pestañas, el cron y la app pueden intentar lo mismo sin duplicar).
 */
export async function execute(ctx: BookCtx, a: AutoRow, ev: TriggerEvent): Promise<RunResult | null> {
  const { data: claimed } = await ctx.db.from("automation_runs")
    .upsert({ book_id: ctx.bookId, automation_id: a.id, clave: ev.clave.slice(0, 200), disparador: ev.kind, evento: asJson(ev), estado: "ok" }, { onConflict: "automation_id,clave", ignoreDuplicates: true })
    .select("id")
  const runId = claimed?.[0]?.id
  if (!runId) return null // ya se ejecutó
  let r: RunResult
  try { r = await runGraph(parseGraph(a.grafo), ev, { adapter: makeAdapter(ctx, a, `${a.id.slice(0, 8)}:${ev.clave}`), refs: ctx.refs }) }
  catch (e) { r = { status: "error", steps: [], error: (e as Error).message } }
  await saveResult(ctx, a, runId, r)
  return r
}

/**
 * Reclama los eventos pendientes de forma atómica: solo quien logra marcarlos los procesa. Los de la versión publicada
 * esperan con procesado_at null; los eventos nuevos (cuotas, tarjetas, suscripciones, agenda) con la marca epoch, para
 * que el código viejo no los consuma sin entenderlos.
 */
async function claim(db: Db, bookId: string, pending: string | null): Promise<QueuedEvent[]> {
  const sel = db.from("automation_events").select("id").eq("book_id", bookId)
  const { data: pend } = await (pending === null ? sel.is("procesado_at", null) : sel.eq("procesado_at", pending)).order("created_at").limit(100)
  if (!pend?.length) return []
  const upd = db.from("automation_events").update({ procesado_at: new Date().toISOString() }).in("id", pend.map((p) => p.id))
  const { data } = await (pending === null ? upd.is("procesado_at", null) : upd.eq("procesado_at", pending)).select("*")
  return (data ?? []).map((e) => ({ id: e.id, tipo: e.tipo, tabla: e.tabla, row_id: e.row_id, datos: (e.datos ?? {}) as Record<string, unknown> }))
}

async function activeAutos(db: Db, bookId: string, kinds?: string[]) {
  let q = db.from("automations").select("*").eq("book_id", bookId).eq("activo", true).is("deleted_at", null).order("created_at")
  if (kinds) q = q.in("disparador", kinds)
  const { data } = await q
  return (data ?? []) as AutoRow[]
}

/** Revisa los disparadores por estado (presupuesto, pagos próximos, fondo, metas, día de pago). */
async function runState(ctx: BookCtx, autos: AutoRow[], hoy: string, out: string[]) {
  for (const a of autos.filter((x) => (STATE_TRIGGERS as string[]).includes(x.disparador))) {
    const t = triggerOf(parseGraph(a.grafo))
    if (!t) continue
    for (const ev of stateEvents(t, ctx.book, hoy, ctx.extras)) {
      const r = await execute(ctx, a, ev)
      if (r) out.push(`${a.nombre}: ${r.status}`)
    }
  }
}

/** Procesa la cola de eventos de un libro (al instante desde la app y como respaldo en el cron) y los estados. */
export async function processBook(bookId: string, opts: { state?: boolean; schedule?: { hora: number; daily: boolean } } = {}) {
  const db = supabaseAdmin()
  const out: string[] = []
  const hoy = todayBogota()
  const events = [...(await claim(db, bookId, null)), ...(await claim(db, bookId, V2_PENDING_AT))]
  const activas = await activeAutos(db, bookId)
  if (!activas.length) return out
  // Si el hogar bajó de plan y quedó sobre el límite, solo corren las primeras N (las demás siguen en la lista).
  const plan = await planOf((await db.from("books").select("household_id").eq("id", bookId).single()).data?.household_id ?? "")
  const autos = runnable(plan, activas)
  const needsState = opts.state !== false && autos.some((a) => (STATE_TRIGGERS as string[]).includes(a.disparador))
  const needsSchedule = !!opts.schedule && autos.some((a) => a.disparador === "programado")
  if (!events.length && !needsState && !needsSchedule) return out
  const ctx = await loadCtx(bookId)
  for (const q of events)
    for (const a of autos.filter((x) => (EVENT_TRIGGERS as string[]).includes(x.disparador))) {
      const t = triggerOf(parseGraph(a.grafo))
      const ev = t && queuedEventFor(t, q, ctx.book, hoy)
      if (!ev) continue
      const r = await execute(ctx, a, ev)
      if (r) out.push(`${a.nombre}: ${r.status}`)
    }
  if (needsState) await runState(ctx, autos, hoy, out)
  if (needsSchedule)
    for (const a of autos.filter((x) => x.disparador === "programado")) {
      const t = triggerOf(parseGraph(a.grafo))
      const ev = t && scheduledEvent(t, ctx.book, { hoy, hora: opts.schedule!.hora, daily: opts.schedule!.daily })
      if (!ev) continue
      const r = await execute(ctx, a, ev)
      if (r) out.push(`${a.nombre}: ${r.status}`)
    }
  return out
}

/** Sigue las ejecuciones que estaban en "Esperar N días" y ya cumplieron la fecha. */
async function resumeWaiting(out: string[]) {
  const db = supabaseAdmin()
  const { data: runs } = await db.from("automation_runs").select("*").eq("estado", "esperando").lte("reanudar_at", new Date().toISOString()).is("deleted_at", null).limit(200)
  const ctxs = new Map<string, BookCtx>()
  for (const run of runs ?? []) {
    const { data: claimed } = await db.from("automation_runs").update({ reanudar_at: null }).eq("id", run.id).eq("estado", "esperando").not("reanudar_at", "is", null).select("id")
    if (!claimed?.length) continue
    const { data: a } = await db.from("automations").select("*").eq("id", run.automation_id).maybeSingle()
    const prev = Array.isArray(run.pasos) ? (run.pasos as unknown[]) : []
    if (!a || a.deleted_at || !a.activo) {
      await db.from("automation_runs").update({ estado: "omitida", error: "La automatización está pausada o se eliminó", pendientes: null }).eq("id", run.id)
      continue
    }
    const ctx = ctxs.get(run.book_id) ?? (await loadCtx(run.book_id))
    ctxs.set(run.book_id, ctx)
    const permitidas = runnable(ctx.plan, await activeAutos(db, run.book_id))
    if (!permitidas.some((x) => x.id === a.id)) {
      // Bajó de plan: no se pierde, se reanuda cuando vuelva a estar dentro del límite.
      await db.from("automation_runs").update({ reanudar_at: new Date(Date.now() + 86_400_000).toISOString() }).eq("id", run.id)
      continue
    }
    const ev = { ...(run.evento as unknown as TriggerEvent), hoy: todayBogota() }
    const nodes = Array.isArray(run.pendientes) ? (run.pendientes as string[]) : []
    let r: RunResult
    try { r = await runGraph(parseGraph(a.grafo), ev, { adapter: makeAdapter(ctx, a as AutoRow, `${a.id.slice(0, 8)}:${run.clave}:r${prev.length}`), refs: ctx.refs, startAt: nodes }) }
    catch (e) { r = { status: "error", steps: [], error: (e as Error).message } }
    await saveResult(ctx, a as AutoRow, run.id, r, prev)
    out.push(`${a.nombre}: reanudada ${r.status}`)
  }
}

/**
 * Libros con eventos sin procesar en automation_events (los de la versión publicada y los nuevos con la marca epoch).
 * El *drain* de la API encola una tarea por cada uno.
 */
export async function booksWithPendingEvents(limit = 500): Promise<string[]> {
  const db = supabaseAdmin()
  const [{ data: a }, { data: b }] = await Promise.all([
    db.from("automation_events").select("book_id").is("procesado_at", null).order("created_at").limit(limit),
    db.from("automation_events").select("book_id").eq("procesado_at", V2_PENDING_AT).order("created_at").limit(limit),
  ])
  return [...new Set([...(a ?? []), ...(b ?? [])].map((e) => e.book_id))]
}

/** Pasada del cron (app/api/cron/notify): cola pendiente, estados, programadas y esperas cumplidas. */
export async function runAutomationsCron(o: { daily: boolean }) {
  const db = supabaseAdmin()
  const out: string[] = []
  const { data: rows } = await db.from("automations").select("book_id").eq("activo", true).is("deleted_at", null)
  const books = [...new Set((rows ?? []).map((r) => r.book_id))]
  const hora = horaBogota()
  for (const b of books) {
    try { out.push(...(await processBook(b, { state: true, schedule: { hora, daily: o.daily } }))) }
    catch (e) { out.push(`ERROR ${b.slice(0, 8)}: ${(e as Error).message}`) }
  }
  try { await resumeWaiting(out) } catch (e) { out.push(`ERROR esperas: ${(e as Error).message}`) }
  // La cola ya procesada se limpia a los 30 días.
  if (o.daily || hora === 3) await db.from("automation_events").delete().not("procesado_at", "is", null).lt("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
  return { libros: books.length, ejecuciones: out.length, detalle: out.slice(0, 50) }
}
