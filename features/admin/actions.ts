"use server"

import { z } from "zod"
import { requirePlatformAdmin } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { supabaseServer } from "@/utils/supabase/server"
import { ratingStats } from "@/lib/content/opiniones"
import { mrr, vigente } from "@/lib/plans"

const DAY = 86_400_000
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString()

async function allUsers() {
  const db = supabaseAdmin()
  const out: { id: string; email?: string; created_at: string; last_sign_in_at?: string | null; app_metadata: { provider?: string; providers?: string[] } }[] = []
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    out.push(...data.users)
    if (data.users.length < 1000) break
  }
  return out
}

/** Resumen: personas, actividad de los últimos 30 días y calificación promedio. */
export async function adminOverview() {
  await requirePlatformAdmin()
  const db = supabaseAdmin()
  const [users, households, books, audit, fb] = await Promise.all([
    allUsers(),
    db.from("household_members").select("household_id"),
    db.from("books").select("id", { count: "exact", head: true }).is("deleted_at", null),
    db.from("audit_log").select("created_at,actor,tabla,accion").gte("created_at", ago(30)).order("created_at", { ascending: false }).limit(20000),
    db.from("feedback").select("tipo,rating,estado"),
  ])
  const since = (d: number) => users.filter((u) => u.created_at >= ago(d)).length
  const active = (d: number) => users.filter((u) => (u.last_sign_in_at ?? "") >= ago(d)).length
  const rows = audit.data ?? []
  // Actividad por día (registros creados, editados o borrados) y personas activas por día.
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * DAY).toISOString().slice(0, 10))
  const byDay = days.map((d) => {
    const r = rows.filter((x) => x.created_at.slice(0, 10) === d)
    return { d, acciones: r.length, personas: new Set(r.map((x) => x.actor).filter(Boolean)).size }
  })
  const porSeccion = Object.entries(rows.reduce<Record<string, number>>((a, x) => ((a[x.tabla] = (a[x.tabla] ?? 0) + 1), a), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tabla, n]) => ({ tabla, n }))
  const f = fb.data ?? []
  return {
    personas: users.length, nuevos7: since(7), nuevos30: since(30), activos7: active(7), activos30: active(30),
    hogares: new Set((households.data ?? []).map((m) => m.household_id)).size, libros: books.count ?? 0, acciones30: rows.length, byDay, porSeccion,
    rating: ratingStats(f.filter((x) => x.tipo === "calificacion" && x.rating).map((x) => x.rating!)),
    opinionesNuevas: f.filter((x) => x.estado === "nuevo").length,
    erroresAbiertos: f.filter((x) => x.tipo === "error" && !["hecho", "descartado"].includes(x.estado)).length,
  }
}

/** Clientes: cada cuenta con su hogar, plan, último ingreso y actividad del último mes. */
export async function adminClients() {
  await requirePlatformAdmin()
  const db = supabaseAdmin()
  const [users, { data: profiles }, { data: members }, { data: audit }, { data: subs }, { data: admins }] = await Promise.all([
    allUsers(),
    db.from("profiles").select("id,nombre,avatar_url,telefono"),
    db.from("household_members").select("user_id,role,household_id,households(nombre)"),
    db.from("audit_log").select("actor").gte("created_at", ago(30)).limit(50000),
    db.from("plan_subscriptions").select("household_id,estado,proveedor,vence_at").in("estado", ["activa", "cancelada", "cortesia"]),
    db.from("platform_admins").select("user_id"),
  ])
  const adminIds = new Set((admins ?? []).map((a) => a.user_id))
  const premiumUntil = new Map<string, string>()
  for (const x of subs ?? []) if (vigente(x.vence_at) && (!premiumUntil.has(x.household_id) || x.vence_at! > premiumUntil.get(x.household_id)!)) premiumUntil.set(x.household_id, x.vence_at!)
  const prof = new Map((profiles ?? []).map((p) => [p.id, p]))
  const acts = (audit ?? []).reduce<Record<string, number>>((a, x) => (x.actor ? ((a[x.actor] = (a[x.actor] ?? 0) + 1), a) : a), {})
  return users
    .map((u) => {
      const p = prof.get(u.id)
      const hs = (members ?? []).filter((m) => m.user_id === u.id)
      const own = hs.find((m) => m.role === "owner")
      const vence = hs.map((m) => premiumUntil.get(m.household_id)).filter(Boolean).sort().pop() ?? null
      const premium = !!vence || adminIds.has(u.id) || hs.some((m) => (members ?? []).some((x) => x.household_id === m.household_id && x.role === "owner" && adminIds.has(x.user_id)))
      return {
        id: u.id, email: u.email ?? "", nombre: p?.nombre || "", avatar: p?.avatar_url ?? null, telefono: p?.telefono ?? "",
        creado: u.created_at, ultimoIngreso: u.last_sign_in_at ?? null, acceso: u.app_metadata.providers?.join(", ") || u.app_metadata.provider || "email",
        hogares: hs.map((m) => `${(m.households as { nombre: string } | null)?.nombre ?? "Hogar"}${m.role === "owner" ? "" : ` (${m.role === "editor" ? "editor" : "lector"})`}`),
        plan: premium ? ("Premium" as const) : ("Gratis" as const), premiumHasta: vence, hogarPropio: own?.household_id ?? null, acciones30: acts[u.id] ?? 0,
      }
    })
    .sort((a, b) => b.creado.localeCompare(a.creado))
}

/** Opiniones de todas las personas, con su autor y la captura (enlace temporal de 1 hora). */
export async function adminFeedback() {
  await requirePlatformAdmin()
  const db = supabaseAdmin()
  const { data, error } = await db.from("feedback").select("*").order("created_at", { ascending: false }).limit(1000)
  if (error) throw new Error(error.message)
  const ids = [...new Set((data ?? []).map((f) => f.user_id))]
  const { data: profiles } = ids.length ? await db.from("profiles").select("id,nombre,email,avatar_url").in("id", ids) : { data: [] }
  const prof = new Map((profiles ?? []).map((p) => [p.id, p]))
  const paths = (data ?? []).map((f) => f.captura).filter(Boolean) as string[]
  const { data: signed } = paths.length ? await db.storage.from("feedback").createSignedUrls(paths, 3600) : { data: [] }
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
  return (data ?? []).map((f) => ({ ...f, autor: prof.get(f.user_id) ?? null, capturaUrl: f.captura ? url.get(f.captura) ?? null : null }))
}

const Update = z.object({ estado: z.enum(["nuevo", "revisando", "planeado", "hecho", "descartado"]).optional(), respuesta: z.string().trim().max(4000).optional() })

/** Cambia el estado o responde. Se hace con la sesión del administrador para que quede quién respondió y se avise a la persona. */
export async function adminUpdateFeedback(id: string, patch: z.input<typeof Update>) {
  await requirePlatformAdmin()
  const p = Update.parse(patch)
  const { error } = await (await supabaseServer()).from("feedback").update(p).eq("id", z.uuid().parse(id))
  if (error) throw new Error(error.message)
}

/** Ingresos: MRR estimado, suscriptores, pagos del mes y recientes. */
export async function adminRevenue() {
  await requirePlatformAdmin()
  const db = supabaseAdmin()
  const [{ data: subs }, { data: pays }, { data: plan }, { data: households }] = await Promise.all([
    db.from("plan_subscriptions").select("household_id,periodo,estado,proveedor,vence_at,updated_at"),
    db.from("plan_payments").select("id,household_id,proveedor,referencia,periodo,monto,estado,metodo,pagador,paid_at,created_at").order("created_at", { ascending: false }).limit(500),
    db.from("plans").select("precio_mes,precio_anio").eq("id", "premium").single(),
    db.from("households").select("id,nombre"),
  ])
  const vivos = (subs ?? []).filter((x) => vigente(x.vence_at) && x.estado !== "pendiente")
  const ok = (pays ?? []).filter((x) => x.estado === "aprobado")
  const mes = ok.filter((x) => (x.paid_at ?? x.created_at) >= ago(30))
  const nombre = new Map((households ?? []).map((h) => [h.id, h.nombre]))
  return {
    mrr: Math.round(mrr(vivos, plan?.precio_mes ?? 14900, plan?.precio_anio ?? 149000)),
    pagando: vivos.filter((x) => x.proveedor !== "manual").length,
    cortesia: vivos.filter((x) => x.proveedor === "manual").length,
    porProveedor: (["mercadopago", "wompi"] as const).map((p) => ({ p, n: vivos.filter((x) => x.proveedor === p).length })),
    ingresosMes: mes.reduce((t, x) => t + x.monto, 0), pagosMes: mes.length,
    ingresosTotal: ok.reduce((t, x) => t + x.monto, 0),
    rechazadosMes: (pays ?? []).filter((x) => x.estado === "rechazado" && x.created_at >= ago(30)).length,
    canceladasMes: (subs ?? []).filter((x) => x.estado === "cancelada" && x.updated_at >= ago(30)).length,
    pagos: (pays ?? []).filter((x) => x.estado !== "pendiente").slice(0, 100).map((x) => ({ ...x, hogar: x.household_id ? nombre.get(x.household_id) ?? "Hogar" : "—" })),
  }
}

/** Regala Premium (cortesía) al hogar propio de una persona hasta una fecha. */
export async function adminGrantPremium(householdId: string, hasta: string, nota: string) {
  const ctx = await requirePlatformAdmin()
  const d = z.object({ householdId: z.uuid(), hasta: z.iso.date(), nota: z.string().trim().max(200) }).parse({ householdId, hasta, nota })
  if (new Date(d.hasta) <= new Date()) throw new Error("La fecha debe ser futura.")
  const db = supabaseAdmin()
  const { error } = await db.from("plan_subscriptions").insert({ household_id: d.householdId, proveedor: "manual", estado: "cortesia", periodo: "mes", vence_at: new Date(`${d.hasta}T23:59:59-05:00`).toISOString(), nota: d.nota || null, created_by: ctx.user.id })
  if (error) throw new Error(error.message)
  const { data: owners } = await db.from("household_members").select("user_id").eq("household_id", d.householdId).eq("role", "owner")
  if (owners?.length) await db.from("notifications").insert(owners.map((o) => ({ user_id: o.user_id, kind: "plan", titulo: "¡Te regalamos Mirai Premium!", cuerpo: `Disfruta todas las funciones Premium hasta el ${new Date(`${d.hasta}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}.`, href: "/ajustes?tab=plan", dedupe: `gift-${d.householdId}-${Date.now()}` })))
}

/** Quita el Premium de cortesía vigente de un hogar. */
export async function adminRevokeCourtesy(householdId: string) {
  await requirePlatformAdmin()
  const { error } = await supabaseAdmin().from("plan_subscriptions").update({ estado: "vencida", vence_at: new Date().toISOString() }).eq("household_id", z.uuid().parse(householdId)).eq("estado", "cortesia")
  if (error) throw new Error(error.message)
}
