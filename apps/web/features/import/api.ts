// Importar por la API (v7 V7-H4, interruptor `importer`; con AUTH_PROVIDER=mirai siempre). Misma firma y misma
// respuesta que las Server Actions de ./actions.ts; con el interruptor apagado son exactamente las de siempre.
//   · loadSampleBook  → POST /v1/books/:b/import/sample y la cookie del libro nuevo con switchBook (Server Action)
//   · importV4Backup  → POST /v1/books/:b/import/v4
//   · importStatement → POST /v1/books/:b/import/statement (extractos: la API vuelve a leer el MISMO texto con
//     parseCSV de @mirai/domain, así los índices `i` coinciden con las filas que vio la persona)
import { activeBookId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import type { ImportReport } from "./v4"
import * as actions from "./actions"

const on = () => apiOn("importer")
const client = () => import("@/lib/api/client")

export const loadSampleBook = viaApiOr(on, actions.loadSampleBook, async (): Promise<{ bookId: string; report: ImportReport }> => {
  const { browserApi, unwrapData } = await client()
  const d = unwrapData(await browserApi().importer.sample({ params: { bookId: activeBookId() } }))
  const { switchBook } = await import("@/components/app/actions")
  await switchBook(d.bookId)
  return d
})

export const importV4Backup = viaApiOr(on, actions.importV4Backup, async (json: string): Promise<ImportReport> => {
  // Los mismos avisos que la acción antes de mandar el archivo.
  let S: unknown
  try { S = JSON.parse(json) } catch { throw new Error("El archivo no es un JSON válido") }
  const st = (S as { S?: unknown; v?: number })?.v === 3 ? S : (S as { S?: unknown })?.S
  if (!st || typeof st !== "object" || !("cfg" in (st as object))) throw new Error("No parece un respaldo de Mirai 4.0")
  const { browserApi, unwrapData } = await client()
  return unwrapData(await browserApi().importer.importV4({ params: { bookId: activeBookId() }, body: { json } }))
})

/** ¿El extracto se importa por la API? (si no, la vista escribe como siempre). */
export const statementViaApi = on

export type StatementCommit = {
  csv: string
  fuente: { tipo: "medio"; id: string | null } | { tipo: "tarjeta"; id: string }
  member_id: string | null
  filas: { i: number; category_id?: string | null; hormiga?: boolean }[]
}

/** Importa las filas escogidas del extracto. Devuelve `errores` como la vista (lista de mensajes). */
export async function importStatement(b: StatementCommit): Promise<{ gastos: number; entradas: number; repetidos: number; errores: string[] }> {
  const { browserApi, unwrapData } = await client()
  try {
    return unwrapData(await browserApi().importer.commit({ params: { bookId: activeBookId() }, body: b }))
  } catch (e) {
    return { gastos: 0, entradas: 0, repetidos: 0, errores: [e instanceof Error && e.message ? e.message : "No se pudo importar el extracto."] }
  }
}
