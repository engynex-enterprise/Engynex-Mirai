"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/utils/supabase/client"
import { useBookId } from "@/components/app/app-context"
import { qk } from "@/lib/supabase/tables"
import type { BookData, SettingsIn } from "@/lib/domain"

const alive = <T extends { deleted_at?: string | null }>(rows: T[] | null | undefined) => (rows ?? []).filter((r) => !r.deleted_at)
const num = (v: unknown) => Number(v ?? 0)

/**
 * Todo el libro en la forma que esperan los cálculos de lib/domain (totales, quincena, agenda, flujo…).
 * Una sola consulta con clave "summary": se refresca ante cualquier cambio del libro (incluido Realtime).
 */
export function useBookData() {
  const bookId = useBookId()
  return useQuery({
    queryKey: qk(bookId, "summary"),
    staleTime: 15_000,
    queryFn: async (): Promise<BookData & { raw: { settings: Record<string, unknown> } }> => {
      const sb = createClient()
      const by = <T extends string>(t: T) => sb.from(t as never).select("*").eq("book_id" as never, bookId as never).is("deleted_at" as never, null)
      const [settings, categories, incomes, extras, expenses, fixed, subs, loans, cards, assets, liabilities, investments, goals, events, contacts, entities] = await Promise.all([
        sb.from("book_settings").select("*").eq("book_id", bookId).single(),
        by("categories"), by("incomes"), by("extra_incomes"), by("expenses"),
        sb.from("fixed_expenses").select("*, fixed_expense_payments(*)").eq("book_id", bookId).is("deleted_at", null),
        by("subscriptions"),
        sb.from("loans").select("*, loan_payments(*)").eq("book_id", bookId).is("deleted_at", null),
        sb.from("credit_cards").select("*, card_purchases(*)").eq("book_id", bookId).is("deleted_at", null),
        by("assets"), by("liabilities"), by("investments"), by("goals"), by("calendar_events"), by("contacts"), by("entities"),
      ])
      const err = [settings, categories, incomes, extras, expenses, fixed, subs, loans, cards, assets, liabilities, investments, goals, events, contacts, entities].find((r) => r.error)
      if (err?.error) throw new Error(err.error.message)
      const s = settings.data!
      const st: SettingsIn = {
        umbral: num(s.umbral), limite: num(s.limite), trm: s.trm as Record<string, number>, pct: s.pct as SettingsIn["pct"],
        emerg_meta: s.emerg_meta, anticipo: s.anticipo, corte_q: s.corte_q, alerta_pres: s.alerta_pres,
        notif: s.notif as SettingsIn["notif"], uvt: s.uvt as Record<string, number>, smmlv: s.smmlv as Record<string, number>,
      }
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const D = (r: { data: unknown }) => (r.data ?? []) as any[]
      return {
        raw: { settings: s as unknown as Record<string, unknown> },
        settings: st,
        categories: D(categories),
        incomes: D(incomes).filter((i) => i.activo !== false),
        extraIncomes: D(extras),
        expenses: D(expenses),
        fixedExpenses: D(fixed).map((f) => ({ ...f, payments: alive(f.fixed_expense_payments) })),
        subscriptions: D(subs).filter((x) => x.activa !== false && x.proximo),
        loans: D(loans).map((l) => ({ ...l, extra: num(l.extra), payments: alive(l.loan_payments) })),
        creditCards: D(cards).map((c) => ({ ...c, cupo: num(c.cupo), purchases: alive(c.card_purchases) })),
        assets: D(assets),
        liabilities: D(liabilities),
        investments: D(investments),
        goals: D(goals),
        calendarEvents: D(events),
        contacts: D(contacts),
        entities: D(entities),
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */
    },
  })
}
