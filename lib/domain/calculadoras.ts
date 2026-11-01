// Calculadoras financieras para Colombia. Todos los resultados son ESTIMADOS y educativos.

/** Tasa efectiva anual → tasa efectiva mensual. */
export const eaToEm = (ea: number) => Math.pow(1 + ea / 100, 1 / 12) - 1
/** Tasa efectiva mensual → efectiva anual (en %). */
export const emToEa = (em: number) => (Math.pow(1 + em, 12) - 1) * 100

/**
 * CDT: rendimiento a término con tasa E.A. y retención en la fuente sobre los intereses
 * (4 % para rendimientos financieros de personas naturales, art. 395 E.T. / Decreto 700 de 1997; editable).
 */
export function cdt({ monto, ea, dias, retencion = 4 }: { monto: number; ea: number; dias: number; retencion?: number }) {
  const interes = monto * (Math.pow(1 + ea / 100, dias / 365) - 1)
  const rete = interes * (retencion / 100)
  return { interes: Math.round(interes), retencion: Math.round(rete), neto: Math.round(interes - rete), total: Math.round(monto + interes - rete) }
}

/** Crédito de cuota fija (sistema francés): cuota mensual, intereses totales y tabla de amortización. */
export function credito({ monto, ea, meses, seguroMes = 0 }: { monto: number; ea: number; meses: number; seguroMes?: number }) {
  const i = eaToEm(ea)
  const cuotaBase = i === 0 ? monto / meses : (monto * i) / (1 - Math.pow(1 + i, -meses))
  let saldo = monto
  const tabla: { mes: number; cuota: number; interes: number; capital: number; saldo: number }[] = []
  for (let m = 1; m <= meses; m++) {
    const interes = saldo * i
    const capital = Math.min(saldo, cuotaBase - interes)
    saldo = Math.max(0, saldo - capital)
    tabla.push({ mes: m, cuota: Math.round(cuotaBase + seguroMes), interes: Math.round(interes), capital: Math.round(capital), saldo: Math.round(saldo) })
  }
  const totalPagado = cuotaBase * meses + seguroMes * meses
  return { cuota: Math.round(cuotaBase + seguroMes), totalPagado: Math.round(totalPagado), intereses: Math.round(totalPagado - monto - seguroMes * meses), tabla }
}

/** Ahorro con aporte mensual e interés compuesto: cuánto tendrás al final. */
export function ahorro({ inicial, mensual, ea, meses }: { inicial: number; mensual: number; ea: number; meses: number }) {
  const i = eaToEm(ea)
  let saldo = inicial
  const serie: number[] = []
  for (let m = 1; m <= meses; m++) { saldo = saldo * (1 + i) + mensual; serie.push(Math.round(saldo)) }
  const aportado = inicial + mensual * meses
  return { final: Math.round(saldo), aportado: Math.round(aportado), intereses: Math.round(saldo - aportado), serie }
}

/** ¿Cuánto debo ahorrar al mes para llegar a una meta? (con interés compuesto). */
export function aporteParaMeta({ meta, inicial = 0, ea, meses }: { meta: number; inicial?: number; ea: number; meses: number }) {
  const i = eaToEm(ea)
  const fvInicial = inicial * Math.pow(1 + i, meses)
  const falta = Math.max(0, meta - fvInicial)
  const mensual = i === 0 ? falta / meses : (falta * i) / (Math.pow(1 + i, meses) - 1)
  return Math.ceil(mensual)
}

/** Gravamen a los movimientos financieros (4×1000), con la exención de una cuenta marcada hasta 350 UVT al mes. */
export function gmf({ monto, exento = false, uvt = 0 }: { monto: number; exento?: boolean; uvt?: number }) {
  const tope = exento && uvt > 0 ? 350 * uvt : 0
  const gravado = Math.max(0, monto - tope)
  return { impuesto: Math.round(gravado * 0.004), gravado: Math.round(gravado), tope: Math.round(tope) }
}

/** Inflación: cuánto valdrá en el futuro lo que hoy cuesta X, y cuánto poder de compra pierde el dinero quieto. */
export function inflacion({ valor, anual, anios }: { valor: number; anual: number; anios: number }) {
  const f = Math.pow(1 + anual / 100, anios)
  return { costoFuturo: Math.round(valor * f), poderDeCompra: Math.round(valor / f), perdidaPct: Math.round((1 - 1 / f) * 1000) / 10 }
}
