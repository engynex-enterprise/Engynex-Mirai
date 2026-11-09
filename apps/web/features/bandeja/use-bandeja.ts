"use client"

import { useMemo } from "react"
import type { LoadedBook } from "@/lib/book-data"
import { flujoIntegral, type ExtrasIntegral } from "@/lib/domain/flujo-integral"
import { cambio, desglose, idsHormiga, movsBandeja, nombrePeriodo, periodoAnterior, periodoBandeja, resumenBandeja, teAlcanza, tituloPeriodo, type TipoBandeja } from "@/lib/domain/bandeja"
import { posiblesDobles } from "@/lib/domain/dobles"
import { conTope, presupuestoCategorias } from "@/lib/domain/presupuesto"

/**
 * Todas las cifras de la bandeja para un periodo: sale de `flujoIntegral` y de las funciones de `@mirai/domain/bandeja`
 * (la vista solo formatea). `ref` es un día del periodo que se ve; `conAhorro` suma los aportes a metas y al fondo.
 */
export function useBandeja(book: LoadedBook | undefined, X: ExtrasIntegral, today: string, tipo: TipoBandeja, ref: string, conAhorro: boolean) {
  return useMemo(() => {
    if (!book) return null
    const P = periodoBandeja(book, tipo, ref, today)
    const F = flujoIntegral(book, P, today, X)
    const movs = movsBandeja(F, conAhorro)
    const R = resumenBandeja(movs)
    // El mismo periodo de antes (octubre para noviembre, la 1ª quincena de octubre para la de noviembre…).
    const PA = periodoAnterior(book, tipo, ref, today)
    const RA = resumenBandeja(movsBandeja(flujoIntegral(book, PA, today, X), conAhorro))
    // Presupuesto: el del mes de hoy si cae en el periodo; si no, el del primer mes del periodo.
    const mes = today >= P.a && today <= P.b ? today.slice(0, 7) : P.a.slice(0, 7)
    const pres = conTope(presupuestoCategorias(book, mes))
    return {
      P, F, movs, R, RA,
      titulo: tituloPeriodo(tipo, P),
      antes: nombrePeriodo(tipo, PA),
      cmp: { total: cambio(R.total, RA.total), pagado: cambio(R.pagado, RA.pagado), intereses: cambio(R.intereses, RA.intereses) },
      alcanza: teAlcanza(book, F, today),
      porModulo: desglose(movs, "modulo"),
      porCat: desglose(movs, "cat"),
      dobles: posiblesDobles(book, P.a, P.b, today),
      hormiga: idsHormiga(book, today, P),
      pres, mesPres: mes,
      /** Lo estimado del presupuesto que está dentro de «Sale» (aún no se gasta). */
      presupuesto: movs.filter((m) => m.modulo === "presupuesto").reduce((a, m) => a + m.v, 0),
    }
  }, [book, X, today, tipo, ref, conAhorro])
}

export type Bandeja = NonNullable<ReturnType<typeof useBandeja>>
