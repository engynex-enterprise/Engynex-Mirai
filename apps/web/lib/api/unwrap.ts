// Desenvolver respuestas de ts-rest (v6 F2-H-1). Puro: se prueba en unwrap.test.ts.
// - 2xx → el cuerpo (o `data` en los comandos `{ ok:true, data }`).
// - Lo demás → ApiError con el `msg` en español de la API (o uno por código HTTP si no vino cuerpo).
import { ApiError } from "./errors"

type Res = { status: number; body: unknown; headers: Headers }
type Success<R> = R extends { status: 200 | 201 | 204; body: infer B } ? B : never
type DataOf<B> = B extends { ok: true; data: infer D } ? D : never

export function unwrap<R extends Res>(res: R): Success<R> {
  if (res.status >= 200 && res.status < 300) return res.body as Success<R>
  throw ApiError.from(res.status, res.body, res.headers)
}

/** Para los comandos que responden `{ ok: true, data }`. */
export function unwrapData<R extends Res>(res: R): DataOf<Success<R>> {
  const body = unwrap(res) as unknown
  if (body && typeof body === "object" && (body as { ok?: unknown }).ok === true && "data" in body) return (body as { data: DataOf<Success<R>> }).data
  throw ApiError.from(500, { msg: "La respuesta de Mirai no tiene la forma esperada." })
}
