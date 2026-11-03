// Respuesta de un comando que salió bien (§2.7.2): `{ ok: true, data }` con 200. La usan los controllers de F2-D.
export const ok = <T>(data: T) => ({ status: 200 as const, body: { ok: true as const, data } })

/** Número de una columna numeric (PostgREST la da como número; pg como texto). */
export const num = (v: unknown): number => (v == null || v === "" ? 0 : Number(v) || 0)
