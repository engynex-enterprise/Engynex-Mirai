// Empeño con refrendo mes a mes (casas de empeño y compraventas): cada mes se paga el "refrendo" (el interés sobre lo
// prestado) para no perder el objeto; el refrendo NO baja la deuda. Para recuperar el objeto se paga lo prestado (más
// lo que falte del mes, según la casa). Un abono a capital, si la casa lo acepta, baja el refrendo de los meses que
// siguen. Puro: lo usan el formulario, el detalle de la deuda y el Consejero.
import { eaDeMensual, loanEngine, type EngineLoan } from "./loans"
import type { DateInput } from "./types"

export type EmpenoResumen = {
  /** Lo que falta de lo prestado (capital). */
  capital: number
  /** Refrendo de cada mes con el capital de hoy. */
  refrendoMes: number
  /** Refrendos (meses) ya pagados. */
  refrendos: number
  /** Total pagado en refrendos (intereses). */
  interesesPagados: number
  /** Intereses pagados como parte de lo prestado (0,5 = la mitad). */
  pctDelPrestamo: number
  /** Refrendos atrasados y lo que suman. */
  atrasados: number
  atrasadoValor: number
  /** Próximo refrendo (fecha y valor). */
  proximo: { fecha: string; valor: number } | null
  /** Para recuperar el objeto hoy: lo prestado que falta + refrendos atrasados. */
  paraRecuperar: number
  /** Meses de refrendo que faltan para haber pagado en intereses lo mismo que te prestaron (0 = ya pasó). */
  mesesParaIgualar: number
  /** Para recuperarlo si la casa cobra además el refrendo del mes que va corriendo. */
  paraRecuperarConMes: number
  /** Refrendos que faltan para que lo pagado + lo que debes supere lo que vale el objeto (0 = ya lo superó; null = sin valor). */
  refrendosParaValor: number | null
  /** Tasa efectiva anual del refrendo (fracción). */
  ea: number
  /** Veces la tasa de usura (E.A.) que se pasó; null si no se conoce la usura. */
  vecesUsura: number | null
}

/** Resumen de un empeño con refrendo (también sirve para uno de plazo fijo: lo pagado y lo que falta). */
export function empenoResumen(L: EngineLoan, today: DateInput, o: { usuraEA?: number } = {}): EmpenoResumen {
  const e = loanEngine(L, today)
  const prestado = +L.monto || 0
  const r0 = (v: number) => Math.round(v)
  const refrendoMes = r0(e.saldo * e.i)
  const atrasadas = e.vencidas
  const atrasadoValor = r0(atrasadas.reduce((a, r) => a + r.int + r.extra, 0))
  const intPag = r0(e.intPag)
  const faltaIgualar = prestado - intPag
  const ea = eaDeMensual(+L.tasa || 0)
  return {
    capital: r0(e.saldo),
    refrendoMes,
    refrendos: e.hist.filter((h) => h.tipo === "cuota").length,
    interesesPagados: intPag,
    pctDelPrestamo: prestado > 0 ? intPag / prestado : 0,
    atrasados: atrasadas.length,
    atrasadoValor,
    proximo: e.next ? { fecha: e.next.fecha, valor: r0(e.next.int + e.next.extra) } : null,
    paraRecuperar: r0(e.saldo) + atrasadoValor,
    mesesParaIgualar: faltaIgualar <= 0.5 || !(refrendoMes > 0) ? 0 : Math.ceil(faltaIgualar / refrendoMes),
    paraRecuperarConMes: r0(e.saldo) + atrasadoValor + refrendoMes,
    refrendosParaValor: refrendosParaValor(+(L.prenda?.valor ?? 0), r0(e.saldo), intPag, refrendoMes),
    ea,
    vecesUsura: (o.usuraEA ?? 0) > 0 ? ea / ((o.usuraEA as number) / 100) : null,
  }
}

/**
 * Cuántos refrendos más faltan para que lo pagado en refrendos + lo que aún debes supere lo que vale el objeto (desde
 * ahí, recuperarlo cuesta más de lo que vale). 0 = ya lo superó; null si no se sabe cuánto vale o no hay refrendo.
 */
export function refrendosParaValor(valorObjeto: number, capital: number, pagado: number, refrendoMes: number): number | null {
  if (!(valorObjeto > 0) || !(refrendoMes > 0)) return null
  const falta = valorObjeto - capital - pagado
  return falta < 0 ? 0 : Math.floor(falta / refrendoMes) + 1
}
