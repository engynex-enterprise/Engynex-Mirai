"use client"

import { useMemo } from "react"
import { useQuery } from "@/lib/query"
import { useBookId } from "@/components/app/app-context"
import { useList } from "@/hooks/use-book-data"
import { qk } from "@/lib/supabase/tables"
import { calcRenta, smmlvFor, titularId } from "@/lib/domain"
import { esImpuesto, type ExtrasIntegral } from "@/lib/domain/flujo-integral"
import type { LoadedBook } from "@/lib/book-data"
import { calEst, nextOcc } from "@/features/agenda/fiscal"
import { rentaInput } from "@/features/renta/data"
import { useIncomeCategories, useMembers } from "@/features/catalogs/hooks"

/** La Declaración para el estimado de la renta: GET /v1/books/:b/renta (endpoint del titular del contador). */
async function loadRenta(bookId: string) {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  return unwrap(await browserApi().accountantOwner.renta({ params: { bookId } }))
}

type Cal = LoadedBook["calendarEvents"][number] & { anual?: boolean | null; template_key?: string | null; cat?: string | null }
const isRenta = (e: Cal) => e.template_key === "renta" || /declaraci[oó]n de renta/i.test(e.titulo)

/**
 * Lo que el flujo integral necesita y no viaja en el libro: el estimado de los impuestos del calendario sin valor
 * (predial y vehicular con tus bienes, la renta con el borrador de la Declaración), las mesadas y el fondo de
 * emergencia. Mientras carga devuelve lo que tenga: el Balance y el Dashboard se pintan igual y se completan solos.
 */
export function useIntegralExtras(book: LoadedBook | undefined, today: string): ExtrasIntegral {
  const bookId = useBookId()
  const { data: taxAssets = [] } = useList("tax_assets")
  const { data: incCats = [] } = useIncomeCategories()
  const { data: allowances = [] } = useList("allowances")
  const { data: movs = [] } = useList("allowance_movements")
  const { data: fondo = [] } = useList("fund_movements")
  const { data: members = [] } = useMembers()
  const needRenta = ((book?.calendarEvents ?? []) as Cal[]).some((e) => isRenta(e) && !+e.monto)
  // Misma clave que el Calendario fiscal: la Declaración se carga una sola vez para las dos pantallas.
  const { data: renta } = useQuery({ queryKey: qk(bookId, "renta"), enabled: needRenta, queryFn: () => loadRenta(bookId) })

  return useMemo(() => {
    const X: ExtrasIntegral = {}
    if (book) {
      const smmlv = smmlvFor(+today.slice(0, 4), (book.raw.settings as { smmlv?: Record<string, number> }).smmlv)
      const bienes = taxAssets.map((a) => ({ ...a, avaluo: Number(a.avaluo), predial: a.predial == null ? null : Number(a.predial), imp_veh: a.imp_veh == null ? null : Number(a.imp_veh), soat: a.soat == null ? null : Number(a.soat), pct: Number(a.pct) || 100 }))
      const est: NonNullable<ExtrasIntegral["estimados"]> = {}
      for (const e of book.calendarEvents as Cal[]) {
        if (e.tipo !== "egreso" || +e.monto > 0 || !esImpuesto(e)) continue
        if (isRenta(e)) {
          if (!renta) continue
          const y = +nextOcc({ fecha: e.fecha, anual: !!e.anual }, today).slice(0, 4) - 1, mid = titularId(renta.members)
          const C = calcRenta(rentaInput(renta, y, mid), y, mid, today)
          if (C.saldo > 0) est[e.id] = { v: C.saldo, how: `con el borrador de tu Declaración ${y}` }
          continue
        }
        const r = calEst(e, book, bienes, smmlv, incCats)
        if (r && r.v > 0) est[e.id] = { v: r.v, how: r.how.replace(/\.$/, "").toLowerCase() }
      }
      X.estimados = est
    }
    const nombre = new Map(members.map((m) => [m.id, m.nombre]))
    X.mesadas = allowances.map((a) => ({
      id: a.id, nombre: nombre.get(a.member_id) ?? "tu hijo", mesada: Number(a.mesada ?? 0), frec: a.frec ?? "semanal",
      movs: movs.filter((m) => m.allowance_id === a.id).map((m) => ({ fecha: m.fecha, valor: Number(m.valor) })),
    }))
    X.fondo = fondo.map((f) => ({ fecha: f.fecha, valor: Number(f.valor), tipo: f.tipo, expense_id: f.expense_id }))
    return X
  }, [book, today, taxAssets, incCats, allowances, movs, fondo, members, renta])
}
