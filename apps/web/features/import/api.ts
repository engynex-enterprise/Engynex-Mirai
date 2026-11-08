// Importar por la API:
//   · loadSampleBook  → POST /v1/books/:b/import/sample y la cookie del libro nuevo con switchBook (Server Action)
//   · importV4Backup  → POST /v1/books/:b/import/v4
//   · importStatement → POST /v1/books/:b/import/statement (extractos: la API vuelve a leer el MISMO texto con
//     parseCSV de @mirai/domain, así los índices `i` coinciden con las filas que vio la persona)
import { activeBookId } from "@/lib/api/session"

/** Cuántas filas entraron por tabla. */
export type ImportReport = Record<string, number>

const client = () => import("@/lib/api/client")

/** "Ver un ejemplo": la API crea un libro aparte con los datos de la familia Navarro (fechas al día) y se cambia a él. */
export async function loadSampleBook(): Promise<{ bookId: string; report: ImportReport }> {
  const { browserApi, unwrapData } = await client()
  const d = unwrapData(await browserApi().importer.sample({ params: { bookId: activeBookId() } }))
  const { switchBook } = await import("@/components/app/actions")
  await switchBook(d.bookId)
  return d
}

/** Importa un respaldo JSON de Mirai 4.0 (o el contenido de localStorage) al libro activo. */
export async function importV4Backup(json: string): Promise<ImportReport> {
  // Avisos antes de mandar el archivo.
  let S: unknown
  try { S = JSON.parse(json) } catch { throw new Error("El archivo no es un JSON válido") }
  const st = (S as { S?: unknown; v?: number })?.v === 3 ? S : (S as { S?: unknown })?.S
  if (!st || typeof st !== "object" || !("cfg" in (st as object))) throw new Error("No parece un respaldo de Mirai 4.0")
  const { browserApi, unwrapData } = await client()
  return unwrapData(await browserApi().importer.importV4({ params: { bookId: activeBookId() }, body: { json } }))
}

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
