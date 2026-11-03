// Número en letras (español de Colombia) para pagarés y acuerdos de pago (numLetras de la v4).
const U = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince",
  "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"]
const D = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"]
const C = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"]

function hasta999(n: number): string {
  if (n === 100) return "cien"
  const c = Math.floor(n / 100), r = n % 100
  const dec = r < 30 ? (r ? U[r] : "") : D[Math.floor(r / 10)] + (r % 10 ? ` y ${U[r % 10]}` : "")
  return [C[c], dec].filter(Boolean).join(" ")
}

/** "uno" → "un" delante de "mil"/"millones" (veintiún mil, un millón). */
const apocope = (s: string) => s.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un")

export function numLetras(valor: number): string {
  let n = Math.floor(Math.abs(valor))
  if (n === 0) return "Cero"
  const parts: string[] = []
  const mill = Math.floor(n / 1_000_000)
  n %= 1_000_000
  if (mill) parts.push(mill === 1 ? "un millón" : `${apocope(numLetras(mill).toLowerCase())} millones`)
  const miles = Math.floor(n / 1000)
  n %= 1000
  if (miles) parts.push(miles === 1 ? "mil" : `${apocope(hasta999(miles))} mil`)
  if (n) parts.push(hasta999(n))
  const s = parts.join(" ")
  return s[0].toUpperCase() + s.slice(1)
}
