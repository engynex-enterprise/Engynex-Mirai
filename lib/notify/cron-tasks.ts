import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { loadBookData } from "@/lib/book-data"
import { snapshotMes, type ExtrasIntegral } from "@/lib/domain/flujo-integral"
import { todayBogota } from "@/lib/domain"
import { brandEmail } from "./email"
import { deliverOnce, emailProvider, type Msg } from "./digest"
import { siteUrl } from "@/lib/site-url"

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

/** Correo de un aviso del plan (pago aprobado o rechazado, Premium por vencer o vencido, regalos). */
export function planMsg(nombre: string, n: { titulo: string; cuerpo: string; href: string | null }): Msg {
  const first = nombre.split(" ")[0] || ""
  const url = `${siteUrl()}${n.href || "/ajustes?tab=plan"}`
  return {
    subject: `Mirai: ${n.titulo}`,
    html: brandEmail(`${first ? `${esc(first)}, ` : ""}${esc(n.titulo.charAt(0).toLowerCase() + n.titulo.slice(1))}`, `<p>${esc(n.cuerpo)}</p><p style="margin-top:20px"><a href="${url}" style="background:#1F2B4B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Ver mi plan</a></p>`),
    text: `Hola ${first}. ${n.titulo}. ${n.cuerpo}\n\n${url}`,
    push: { title: n.titulo, body: n.cuerpo.slice(0, 180) },
    wa: { nombre: first, cantidad: "1", resumen: `${n.titulo}: ${n.cuerpo}`, fecha: "", enlace: url, titulo: n.titulo, detalle: n.cuerpo, monto: "" },
    caso: "resumen",
  }
}

/**
 * Correo por cada aviso del plan de las últimas 24 horas (los crean lib/payments/apply.ts al aprobarse o rechazarse un pago,
 * lib/payments/reminders.ts cuando Premium está por vencer o venció, y la consola al regalar días). Es un correo de la cuenta:
 * sale aunque la persona no tenga el resumen por correo. Una sola vez por aviso (clave plan:<id del aviso>).
 */
export async function planEmails(now = new Date()) {
  const db = supabaseAdmin()
  const { data: list } = await db.from("notifications").select("id,user_id,titulo,cuerpo,href").eq("kind", "plan").gte("created_at", new Date(now.getTime() - 86_400_000).toISOString()).order("created_at").limit(200)
  if (!list?.length) return 0
  const users = [...new Set(list.map((n) => n.user_id))]
  const [{ data: profs }, { data: mems }] = await Promise.all([
    db.from("profiles").select("id,email,nombre").in("id", users),
    db.from("household_members").select("user_id,household_id").in("user_id", users),
  ])
  const ready = new Map<string, boolean>()
  let n = 0
  for (const x of list) {
    const p = profs?.find((y) => y.id === x.user_id)
    const h = mems?.find((m) => m.user_id === x.user_id)?.household_id
    if (!p?.email || !h) continue
    if (!ready.has(h)) ready.set(h, !!(await emailProvider(h)))
    if (!ready.get(h)) continue
    try {
      const r = await deliverOnce({ householdId: h, userId: x.user_id, canal: "email", emailTo: p.email, whatsappTo: null, kind: "plan", dedupe: `plan:${x.id}` }, planMsg(p.nombre ?? "", x))
      if (r.sent) n++
    } catch { /* ya quedó en el registro de envíos; se reintenta en la próxima pasada */ }
  }
  return n
}

const prevMonthEnd = (hoy: string) => { const d = new Date(`${hoy.slice(0, 7)}-01T12:00:00`); d.setDate(0); return d.toISOString().slice(0, 10) }

/**
 * Foto mensual del patrimonio desde el servidor (el día 1): guarda la del mes que terminó y la del que empieza para los
 * libros con personas, SOLO si no existen (la del Balance, que se guarda al abrirlo, es más completa y no se pisa).
 */
export async function patrimonioSnapshots(now = new Date()) {
  const hoy = todayBogota(now)
  if (!hoy.endsWith("-01")) return 0
  const db = supabaseAdmin()
  const { data: mem } = await db.from("household_members").select("household_id")
  const hs = [...new Set((mem ?? []).map((m) => m.household_id))]
  if (!hs.length) return 0
  const { data: books } = await db.from("books").select("id").in("household_id", hs).is("deleted_at", null)
  let n = 0
  for (const b of books ?? []) {
    try {
      const [book, { data: fondo }, { data: alw }, { data: movs }] = await Promise.all([
        loadBookData(db, b.id),
        db.from("fund_movements").select("fecha,valor,tipo,expense_id").eq("book_id", b.id).is("deleted_at", null),
        db.from("allowances").select("id,mesada,frec").eq("book_id", b.id).is("deleted_at", null),
        db.from("allowance_movements").select("allowance_id,fecha,valor").eq("book_id", b.id).is("deleted_at", null),
      ])
      const X: ExtrasIntegral = {
        fondo: (fondo ?? []).map((f) => ({ fecha: f.fecha, valor: +f.valor, tipo: f.tipo, expense_id: f.expense_id })),
        mesadas: (alw ?? []).map((a) => ({ id: a.id, nombre: "", mesada: +a.mesada, frec: a.frec, movs: (movs ?? []).filter((m) => m.allowance_id === a.id).map((m) => ({ fecha: m.fecha, valor: +m.valor })) })),
      }
      const rows = [snapshotMes(book, prevMonthEnd(hoy), X), snapshotMes(book, hoy, X)].filter((s) => [s.activos, s.deudas, s.patrimonio].every(Number.isFinite))
      const { data } = await db.from("net_worth_snapshots").upsert(rows.map((s) => ({ book_id: b.id, ...s })), { onConflict: "book_id,mes", ignoreDuplicates: true }).select("mes")
      n += data?.length ?? 0
    } catch { /* un libro con datos raros no detiene a los demás */ }
  }
  return n
}
