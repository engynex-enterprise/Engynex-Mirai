// Respaldos, restaurar, formatear e importar (V7-G). Mismos pasos y mensajes que apps/web/features/data/actions.ts
// (backupUrl, restoreBackup, restoreFromJson, deleteBackup, formatBlocks), features/data/backup.ts (restoreDump,
// sanitizeDump) y features/import/actions.ts (importV4Backup, loadSampleBook). El rol ya lo revisó BookGuard.
//
// Alcances: lo que la web hace con supabaseAdmin() (restaurar, formatear, respaldos) va con SystemScope y un motivo;
// importar v4 y el libro de ejemplo van con la sesión de la persona (la RLS vuelve a revisar), como en la web.
import { Injectable } from "@nestjs/common"
import { BOOK_TABLES } from "@mirai/contracts/book-tables"
import { LIVE_TABLES, type LiveTable } from "@mirai/contracts/live"
import type { BookDump } from "@mirai/contracts/modules/import"
import type { TableName } from "@mirai/db/tables"
import { todayBogota } from "@mirai/domain/dates"
import { can } from "@mirai/domain/plans"
import { daysBetween, shiftDates } from "@mirai/domain/shift-dates"
import { AppContextService } from "../../core/context/app-context.service"
import { RequestContextService } from "../../core/context/request-context.service"
import { systemScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"
import { EventsService } from "../../core/events/events.service"
import { RowStore } from "../../core/store/row-store"
import { BackupStorage, type BackupRow } from "./backup-storage"
import { BookDumpService } from "./book-dump.service"
import { importV4, type ImportReport } from "./v4/importer"
// Copia de apps/web/lib/data/sample-v4.json (la familia Navarro). La de la web se borra cuando la web pierda su backend.
import SAMPLE from "./v4/sample-v4.json"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEEP = new Set(["id", "book_id", "created_by", "updated_by", "external_id"])

/** Bloques de "Formatear" (formatBlocks de la web): qué tablas van a la papelera en cada uno. */
export const FORMAT_BLOCKS = {
  gastos: ["expenses", "card_purchases"], ingresos: ["incomes", "extra_incomes"], fijos: ["fixed_expenses", "subscriptions"],
  prestamos: ["loans"], contactos: ["contacts"], inversiones: ["investments"], balance: ["assets", "liabilities", "credit_cards"],
  metas: ["goals", "savings_challenges"], consejos: ["advisor_consultations"], calendario: ["calendar_events"],
} as const satisfies Record<string, readonly TableName[]>
export type FormatBlock = keyof typeof FORMAT_BLOCKS

export const SAMPLE_NAME = "Ejemplo · familia Navarro"
const NOT_V5 = "No es un respaldo de Mirai 5. Para respaldos de la versión anterior usa Importar."
const OTHER_HOUSEHOLD = "Este respaldo es de otro hogar. Para traer datos de otro hogar usa Importar."
const NOT_JSON = "El archivo no es un JSON válido"
const NOT_V4 = "No parece un respaldo de Mirai 4.0"
const NOT_FOUND = "Respaldo no encontrado"

type Rec = Record<string, unknown>

/**
 * Limpia un respaldo antes de restaurarlo (sanitizeDump de la web): solo tablas del libro y filas que son objetos, y
 * las referencias (`*_id`, `*_ids`) solo pueden apuntar a filas del mismo respaldo o a integrantes del hogar. Así un
 * respaldo manipulado no puede tocar registros de otro libro por medio de los triggers.
 */
export function sanitizeDump(dump: Pick<BookDump, "data">, memberIds: Set<string>): Record<string, Rec[]> {
  const src = (dump?.data && typeof dump.data === "object" ? dump.data : {}) as Record<string, unknown>
  const rowsOf = (t: string) => (Array.isArray(src[t]) ? (src[t] as unknown[]) : [])
  const ids = new Set<string>(memberIds)
  for (const t of BOOK_TABLES) for (const r of rowsOf(t)) if (r && typeof r === "object" && typeof (r as Rec).id === "string") ids.add((r as Rec).id as string)
  const out: Record<string, Rec[]> = {}
  for (const t of BOOK_TABLES) {
    out[t] = rowsOf(t).filter((r): r is Rec => !!r && typeof r === "object" && !Array.isArray(r)).map((r) => {
      const x: Rec = { ...r }
      for (const [k, v] of Object.entries(x)) {
        if (KEEP.has(k)) continue
        if (k.endsWith("_id") && typeof v === "string" && UUID.test(v) && !ids.has(v)) x[k] = null
        if (k.endsWith("_ids") && Array.isArray(v)) x[k] = v.filter((y) => typeof y === "string" && ids.has(y))
      }
      return x
    })
  }
  return out
}

const parseJson = (json: string): unknown => {
  try {
    return JSON.parse(json)
  } catch {
    throw DomainError.validation(NOT_JSON)
  }
}

/** Tablas del libro que se avisan en vivo después de reemplazar o importar todo. */
const LIVE = new Set<string>(LIVE_TABLES)
const liveOf = (tables: readonly string[]) => [...new Set(tables)].filter((t): t is LiveTable => LIVE.has(t))

@Injectable()
export class DataService {
  constructor(
    private readonly ctx: RequestContextService,
    private readonly contexts: AppContextService,
    private readonly dumps: BookDumpService,
    private readonly storage: BackupStorage,
    private readonly rows: RowStore,
    private readonly events: EventsService,
  ) {}

  private get book() {
    const b = this.ctx.book.book
    return { id: b.id, household_id: b.household_id, nombre: b.nombre }
  }

  /** Respaldo con la clave del sistema (saveBackup de la web). */
  private async saveBackup(tipo: "antes_restaurar" | "manual") {
    const dump = await this.dumps.dump(systemScope(`respaldo ${tipo} antes de reemplazar datos`), this.book)
    return this.storage.save({ bookId: dump.book_id, tipo, body: JSON.stringify(dump), fecha: dump.fecha, userId: this.ctx.user.id })
  }

  // ── Respaldos ──

  async list(): Promise<BackupRow[]> {
    return this.storage.list(this.book.id)
  }

  private async backup(id: string): Promise<BackupRow> {
    const row = await this.storage.find(this.book.id, id)
    if (!row) throw DomainError.notFound(NOT_FOUND)
    return row
  }

  /** backupUrl: enlace de descarga de 2 minutos. */
  async url(id: string): Promise<{ url: string | null }> {
    const row = await this.backup(id)
    return { url: await this.storage.signedUrl(row.path, 120) }
  }

  /** restoreBackup: reemplaza el libro por el respaldo guardado. */
  async restoreBackup(id: string) {
    const row = await this.backup(id)
    const text = await this.storage.read(row.path)
    let dump: unknown
    try {
      dump = JSON.parse(text)
    } catch {
      throw DomainError.validation("No se pudo leer el respaldo")
    }
    return this.restoreDump(dump)
  }

  /** restoreFromJson: el archivo que la persona subió. */
  restoreJson(json: string) {
    return this.restoreDump(parseJson(json))
  }

  /** deleteBackup: si no existe no hace nada (como la web). */
  async deleteBackup(id: string): Promise<{ deleted: boolean }> {
    const row = await this.storage.find(this.book.id, id)
    if (!row) return { deleted: false }
    await this.storage.remove(this.book.id, row)
    return { deleted: true }
  }

  /** restoreDump de la web: revisa versión y hogar, limpia, respalda "antes_restaurar", borra y vuelve a insertar. */
  private async restoreDump(raw: unknown): Promise<{ tablas: number; filas: number }> {
    const dump = raw as Partial<BookDump> | null
    if (dump?.app !== "mirai" || dump.v !== 5) throw DomainError.validation(NOT_V5)
    const book = this.book
    if (dump.household_id !== book.household_id) throw DomainError.validation(OTHER_HOUSEHOLD)
    const sys = systemScope("restaurar un respaldo del libro (supabaseAdmin en la web)")
    const fams = await this.rows.select<{ id: string }>(sys, "family_members", { columns: ["id"], eq: { household_id: book.household_id } })
    const clean = sanitizeDump(dump as BookDump, new Set(fams.map((f) => f.id)))
    await this.saveBackup("antes_restaurar")
    for (const t of [...BOOK_TABLES].reverse()) await this.rows.delete(sys, t as TableName, { eq: { book_id: book.id } })
    let filas = 0
    for (const t of BOOK_TABLES) {
      const rows = (clean[t] ?? []).map((r) => ({ ...r, book_id: book.id }))
      for (let i = 0; i < rows.length; i += 500) await this.rows.insert(sys, t as TableName, rows.slice(i, i + 500))
      filas += rows.length
    }
    const { book_id: _b, updated_at: _u, ...settings } = (dump.settings ?? {}) as Rec
    if (Object.keys(settings).length) await this.rows.update(sys, "book_settings", { eq: { book_id: book.id } }, settings)
    this.events.changed(book.id, liveOf(["book_settings", ...BOOK_TABLES]))
    return { tablas: BOOK_TABLES.length, filas }
  }

  // ── Formatear ──

  /** formatBlocks: respaldo antes y borrado lógico (papelera) de los bloques escogidos. */
  async format(blocks: FormatBlock[], confirm: string): Promise<{ borrados: number }> {
    if (String(confirm ?? "").trim().toUpperCase() !== "BORRAR") throw DomainError.validation("Escribe BORRAR para confirmar")
    const book = this.book
    await this.saveBackup("antes_restaurar")
    const sys = systemScope("formatear bloques del libro (papelera, supabaseAdmin en la web)")
    const now = new Date().toISOString()
    const tables = [...new Set(blocks.flatMap((b) => FORMAT_BLOCKS[b]))]
    let borrados = 0
    for (const t of tables) borrados += (await this.rows.update(sys, t, { eq: { book_id: book.id, deleted_at: null } }, { deleted_at: now })).length
    this.events.changed(book.id, liveOf(tables))
    return { borrados }
  }

  // ── Importar ──

  /** importV4Backup: el respaldo de Mirai 4.0 al libro de la ruta. */
  async importV4(json: string): Promise<ImportReport> {
    const S = parseJson(json) as { S?: unknown; v?: number } | null
    const st = S?.v === 3 ? S : S?.S
    if (!st || typeof st !== "object" || !("cfg" in st)) throw DomainError.validation(NOT_V4)
    // Sirve en todos los planes. Si la base exige el plan (platform_settings.premium_db), las partes de funciones que el
    // plan no incluye se dejan por fuera para que el resto entre completo.
    const ps = await this.rows.first<{ premium_db?: boolean }>(this.ctx.db, "platform_settings", { columns: ["premium_db"] })
    const data = { ...(st as Rec) }
    const plan = this.ctx.book.plan
    if (ps?.premium_db) {
      if (!can(plan, "familia")) {
        delete data.grupos
        delete data.kids
      }
      if (!can(plan, "impuestos")) {
        delete data.renta
        delete data.bienes
      }
    }
    const book = this.book
    const report = await importV4(this.rows, this.ctx.db, book.id, book.household_id, data)
    this.events.changed(book.id, liveOf(["book_settings", ...Object.keys(report)]))
    return report
  }

  /** loadSampleBook: libro aparte con la familia Navarro (fechas al día). La web luego cambia a ese libro (cookie). */
  async sample(): Promise<{ bookId: string; report: ImportReport }> {
    // Igual que loadSampleBook de la web: el ejemplo no revisa el cupo de libros del plan aquí (con el plan Gratis nunca
    // se podría ver). Si platform_settings.premium_db está encendido, el trigger enforce_free_limits de la base lo exige.
    const { household } = this.ctx.book
    const bookId = String(await this.rows.rpc(this.ctx.db, "create_book", { p_household: household.id, p_nombre: SAMPLE_NAME, p_tipo: "otro", p_icon: "sparkles" }))
    this.contexts.invalidate(this.ctx.user.id)
    await this.rows.update(this.ctx.db, "books", { eq: { id: bookId } }, { sample: true })
    const S = shiftDates((SAMPLE as { S: unknown }).S, daysBetween((SAMPLE as { ref: string }).ref, todayBogota()))
    const report = await importV4(this.rows, this.ctx.db, bookId, household.id, S)
    return { bookId, report }
  }
}
