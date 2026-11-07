"use client"

import { useQuery } from "@/lib/query"
import { createClient } from "@/utils/supabase/client"
import { useApp } from "@/components/app/app-context"
import { apiOn } from "@/lib/api/session"
import { readWithFallback } from "@/lib/api/book-tables"
import { fetchBookSettings } from "@/features/settings/prefs"

/** Los 9 pasos de la puesta en marcha (SETUP de la v4, textos literales). */
export const SETUP_STEPS = [
  { k: "perfil", iso: "perfil", t: "Cuéntanos quién eres", d: "Tu nombre y, si quieres, los integrantes de tu familia. Así personalizamos el libro y el presupuesto por miembro.", href: "/perfil", btn: "Completar perfil" },
  { k: "ingresos", iso: "ingresos", t: "Registra tus ingresos", d: "Tu salario, honorarios o arriendos, y cada cuánto te pagan. Es lo más importante: sin esto no podemos decirte cuánto te queda ni si te alcanza para algo.", href: "/ingresos?nuevo=1", btn: "Agregar ingreso" },
  { k: "cuentas", iso: "balance", t: "Agrega tus cuentas y efectivo", d: "Cuánto tienes hoy en el banco, en Nequi o en efectivo. Sirve para calcular tu colchón de emergencia y tu patrimonio.", href: "/balance?nuevo=activo", btn: "Agregar cuenta" },
  { k: "fijos", iso: "fijos", t: "Anota tus gastos fijos", d: "Arriendo, servicios, administración, colegio… Te avisaremos antes de cada fecha de pago.", href: "/fijos?nuevo=1", btn: "Agregar gasto fijo", skip: "No tengo gastos fijos" },
  { k: "deudas", iso: "le-debo", t: "Registra tus deudas y créditos", d: "Créditos con bancos, tarjetas o plata que le debes a alguien. Verás cuánto te falta y cuándo pagar.", href: "/le-debo?nuevo=1", btn: "Agregar deuda", skip: "No tengo deudas" },
  { k: "prestamos", iso: "me-deben", t: "¿Le prestaste plata a alguien?", d: "Registra a quién y cómo te va a pagar, para que no se te olvide cobrar.", href: "/me-deben?nuevo=1", btn: "Registrar préstamo", skip: "Nadie me debe" },
  { k: "presupuesto", iso: "presupuesto", t: "Ponle tope a tus gastos", d: "Escribe cuánto quieres gastar como máximo en mercado, transporte, restaurantes… Te avisamos si te acercas al límite.", href: "/presupuesto", btn: "Definir presupuesto", skip: "Lo hago después" },
  { k: "gasto", iso: "gastos", t: "Registra tu primer gasto", d: "Escribe en qué gastaste y la categoría se pone sola. Hazlo cada día: toma segundos y es lo que hace funcionar todo.", href: "/gastos?nuevo=1", btn: "Registrar gasto" },
  { k: "meta", iso: "metas", t: "Crea una meta de ahorro", d: "Un viaje, la cuota inicial de la casa o tu fondo de emergencia. Te decimos cuánto guardar cada mes.", href: "/metas?nuevo=1", btn: "Crear meta", skip: "Ahora no" },
] as const

export type SetupState = { skip: Record<string, boolean>; dismissed: boolean }

type Counts = { ingresos: number; fijos: number; gastos: number; metas: number; cuentas: number; deudas: number; prestamos: number; topes: number }

/** Lo que dice cada paso: nombre del perfil, estado guardado (book_settings.setup) y conteos de lo vivo del libro. */
async function loadSetup(bookId: string, userId: string): Promise<{ nombre: string; setup: unknown; c: Counts }> {
  // V7-H2: con `books` encendido, ajustes y conteos por la API (GET …/settings y …/setup-counts); el nombre por
  // GET /v1/me/profile (interruptor `me`). Apagado: las mismas consultas de siempre a Supabase (rama heredada).
  if (apiOn("books")) {
    const legacy = () => loadSetupLegacy(bookId, userId)
    return readWithFallback(async () => {
      const { browserApi, unwrap } = await import("@/lib/api/client")
      const a = browserApi()
      const [settings, c, nombre] = await Promise.all([
        fetchBookSettings(bookId),
        a.books.setupCounts({ params: { bookId } }).then(unwrap),
        fetchProfileName(userId),
      ])
      return { nombre, setup: settings.setup, c }
    }, legacy)
  }
  return loadSetupLegacy(bookId, userId)
}

async function fetchProfileName(userId: string): Promise<string> {
  if (!apiOn("me")) return (await createClient().from("profiles").select("nombre").eq("id", userId).single()).data?.nombre ?? ""
  const { browserApi, unwrap } = await import("@/lib/api/client")
  return unwrap(await browserApi().me.profile()).nombre ?? ""
}

async function loadSetupLegacy(bookId: string, userId: string) {
  const sb = createClient()
  const count = async (t: "incomes" | "fixed_expenses" | "expenses" | "goals", extra?: (q: never) => never) => {
    let q = sb.from(t).select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null)
    if (extra) q = extra(q as never)
    return (await q).count ?? 0
  }
  const [profile, settings, ingresos, fijos, gastos, metas, cuentas, deudas, prestamos, topes] = await Promise.all([
    sb.from("profiles").select("nombre").eq("id", userId).single(),
    sb.from("book_settings").select("setup").eq("book_id", bookId).single(),
    count("incomes"), count("fixed_expenses"), count("expenses"), count("goals"),
    sb.from("assets").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null).like("cod", "11%"),
    sb.from("loans").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null).eq("kind", "pagar"),
    sb.from("loans").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null).eq("kind", "cobrar"),
    sb.from("categories").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null).gt("tope", 0),
  ])
  return {
    nombre: profile.data?.nombre ?? "",
    setup: settings.data?.setup,
    c: { ingresos, fijos, gastos, metas, cuentas: cuentas.count ?? 0, deudas: deudas.count ?? 0, prestamos: prestamos.count ?? 0, topes: topes.count ?? 0 },
  }
}

/** Estado de cada paso a partir de los datos reales del libro. */
export function useSetupProgress() {
  const { book, user } = useApp()
  return useQuery({
    queryKey: ["b", book.id, "setup-progress"],
    queryFn: async () => {
      const { nombre, setup: saved, c } = await loadSetup(book.id, user.id)
      const ok: Record<string, boolean> = {
        perfil: !!nombre, ingresos: c.ingresos > 0, cuentas: c.cuentas > 0, fijos: c.fijos > 0,
        deudas: c.deudas > 0, prestamos: c.prestamos > 0, presupuesto: c.topes > 0, gasto: c.gastos > 0, meta: c.metas > 0,
      }
      const setup = { skip: {}, dismissed: false, ...(saved as Partial<SetupState> | null) } as SetupState
      const steps = SETUP_STEPS.map((s) => ({ ...s, ok: ok[s.k], skipped: !ok[s.k] && !!setup.skip[s.k] }))
      const done = steps.filter((s) => s.ok || s.skipped).length
      return { steps, done, total: steps.length, next: steps.find((s) => !s.ok && !s.skipped) ?? null, setup, finished: setup.dismissed || done === steps.length }
    },
  })
}
