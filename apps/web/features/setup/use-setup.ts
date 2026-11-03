"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/utils/supabase/client"
import { useApp } from "@/components/app/app-context"

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

/** Estado de cada paso a partir de los datos reales del libro. */
export function useSetupProgress() {
  const { book, user } = useApp()
  return useQuery({
    queryKey: ["b", book.id, "setup-progress"],
    queryFn: async () => {
      const sb = createClient()
      const count = async (t: "incomes" | "fixed_expenses" | "expenses" | "goals", extra?: (q: never) => never) => {
        let q = sb.from(t).select("id", { count: "exact", head: true }).eq("book_id", book.id).is("deleted_at", null)
        if (extra) q = extra(q as never)
        return (await q).count ?? 0
      }
      const [profile, settings, ingresos, fijos, gastos, metas, cuentas, deudas, prestamos, topes] = await Promise.all([
        sb.from("profiles").select("nombre").eq("id", user.id).single(),
        sb.from("book_settings").select("setup").eq("book_id", book.id).single(),
        count("incomes"), count("fixed_expenses"), count("expenses"), count("goals"),
        sb.from("assets").select("id", { count: "exact", head: true }).eq("book_id", book.id).is("deleted_at", null).like("cod", "11%"),
        sb.from("loans").select("id", { count: "exact", head: true }).eq("book_id", book.id).is("deleted_at", null).eq("kind", "pagar"),
        sb.from("loans").select("id", { count: "exact", head: true }).eq("book_id", book.id).is("deleted_at", null).eq("kind", "cobrar"),
        sb.from("categories").select("id", { count: "exact", head: true }).eq("book_id", book.id).is("deleted_at", null).gt("tope", 0),
      ])
      const ok: Record<string, boolean> = {
        perfil: !!profile.data?.nombre, ingresos: ingresos > 0, cuentas: (cuentas.count ?? 0) > 0, fijos: fijos > 0,
        deudas: (deudas.count ?? 0) > 0, prestamos: (prestamos.count ?? 0) > 0, presupuesto: (topes.count ?? 0) > 0, gasto: gastos > 0, meta: metas > 0,
      }
      const setup = { skip: {}, dismissed: false, ...(settings.data?.setup as Partial<SetupState> | null) } as SetupState
      const steps = SETUP_STEPS.map((s) => ({ ...s, ok: ok[s.k], skipped: !ok[s.k] && !!setup.skip[s.k] }))
      const done = steps.filter((s) => s.ok || s.skipped).length
      return { steps, done, total: steps.length, next: steps.find((s) => !s.ok && !s.skipped) ?? null, setup, finished: setup.dismissed || done === steps.length }
    },
  })
}
