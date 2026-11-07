// Módulo `import` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// - Extractos (features/import/import-view.tsx): `statement/preview` lee el CSV (parseCSV de @mirai/domain/csv), da a
//   cada movimiento su id estable `csv:` (csvExternalIds: el mismo extracto subido otra vez da los mismos ids), marca los
//   que ya están (por id o por fecha + descripción + valor) y propone categoría (reglas → historial → palabras; la IA
//   por el puerto ExpenseClassifier si el plan la incluye) y gasto hormiga. `statement` vuelve a leer el MISMO CSV,
//   toma las filas escogidas (`i`) con sus cambios y escribe: con un medio de pago, gastos (`origen: importar`) e
//   ingresos extra; con una tarjeta, compras (add_card_purchase) y pagos (pay_credit_card). Nunca duplica un `csv:`.
// - Respaldo: `export.json` (copia completa del libro, con la papelera, en el formato `BookDump` v5 de
//   features/data/backup.ts; lo usa también GET /v1/account/export de F2-I) y `backups` (la guarda en Storage).
// - V7-G: lista, enlace, restaurar y borrar respaldos; restaurar un JSON v5; importar un respaldo v4; libro de ejemplo y
//   formatear por bloques (los mismos pasos y mensajes de la web).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiOk, IsoDate, Uuid } from "../common"
import { BookParams, Row, WRITE_ERRORS } from "./write-common"

export const meta = { id: "import", owner: "F2-D" } as const

/** Texto del extracto (CSV o lo que la web convirtió desde Excel). */
const Csv = z.string().trim().min(1, "Pega el contenido del extracto").max(2_000_000, "El extracto es demasiado grande (máximo 2 MB)")
export const PreviewInput = z.object({ csv: Csv })
export const StatementRow = z.object({
  i: z.number(), fecha: IsoDate, descripcion: z.string(), valor: z.number(), abono: z.boolean(), ext: z.string(),
  dup: z.boolean(), incl: z.boolean(), category_id: z.string().nullable(), src: z.string().nullable(), hormiga: z.boolean(),
})
export type StatementRow = z.infer<typeof StatementRow>
export const Preview = z.object({ rows: z.array(StatementRow), skipped: z.number(), ia: z.boolean() })

export const CommitInput = z.object({
  csv: Csv,
  /**
   * De dónde salió la plata: un medio de pago o una tarjeta de crédito del libro. V7-H4: con `medio`, `id` puede ser
   * null (sin medio de pago, como la importación de siempre en la web).
   */
  fuente: z.union([z.object({ tipo: z.literal("medio"), id: Uuid.nullable() }), z.object({ tipo: z.literal("tarjeta"), id: Uuid })]),
  member_id: Uuid.nullable().optional(),
  /** Filas escogidas del preview (por `i`) con lo que la persona cambió a mano. */
  filas: z.array(z.object({ i: z.number().int().min(0), category_id: Uuid.nullable().optional(), hormiga: z.boolean().optional() })).min(1, "Selecciona al menos un movimiento").max(5000),
})
export const Committed = z.object({ gastos: z.number(), entradas: z.number(), repetidos: z.number(), errores: z.array(z.string()) })

/** Copia del libro (BookDump v5 de la web): ajustes y todas las tablas de BOOK_TABLES, incluida la papelera. */
export const BookDump = z.object({
  app: z.literal("mirai"), v: z.literal(5), book_id: z.string(), household_id: z.string(), nombre: z.string(), fecha: z.string(),
  settings: z.record(z.string(), z.unknown()), data: z.record(z.string(), z.array(Row)),
})
export type BookDump = z.infer<typeof BookDump>
export const BackupOut = z.object({ path: z.string(), size: z.number() })

// V7-G: respaldos guardados, restaurar, formatear e importar (features/data/actions.ts y features/import/actions.ts).
export const BackupParams = z.object({ bookId: Uuid, backupId: Uuid })
export const BackupRowOut = z.object({ id: z.string(), book_id: z.string(), tipo: z.string(), path: z.string(), size: z.number(), created_at: z.string(), created_by: z.string().nullable() })
/** El archivo tal como lo leyó el navegador (respaldo v5 para restaurar o v4 para importar). Máximo ~7 MB. */
export const JsonFile = z.object({ json: z.string().min(1, "El archivo está vacío").max(7_000_000, "El archivo es demasiado grande (máximo 7 MB)") })
export const Restored = z.object({ tablas: z.number(), filas: z.number() })
export const ImportReport = z.record(z.string(), z.number())
export const FORMAT_BLOCK_IDS = ["gastos", "ingresos", "fijos", "prestamos", "contactos", "inversiones", "balance", "metas", "consejos", "calendario"] as const
export const FormatInput = z.object({
  blocks: z.array(z.enum(FORMAT_BLOCK_IDS, { error: "Bloque desconocido" })).min(1, "Escoge al menos un bloque").max(FORMAT_BLOCK_IDS.length),
  /** Hay que escribir BORRAR. */
  confirm: z.string().max(20),
})

const c = initContract()
export const importContract = c.router(
  {
    preview: {
      method: "POST", path: "/v1/books/:bookId/import/statement/preview", pathParams: BookParams, body: PreviewInput,
      responses: { ...WRITE_ERRORS, 200: Preview }, summary: "Lee el extracto y propone qué importar (sin guardar)",
    },
    commit: {
      method: "POST", path: "/v1/books/:bookId/import/statement", pathParams: BookParams, body: CommitInput,
      responses: { ...WRITE_ERRORS, 200: ApiOk(Committed) }, summary: "Importa las filas escogidas del extracto (sin duplicar)",
    },
    exportJson: {
      method: "GET", path: "/v1/books/:bookId/export.json", pathParams: BookParams,
      responses: { ...WRITE_ERRORS, 200: BookDump }, summary: "Copia completa del libro en JSON (incluye la papelera). Rol: «Administra» o más",
    },
    backup: {
      method: "POST", path: "/v1/books/:bookId/backups", pathParams: BookParams, body: c.noBody(),
      responses: { ...WRITE_ERRORS, 200: ApiOk(BackupOut) }, summary: "Guarda un respaldo del libro en la nube (bucket privado backups)",
    },
    backups: {
      method: "GET", path: "/v1/books/:bookId/backups", pathParams: BookParams,
      responses: { ...WRITE_ERRORS, 200: z.array(BackupRowOut) }, summary: "Respaldos guardados del libro (del más reciente). Rol: «Administra» o más",
    },
    backupUrl: {
      method: "GET", path: "/v1/books/:bookId/backups/:backupId/url", pathParams: BackupParams,
      responses: { ...WRITE_ERRORS, 200: z.object({ url: z.string().nullable() }) }, summary: "Enlace de descarga del respaldo (2 minutos)",
    },
    restoreBackup: {
      method: "POST", path: "/v1/books/:bookId/backups/:backupId/restore", pathParams: BackupParams, body: c.noBody(),
      responses: { ...WRITE_ERRORS, 200: ApiOk(Restored) }, summary: "Reemplaza el libro por un respaldo guardado (antes guarda uno «antes de restaurar»). Rol: «Administra»",
    },
    deleteBackup: {
      method: "DELETE", path: "/v1/books/:bookId/backups/:backupId", pathParams: BackupParams, body: c.noBody(),
      responses: { ...WRITE_ERRORS, 200: ApiOk(z.object({ deleted: z.boolean() })) }, summary: "Borra un respaldo (archivo y registro). Rol: «Administra»",
    },
    restoreJson: {
      method: "POST", path: "/v1/books/:bookId/import/json", pathParams: BookParams, body: JsonFile,
      responses: { ...WRITE_ERRORS, 200: ApiOk(Restored) }, summary: "Restaura un respaldo JSON de Mirai 5 de este mismo hogar. Rol: «Administra»",
    },
    importV4: {
      method: "POST", path: "/v1/books/:bookId/import/v4", pathParams: BookParams, body: JsonFile,
      responses: { ...WRITE_ERRORS, 200: ApiOk(ImportReport) }, summary: "Importa un respaldo de Mirai 4.0 al libro (cuántas filas por tabla). Rol: «Colabora» o más",
    },
    sample: {
      method: "POST", path: "/v1/books/:bookId/import/sample", pathParams: BookParams, body: c.noBody(),
      responses: { ...WRITE_ERRORS, 200: ApiOk(z.object({ bookId: z.string(), report: ImportReport })) },
      summary: "Crea un libro de ejemplo (familia Navarro, fechas al día) en el hogar de este libro. Rol: «Colabora» o más",
      description: "Respeta el límite de libros del plan (402). La web cambia luego al libro nuevo (cookie mirai-book).",
    },
    format: {
      method: "POST", path: "/v1/books/:bookId/data/format", pathParams: BookParams, body: FormatInput,
      responses: { ...WRITE_ERRORS, 200: ApiOk(z.object({ borrados: z.number() })) }, summary: "Envía a la papelera los bloques escogidos (escribiendo BORRAR; antes guarda un respaldo). Rol: «Administra»",
    },
  },
  { strictStatusCodes: true },
)
