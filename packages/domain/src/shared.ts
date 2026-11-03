// Gastos compartidos: quién le debe a quién (equivalente a `balancesGrupo()` de f_extra.js de la v4).

export interface SharedExpenseIn {
  valor: number
  /** Quién pagó. */
  paga: string
  /** Entre quiénes se divide (vacío = todos). */
  entre?: string[] | null
}

export interface SharedBalances {
  /** Saldo de cada persona: positivo = le deben, negativo = debe. */
  b: Record<string, number>
  /** Transferencias para quedar a paz y salvo. */
  tr: { de: string; a: string; v: number }[]
}

/**
 * Saldos del grupo y transferencias mínimas (voraz: el mayor deudor le paga al mayor acreedor).
 * Diferencias de $1 o menos se consideran saldadas.
 */
export function balancesGrupo(personas: string[], gastos: SharedExpenseIn[]): SharedBalances {
  const b: Record<string, number> = {}
  personas.forEach((p) => (b[p] = 0))
  for (const x of gastos) {
    const ent = x.entre && x.entre.length ? x.entre : personas
    const parte = x.valor / ent.length
    b[x.paga] = (b[x.paga] || 0) + +x.valor
    ent.forEach((p) => (b[p] = (b[p] || 0) - parte))
  }
  const deu = Object.entries(b).filter(([, v]) => v < -1).map(([p, v]) => [p, -v] as [string, number]).sort((a, c) => c[1] - a[1])
  const acr = Object.entries(b).filter(([, v]) => v > 1).map(([p, v]) => [p, v] as [string, number]).sort((a, c) => c[1] - a[1])
  const tr: SharedBalances["tr"] = []
  let i = 0
  let j = 0
  while (i < deu.length && j < acr.length) {
    const m = Math.min(deu[i][1], acr[j][1])
    tr.push({ de: deu[i][0], a: acr[j][0], v: m })
    deu[i][1] -= m
    acr[j][1] -= m
    if (deu[i][1] < 1) i++
    if (acr[j][1] < 1) j++
  }
  return { b, tr }
}
