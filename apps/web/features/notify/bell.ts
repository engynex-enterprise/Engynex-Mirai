// Campana por la API: GET /v1/notifications, PATCH …/:id/read y POST …/read-all.
const client = () => import("@/lib/api/client")

/** Los 50 avisos más recientes del libro y los generales (sin libro). */
export async function bellList(_userId: string, bookId: string) {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().bell.list({ query: { bookId, limit: 50 } }))
}

/** Marca todos tus avisos sin leer. */
export async function bellReadAll() {
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().bell.readAll())
}

/** Marca un aviso como leído (un error no interrumpe: solo se vuelve a consultar la campana). */
export function bellReadOne(id: string): PromiseLike<unknown> {
  return client().then(({ browserApi }) => browserApi().bell.read({ params: { id } })).catch(() => null)
}
