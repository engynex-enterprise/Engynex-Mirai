// Armado puro de las vistas de la consola (mismas cuentas que features/admin/actions.ts y server.ts de apps/web).
// Reciben las filas ya cargadas y `now`, sin montos ni movimientos de los hogares.
import { ROLE_INFO, toAccess } from "@mirai/domain/household/roles"
import { mrr, vigente } from "@mirai/domain/plans"
import type { AdminUser } from "../account/identity-admin"
import type { AuditActivity, MemberRow, PayRow, ProfileRow, SubRow } from "./admin.repository"

export const DAY = 86_400_000
export const agoIso = (d: number, now = Date.now()) => new Date(now - d * DAY).toISOString()

/** Promedio y distribución de las calificaciones (ratingStats de apps/web/lib/content/opiniones.ts). */
export function ratingStats(ratings: number[]) {
  const dist = [1, 2, 3, 4, 5].map((n) => ratings.filter((r) => r === n).length)
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
  return { avg, count: ratings.length, dist }
}

export const accesoDe = (u: Pick<AdminUser, "app_metadata">) => u.app_metadata.providers?.join(", ") || u.app_metadata.provider || "email"

/** Resumen: personas, actividad de los últimos 30 días y calificación promedio. */
export function overview(i: { users: AdminUser[]; members: Pick<MemberRow, "household_id">[]; books: number; audit: AuditActivity[]; feedback: { tipo: string; rating: number | null; estado: string }[] }, now = Date.now()) {
  const since = (d: number) => i.users.filter((u) => u.created_at >= agoIso(d, now)).length
  const active = (d: number) => i.users.filter((u) => (u.last_sign_in_at ?? "") >= agoIso(d, now)).length
  const days = Array.from({ length: 30 }, (_, k) => new Date(now - (29 - k) * DAY).toISOString().slice(0, 10))
  const byDay = days.map((d) => {
    const r = i.audit.filter((x) => x.created_at.slice(0, 10) === d)
    return { d, acciones: r.length, personas: new Set(r.map((x) => x.actor).filter(Boolean)).size }
  })
  const porSeccion = Object.entries(i.audit.reduce<Record<string, number>>((a, x) => ((a[x.tabla] = (a[x.tabla] ?? 0) + 1), a), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tabla, n]) => ({ tabla, n }))
  return {
    personas: i.users.length, nuevos7: since(7), nuevos30: since(30), activos7: active(7), activos30: active(30),
    hogares: new Set(i.members.map((m) => m.household_id)).size, libros: i.books, acciones30: i.audit.length, byDay, porSeccion,
    rating: ratingStats(i.feedback.filter((x) => x.tipo === "calificacion" && x.rating).map((x) => x.rating!)),
    opinionesNuevas: i.feedback.filter((x) => x.estado === "nuevo").length,
    erroresAbiertos: i.feedback.filter((x) => x.tipo === "error" && !["hecho", "descartado"].includes(x.estado)).length,
  }
}

/** Clientes: cada cuenta con su hogar, plan, último ingreso y actividad del último mes. */
export function clients(i: { users: AdminUser[]; profiles: ProfileRow[]; members: MemberRow[]; actors: { actor: string | null }[]; subs: Pick<SubRow, "household_id" | "vence_at">[]; admins: string[] }, now = new Date()) {
  const adminIds = new Set(i.admins)
  const premiumUntil = new Map<string, string>()
  for (const x of i.subs) if (vigente(x.vence_at, now) && (!premiumUntil.has(x.household_id) || x.vence_at! > premiumUntil.get(x.household_id)!)) premiumUntil.set(x.household_id, x.vence_at!)
  const prof = new Map(i.profiles.map((p) => [p.id, p]))
  const acts = i.actors.reduce<Record<string, number>>((a, x) => (x.actor ? ((a[x.actor] = (a[x.actor] ?? 0) + 1), a) : a), {})
  return i.users
    .map((u) => {
      const p = prof.get(u.id)
      const hs = i.members.filter((m) => m.user_id === u.id)
      const own = hs.find((m) => m.role === "owner")
      const vence = hs.map((m) => premiumUntil.get(m.household_id)).filter(Boolean).sort().pop() ?? null
      const premium = !!vence || adminIds.has(u.id) || hs.some((m) => i.members.some((x) => x.household_id === m.household_id && x.role === "owner" && adminIds.has(x.user_id)))
      return {
        id: u.id, email: u.email ?? "", nombre: p?.nombre || "", avatar: p?.avatar_url ?? null, telefono: p?.telefono ?? "",
        creado: u.created_at, ultimoIngreso: u.last_sign_in_at ?? null, acceso: accesoDe(u),
        hogares: hs.map((m) => `${m.households?.nombre ?? "Hogar"}${m.role === "owner" ? "" : ` (${ROLE_INFO[toAccess(m.access_role, m.role)].label.toLowerCase()})`}`),
        plan: premium ? ("Premium" as const) : ("Gratis" as const), premiumHasta: vence, hogarPropio: own?.household_id ?? null, acciones30: acts[u.id] ?? 0,
      }
    })
    .sort((a, b) => b.creado.localeCompare(a.creado))
}

/** Hogares con personas, libros, dueño y plan (los que no tienen personas no se muestran). */
export function households(i: { households: { id: string; nombre: string; created_at: string }[]; members: MemberRow[]; books: { household_id: string; deleted_at: string | null }[]; subs: Pick<SubRow, "household_id" | "plan" | "estado" | "vence_at" | "proveedor">[]; profiles: ProfileRow[]; activity: { household_id?: string | null }[]; admins: string[] }, now = new Date()) {
  const adminIds = new Set(i.admins)
  const prof = new Map(i.profiles.map((p) => [p.id, p]))
  return i.households
    .map((h) => {
      const ms = i.members.filter((m) => m.household_id === h.id)
      const owner = ms.find((m) => m.role === "owner")
      const sub = i.subs.filter((s) => s.household_id === h.id && vigente(s.vence_at, now)).sort((a, b) => (b.vence_at ?? "").localeCompare(a.vence_at ?? ""))[0]
      return {
        id: h.id, nombre: h.nombre, creado: h.created_at, integrantes: ms.length, libros: i.books.filter((b) => b.household_id === h.id && !b.deleted_at).length,
        dueno: owner ? { id: owner.user_id, nombre: prof.get(owner.user_id)?.nombre ?? "", email: prof.get(owner.user_id)?.email ?? "" } : null,
        plan: sub?.plan ?? (owner && adminIds.has(owner.user_id) ? "premium" : "gratis"), vence: sub?.vence_at ?? null, proveedor: sub?.proveedor ?? null,
        acciones30: i.activity.filter((a) => a.household_id === h.id).length,
      }
    })
    .filter((h) => h.integrantes > 0)
    .sort((a, b) => b.creado.localeCompare(a.creado))
}

/** Ingresos de Mirai: MRR estimado, suscriptores, pagos del mes y recientes. */
export function revenue(i: { subs: Pick<SubRow, "periodo" | "estado" | "proveedor" | "vence_at" | "updated_at">[]; pays: PayRow[]; premium: { precio_mes: number; precio_anio: number } | null; households: { id: string; nombre: string }[] }, now = Date.now()) {
  const vivos = i.subs.filter((x) => vigente(x.vence_at, new Date(now)) && x.estado !== "pendiente")
  const ok = i.pays.filter((x) => x.estado === "aprobado")
  const mes = ok.filter((x) => (x.paid_at ?? x.created_at) >= agoIso(30, now))
  const nombre = new Map(i.households.map((h) => [h.id, h.nombre]))
  return {
    mrr: Math.round(mrr(vivos, i.premium?.precio_mes ?? 14900, i.premium?.precio_anio ?? 149000)),
    pagando: vivos.filter((x) => x.proveedor !== "manual").length,
    cortesia: vivos.filter((x) => x.proveedor === "manual").length,
    porProveedor: (["mercadopago", "wompi"] as const).map((p) => ({ p, n: vivos.filter((x) => x.proveedor === p).length })),
    ingresosMes: mes.reduce((t, x) => t + x.monto, 0), pagosMes: mes.length,
    ingresosTotal: ok.reduce((t, x) => t + x.monto, 0),
    rechazadosMes: i.pays.filter((x) => x.estado === "rechazado" && x.created_at >= agoIso(30, now)).length,
    canceladasMes: i.subs.filter((x) => x.estado === "cancelada" && x.updated_at >= agoIso(30, now)).length,
    pagos: i.pays.filter((x) => x.estado !== "pendiente").slice(0, 100).map((x) => ({ ...x, hogar: x.household_id ? nombre.get(x.household_id) ?? "Hogar" : "—" })),
  }
}
