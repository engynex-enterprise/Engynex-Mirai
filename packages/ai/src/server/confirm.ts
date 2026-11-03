import { z } from "zod"
import type { LoadedBook } from "@mirai/domain/book-data"
import { rt } from "@mirai/services/runtime"
import { loanEngine, norm, todayBogota } from "@mirai/domain"
import { publicError } from "../public-error"
import { PARECE_ENTIDAD, armarAbonoMeta, armarCobroSub, armarCompraTarjeta, armarPagoTarjeta, armarPagoCuota, armarPagoFijo, armarPrestamo, type Datos } from "../chat/acciones"
import type { Propuesta } from "../chat/types"
import type { AiCtx, Sb } from "./ctx"

// Escribir en el libro lo que la persona confirmó en el chat. La propuesta vive en chat_messages.meta, que se puede
// editar desde el navegador: aquí NO se confía en ella. Se valida con zod, se comprueba que cada registro al que
// apunta (deuda, gasto fijo, suscripción, tarjeta, meta, categoría) sea de este libro y se recalculan las cifras con
// el libro de hoy (lib/chat/acciones.ts, los mismos cálculos de los formularios). Las operaciones enlazadas usan las
// RPC transaccionales: pay_fixed_expense, pay_subscription y add_card_purchase (F2) y goal_contribute (F1).

export type Escrito = { ok: true; id: string; datos: Datos } | { ok: false; msg: string }

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Money = z.number().positive().max(1e12)
/** Datos de una propuesta (todos opcionales: cada tipo exige los suyos más abajo). */
const DatosZ = z.object({
  valor: Money.optional(), descripcion: z.string().trim().max(200).optional(), fecha: Fecha.optional().nullable(),
  category_id: z.uuid().nullable().optional(), categoria: z.string().max(80).nullable().optional(),
  cat_src: z.enum(["regla", "historial", "palabras", "ia"]).nullable().optional(),
  nombre: z.string().trim().max(120).optional(), objetivo: Money.optional(), ahorrado: z.number().min(0).max(1e12).optional(),
  titulo: z.string().trim().max(200).optional(), monto: z.number().min(0).max(1e12).optional(),
  frec: z.enum(["mensual", "quincenal", "semanal", "diario", "diariohab", "bimestral", "trimestral", "semestral", "anual"]).optional(),
  dia: z.number().int().min(1).max(31).optional(), ciclo: z.enum(["mensual", "anual"]).optional(), proximo: Fecha.optional(),
  ref_id: z.uuid().optional(), periodo: z.string().max(20).optional(),
  kind: z.enum(["pagar", "cobrar"]).optional(), loan_tipo: z.string().max(20).optional(), plazo: z.number().int().min(1).max(600).optional(),
  tasa: z.number().min(0).max(30).optional(), persona: z.string().trim().max(80).optional(), concepto: z.string().trim().max(80).optional(),
  pago: z.enum(["cuota", "abono"]).optional(), cuotas: z.number().int().min(0).max(48).optional(),
  pago_tarjeta: z.enum(["minimo", "total", "otro"]).optional(),
  payment_method_id: z.uuid().nullable().optional(),
}).loose()

const r0 = (v: number) => Math.round(+v || 0)
const fail = (e: { message: string } | null | undefined, what = "intenta de nuevo.") => ({ ok: false as const, msg: `No se pudo guardar: ${publicError(e, what)}` })

/** RPC nueva con respaldo: si la función todavía no existe en la base, `hecho: false` (se usa la escritura de antes). */
async function rpc(sb: Sb, fn: string, args: Record<string, unknown>): Promise<{ hecho: boolean; data?: unknown; error?: { message: string } }> {
  const { data, error } = await sb.rpc(fn as never, args as never)
  if (!error) return { hecho: true, data }
  if (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message)) return { hecho: false }
  return { hecho: true, error }
}

/** El medio de pago tiene que ser de este libro (si no, se guarda sin medio). */
async function medioOk(sb: Sb, bookId: string, id: string | null | undefined) {
  if (!id) return null
  const { data } = await sb.from("payment_methods").select("id").eq("id", id).eq("book_id", bookId).maybeSingle()
  return data?.id ?? null
}

async function categoria(sb: Sb, bookId: string, id: string | null | undefined, nombre?: string) {
  if (id) {
    const { data } = await sb.from("categories").select("id").eq("id", id).eq("book_id", bookId).is("deleted_at", null).maybeSingle()
    if (data) return data.id
  }
  if (!nombre) return null
  const { data } = await sb.from("categories").select("id").eq("book_id", bookId).eq("nombre", nombre).is("deleted_at", null).limit(1).maybeSingle()
  return data?.id ?? null
}

/** Escribe la propuesta confirmada. Los permisos por rol ya se revisaron en chatConfirm; la RLS los vuelve a exigir. */
export async function escribir(ctx: Pick<AiCtx, "book">, sb: Sb, p: Propuesta): Promise<Escrito> {
  const parsed = DatosZ.safeParse(p.datos ?? {})
  if (!parsed.success) return { ok: false, msg: "Los datos de la propuesta no son válidos. Pídela de nuevo en el chat." }
  const d = parsed.data as Datos & z.infer<typeof DatosZ>
  const bookId = ctx.book.id
  const today = todayBogota()
  const fecha = d.fecha ?? today
  const id = crypto.randomUUID()
  let book: LoadedBook | null = null
  const libro = async () => (book ??= await rt().loadBook(sb, bookId))

  switch (p.tipo) {
    case "gasto": {
      if (!d.valor) return { ok: false, msg: "El gasto necesita un valor." }
      const cat = await categoria(sb, bookId, d.category_id)
      const { error } = await sb.from("expenses").insert({ id, book_id: bookId, fecha, descripcion: (d.descripcion || "Gasto").slice(0, 80), valor: r0(d.valor), category_id: cat, cat_src: cat ? d.cat_src ?? "regla" : null, origen: "manual", payment_method_id: await medioOk(sb, bookId, d.payment_method_id) })
      return error ? fail(error) : { ok: true, id, datos: d }
    }
    case "ingreso": {
      if (!d.valor) return { ok: false, msg: "El ingreso necesita un valor." }
      const { error } = await sb.from("extra_incomes").insert({ id, book_id: bookId, fecha, descripcion: (d.descripcion || "Ingreso").slice(0, 80), valor: r0(d.valor), payment_method_id: await medioOk(sb, bookId, d.payment_method_id) })
      return error ? fail(error) : { ok: true, id, datos: d }
    }
    case "ingreso_fijo": {
      if (!d.valor || !d.descripcion) return { ok: false, msg: "El ingreso necesita un nombre y un valor." }
      const frec = d.frec === "quincenal" || d.frec === "semanal" ? d.frec : "mensual"
      const { error } = await sb.from("incomes").insert({ id, book_id: bookId, concepto: d.descripcion.slice(0, 60), valor: r0(d.valor), frec, dia: d.dia ?? 30 })
      return error ? fail(error) : { ok: true, id, datos: d }
    }
    case "fijo": {
      if (!d.valor || !d.nombre) return { ok: false, msg: "El gasto fijo necesita un nombre y un valor." }
      const frec = ["mensual", "quincenal", "bimestral", "trimestral", "semestral", "anual"].includes(d.frec ?? "") ? d.frec! : "mensual"
      const cat = await categoria(sb, bookId, d.category_id)
      const { error } = await sb.from("fixed_expenses").insert({ id, book_id: bookId, nombre: d.nombre.slice(0, 60), valor: r0(d.valor), frec, dia: d.dia ?? 1, desde: today.slice(0, 7), mes: frec === "anual" ? +today.slice(5, 7) : null, category_id: cat })
      return error ? fail(error) : { ok: true, id, datos: d }
    }
    case "pago_fijo": {
      const b = await libro()
      const f = b.fixedExpenses.find((x) => x.id === d.ref_id)
      if (!f) return { ok: false, msg: "No encontramos ese gasto fijo en este libro." }
      const a = armarPagoFijo(b, today, { ref: f.nombre, valor: d.valor, fecha }, f)
      if (!a.ok) return a
      const per = a.datos.periodo!
      const q = per.endsWith("Q1") ? " (1ª quincena)" : per.endsWith("Q2") ? " (2ª quincena)" : ""
      const { error } = await sb.rpc("pay_fixed_expense", { p_fixed: f.id, p_periodo: per, p_fecha: a.datos.fecha!, p_valor: a.datos.valor!, p_medio: (f as { payment_method_id?: string | null }).payment_method_id ?? undefined, p_desc_suffix: q })
      return error ? fail(error) : { ok: true, id: f.id, datos: a.datos }
    }
    case "suscripcion": {
      if (!d.valor || !d.nombre) return { ok: false, msg: "La suscripción necesita un nombre y un valor." }
      const cat = await categoria(sb, bookId, null, "Suscripciones")
      const { error } = await sb.from("subscriptions").insert({ id, book_id: bookId, nombre: d.nombre.slice(0, 60), valor: r0(d.valor), ciclo: d.ciclo ?? "mensual", proximo: d.proximo && d.proximo >= today ? d.proximo : today, activa: true, category_id: cat })
      return error ? fail(error) : { ok: true, id, datos: d }
    }
    case "cobro_suscripcion": {
      const b = await libro()
      const s = b.subscriptions.find((x) => x.id === d.ref_id)
      if (!s) return { ok: false, msg: "No encontramos esa suscripción activa en este libro." }
      const a = armarCobroSub(b, today, { ref: s.nombre, valor: d.valor }, s)
      if (!a.ok) return a
      const r = await rpc(sb, "pay_subscription", { p_sub: s.id, p_fecha: a.datos.fecha, p_valor: a.datos.valor })
      if (r.error) return fail(r.error)
      if (!r.hecho) {
        // Respaldo si la base aún no tiene pay_subscription (F2): las dos escrituras de "Ya se cobró".
        const { error } = await sb.from("expenses").insert({ id, book_id: bookId, fecha: a.datos.fecha!, descripcion: s.nombre, valor: a.datos.valor!, category_id: await categoria(sb, bookId, (s as { category_id?: string | null }).category_id, "Suscripciones"), hormiga: false })
        if (error) return fail(error)
        await sb.from("subscriptions").update({ proximo: a.datos.proximo }).eq("id", s.id)
      }
      return { ok: true, id: String((r.data as { expense_id?: string } | undefined)?.expense_id ?? id), datos: a.datos }
    }
    case "compra_tarjeta": {
      const b = await libro()
      const c = b.creditCards.find((x) => x.id === d.ref_id)
      if (!c) return { ok: false, msg: "No encontramos esa tarjeta en este libro." }
      const a = armarCompraTarjeta(b, today, { valor: d.valor ?? 0, descripcion: d.descripcion ?? "Compra", cuotas: d.cuotas, fecha }, c)
      if (!a.ok) return a
      const cat = await categoria(sb, bookId, d.category_id, "Otros")
      const r = await rpc(sb, "add_card_purchase", { p_card: c.id, p_fecha: a.datos.fecha, p_descripcion: a.datos.descripcion, p_valor: a.datos.valor, p_cuotas: a.datos.cuotas, p_category: cat, p_como_gasto: true })
      if (r.error) return fail(r.error)
      let gid = (r.data as { expense_id?: string | null } | undefined)?.expense_id ?? null
      if (!r.hecho) {
        // Respaldo si la base aún no tiene add_card_purchase (F2): gasto origen "tarjeta" + compra enlazada.
        const { data: g, error } = await sb.from("expenses").insert({ book_id: bookId, fecha: a.datos.fecha!, descripcion: a.datos.descripcion!, valor: a.datos.valor!, category_id: cat, origen: "tarjeta", hormiga: false }).select("id").single()
        if (error) return fail(error)
        gid = g.id
        const { error: e2 } = await sb.from("card_purchases").insert({ id, book_id: bookId, card_id: c.id, fecha: a.datos.fecha!, descripcion: a.datos.descripcion!, valor: a.datos.valor!, cuotas: a.datos.cuotas!, category_id: cat, expense_id: gid })
        if (e2) return fail(e2)
      }
      if (gid && cat && d.cat_src) await sb.from("expenses").update({ cat_src: d.cat_src }).eq("id", gid)
      return { ok: true, id: String((r.data as { purchase_id?: string } | undefined)?.purchase_id ?? id), datos: { ...a.datos, category_id: cat } }
    }
    case "pago_tarjeta": {
      const b = await libro()
      const c = b.creditCards.find((x) => x.id === d.ref_id)
      if (!c) return { ok: false, msg: "No encontramos esa tarjeta en este libro." }
      const a = armarPagoTarjeta(b, today, { valor: d.valor, total: (d as { pago_tarjeta?: string }).pago_tarjeta === "total", fecha }, c)
      if (!a.ok) return a
      const { data, error } = await sb.rpc("pay_credit_card", { p_card: c.id, p_valor: a.datos.valor!, p_fecha: a.datos.fecha!, p_tipo: a.datos.pago_tarjeta ?? "otro", p_nota: "Desde el chat de Mirai" })
      return error ? fail(error) : { ok: true, id: String((data as { payment_id?: string } | null)?.payment_id ?? c.id), datos: a.datos }
    }
    case "prestamo": {
      const b = await libro()
      const kind = d.kind === "cobrar" ? "cobrar" : "pagar"
      const a = armarPrestamo(b, today, { kind, valor: d.valor ?? 0, persona: d.persona, plazo: d.plazo, frec: d.frec, tasa: d.tasa, fecha, concepto: d.concepto, tipo: d.loan_tipo })
      if (!a.ok) return a
      const x = a.datos
      let contact = x.contact_id ?? null, entity = x.entity_id ?? null
      if (!contact && !entity) {
        // Quien no está en Contactos ni en Entidades se crea (como "Alguien nuevo" en el formulario).
        if (kind === "pagar" && PARECE_ENTIDAD.test(norm(x.persona))) {
          const { data, error } = await sb.from("entities").insert({ book_id: bookId, nombre: x.persona!, tipo: "Banco" }).select("id").single()
          if (error) return fail(error)
          entity = data.id
        } else {
          const { data, error } = await sb.from("contacts").insert({ book_id: bookId, tipo: "persona", nombre: x.persona! }).select("id").single()
          if (error) return fail(error)
          contact = data.id
        }
      }
      const { error } = await sb.from("loans").insert({
        id, book_id: bookId, kind, tipo: x.loan_tipo, concepto: x.concepto ?? "", monto: x.valor!, sistema: x.sistema ?? "simple", tasa: x.tasa ?? 0, frec: x.frec ?? "mensual",
        plazo: x.plazo ?? 1, inicio: x.fecha!, extra: 0, contact_id: contact, entity_id: entity, fiado: x.loan_tipo === "fiado", nota: "Creado desde el chat de Mirai",
      })
      return error ? fail(error) : { ok: true, id, datos: { ...x, contact_id: contact, entity_id: entity } }
    }
    case "pago_cuota": {
      const b = await libro()
      const L = b.loans.find((x) => x.id === d.ref_id)
      if (!L) return { ok: false, msg: "No encontramos esa deuda en este libro." }
      const kind = L.kind === "cobrar" ? "cobrar" : "pagar"
      const a = armarPagoCuota(b, today, { kind, ref: "", cuotas: d.pago === "cuota" ? d.cuotas : undefined, valor: d.pago === "abono" ? d.valor : undefined, fecha }, L)
      if (!a.ok) return a
      const e0 = loanEngine(L, today)
      const rows = a.datos.pago === "cuota"
        ? e0.plan.slice(0, a.datos.cuotas).map((q) => ({ book_id: bookId, loan_id: L.id!, fecha: a.datos.fecha!, tipo: "cuota", valor: r0(q.valor), nota: "Desde el chat de Mirai" }))
        : [{ book_id: bookId, loan_id: L.id!, fecha: a.datos.fecha!, tipo: "abono", valor: a.datos.valor!, modo: "plazo", nota: "Desde el chat de Mirai" }]
      const { data, error } = await sb.from("loan_payments").insert(rows).select("id")
      return error ? fail(error) : { ok: true, id: data?.[0]?.id ?? id, datos: a.datos }
    }
    case "meta": {
      if (!d.nombre?.trim() || !d.objetivo) return { ok: false, msg: "La meta necesita un nombre y cuánto quieres juntar." }
      const { error } = await sb.from("goals").insert({ id, book_id: bookId, nombre: d.nombre.slice(0, 60), objetivo: r0(d.objetivo), ahorrado: r0(d.ahorrado ?? 0), fecha: d.fecha ?? null, icon: "target" })
      return error ? fail(error) : { ok: true, id, datos: d }
    }
    case "abono_meta": {
      const b = await libro()
      const g = b.goals.find((x) => x.id === d.ref_id)
      if (!g) return { ok: false, msg: "No encontramos esa meta en este libro." }
      const a = armarAbonoMeta(b, today, { valor: d.valor ?? 0, fecha }, g)
      if (!a.ok) return a
      const r = await rpc(sb, "goal_contribute", { p_goal: g.id, p_valor: a.datos.valor, p_fecha: a.datos.fecha, p_nota: "Desde el chat de Mirai" })
      if (r.error) return fail(r.error)
      if (!r.hecho) {
        // Respaldo si la base aún no tiene goal_contribute (F1): suma directa (sin movimiento ni Deshacer).
        const { error } = await sb.from("goals").update({ ahorrado: r0(+g.ahorrado + a.datos.valor!) }).eq("id", g.id)
        if (error) return fail(error)
      }
      const res = r.data as { id?: string; ahorrado?: number } | undefined
      return { ok: true, id: String(res?.id ?? g.id), datos: { ...a.datos, ahorrado: res?.ahorrado != null ? r0(+res.ahorrado) : a.datos.ahorrado } }
    }
    case "recordatorio": {
      if (!d.titulo?.trim() || !d.fecha) return { ok: false, msg: "El recordatorio necesita un nombre y una fecha." }
      const { error } = await sb.from("calendar_events").insert({ id, book_id: bookId, titulo: d.titulo.slice(0, 80), fecha: d.fecha, tipo: "egreso", monto: r0(d.monto ?? 0), anual: false, nota: "Creado desde el chat de Mirai" })
      return error ? fail(error) : { ok: true, id, datos: d }
    }
  }
  return { ok: false, msg: "No encontramos esta propuesta. Pídela de nuevo en el chat." }
}
