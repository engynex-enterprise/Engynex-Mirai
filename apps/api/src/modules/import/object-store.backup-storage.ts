// Respaldos del libro sobre el puerto ObjectStore (V7-E): el archivo va al bucket lógico `backups` (en la nube, el bucket
// físico de respaldos con versiones y borrado suave) y la fila a la tabla `backups` por RowStore (supabase-js/PostgREST
// hoy, Kysely en la Postgres propia). Lo elige import.module.ts cuando OBJECT_STORE no es `supabase`; con `supabase`
// sigue SupabaseBackupStorage, idéntico a la web. Misma ruta: `{book_id}/{fecha}-{tipo}.json`.
import { Injectable } from "@nestjs/common"
import { systemScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"
import { ObjectStore } from "../../core/files/object-store"
import { RowStore } from "../../core/store/row-store"
import { BackupStorage, type BackupRow, type BackupTipo } from "./backup-storage"

const COLS = ["id", "book_id", "tipo", "path", "size", "created_at", "created_by"] as const

@Injectable()
export class ObjectStoreBackupStorage extends BackupStorage {
  constructor(
    private readonly files: ObjectStore,
    private readonly rows: RowStore,
  ) {
    super()
  }

  async save(a: { bookId: string; tipo: BackupTipo; body: string; fecha: string; userId: string | null }): Promise<string> {
    const path = `${a.bookId}/${a.fecha.replace(/[:.]/g, "-")}-${a.tipo}.json`
    try {
      await this.files.write({ bucket: "backups", key: path, body: a.body, contentType: "application/json" })
    } catch (e) {
      throw DomainError.upstream("No pudimos guardar el respaldo en la nube. Intenta de nuevo en un momento.", e)
    }
    await this.rows.insert(systemScope(`respaldo ${a.tipo} del libro`), "backups", [{ book_id: a.bookId, tipo: a.tipo, path, size: Buffer.byteLength(a.body), created_by: a.userId }])
    return path
  }

  list(bookId: string): Promise<BackupRow[]> {
    return this.rows.select<BackupRow>(systemScope("respaldos: lista del libro"), "backups", { columns: COLS, eq: { book_id: bookId }, order: [{ column: "created_at", ascending: false }], limit: 200 })
  }

  find(bookId: string, id: string): Promise<BackupRow | null> {
    return this.rows.first<BackupRow>(systemScope("respaldos: leer uno"), "backups", { columns: COLS, eq: { id, book_id: bookId } })
  }

  async read(path: string): Promise<string> {
    const buf = await this.files.read({ bucket: "backups", key: path })
    if (!buf) throw DomainError.upstream("No se pudo leer el respaldo")
    return buf.toString("utf8")
  }

  async signedUrl(path: string, seconds: number): Promise<string | null> {
    return this.files.signDownload({ bucket: "backups", key: path, ttlS: seconds, download: true }).catch(() => null)
  }

  async remove(bookId: string, row: BackupRow): Promise<void> {
    await this.files.remove("backups", [row.path])
    await this.rows.delete(systemScope("respaldos: borrar"), "backups", { eq: { id: row.id, book_id: bookId } })
  }
}
