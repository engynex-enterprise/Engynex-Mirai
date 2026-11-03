// Programa de referidos (puro e isomórfico): alfabeto del código, tope de recompensas y validación del código.
// La parte de base (crear el código y dar la recompensa) vive en apps/web/lib/referidos.ts y en la API
// (POST /v1/households, F2-I).

/** Sin 0/O ni 1/I para que no se confundan al dictarlo. */
export const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
/** Máximo de recompensas por persona que invita. */
export const MAX_RECOMPENSAS = 12

/** Número aleatorio uniforme en [0, max) con el generador criptográfico (navegador y Node 22). */
const randomBelow = (max: number) => {
  const lim = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  for (;;) {
    globalThis.crypto.getRandomValues(buf)
    if (buf[0] < lim) return buf[0] % max
  }
}

/** Código nuevo de `n` letras del ALFABETO. */
export function nuevoCodigo(n = 8, rand: (max: number) => number = randomBelow) {
  return Array.from({ length: n }, () => ALFABETO[rand(ALFABETO.length)]).join("")
}

/** Código tal como llega (registro o cookie) → en mayúsculas, o null si no parece un código. */
export function normCodigo(codigo: string | null | undefined): string | null {
  const c = codigo?.trim().toUpperCase()
  return c && /^[A-Z0-9]{6,12}$/.test(c) ? c : null
}

/** Ajustes del programa (platform_settings) con sus valores por defecto. */
export const referidosCfg = (cfg: { referidos_activo?: boolean | null; referidos_plan?: string | null; referidos_dias?: number | null } | null | undefined) => ({
  activo: cfg?.referidos_activo ?? true,
  plan: cfg?.referidos_plan ?? "premium",
  dias: cfg?.referidos_dias ?? 30,
})

/** Vencimiento de la cortesía: suma los días a la vigente (si hay) o desde hoy. */
export const cortesiaHasta = (prevVence: string | null | undefined, dias: number, now = new Date()) =>
  new Date((prevVence ? new Date(prevVence) : now).getTime() + dias * 86_400_000).toISOString()
