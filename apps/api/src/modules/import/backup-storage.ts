// Dónde se guardan los respaldos del libro (bucket privado `backups` + tabla `backups`). Puerto para poder pasar a
// Cloud Storage / S3 / Azure Blob (V7-E: ObjectStore) sin tocar los servicios. El adaptador de hoy usa la clave
// secreta (SystemScope con motivo): la tabla `backups` solo tiene política de lectura para «Administra» y el bucket no
// deja subir con la sesión (igual que saveBackup / backupUrl / restoreBackup / deleteBackup de la web).
import { Injectable } from "@nestjs/common"
import { systemScope } from "../../core/db/scope"
import { SupabaseJsFactory } from "../../core/db/supabase-js.factory"
import { DomainError } from "../../core/errors/domain-error"

export type BackupTipo = "auto" | "manual" | "antes_restaurar" | "importado"
export type BackupRow = { id: string; book_id: string; tipo: string; path: string; size: number; created_at: string; created_by: string | null }

export abstract class BackupStorage {
  /** Sube el respaldo y lo registra. Devuelve la ruta en el bucket. */
  abstract save(a: { bookId: string; tipo: BackupTipo; body: string; fecha: string; userId: string | null }): Promise<string>
  /** Respaldos del libro, del más reciente al más viejo. */
  abstract list(bookId: string): Promise<BackupRow[]>
  /** El respaldo `id` del libro (null si no existe o es de otro libro). */
  abstract find(bookId: string, id: string): Promise<BackupRow | null>
  /** Contenido del archivo (JSON en texto). */
  abstract read(path: string): Promise<string>
  /** URL firmada para descargarlo (`seconds` de vida). null si no se pudo firmar. */
  abstract signedUrl(path: string, seconds: number): Promise<string | null>
  /** Borra el archivo y su fila. */
  abstract remove(bookId: string, row: BackupRow): Promise<void>
}

const COLS = "id,book_id,tipo,path,size,created_at,created_by"

@Injectable()
export class SupabaseBackupStorage extends BackupStorage {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  private db(motivo: string) {
    return this.sb.for(systemScope(motivo))
  }

  async save(a: { bookId: string; tipo: BackupTipo; body: string; fecha: string; userId: string | null }): Promise<string> {
    const db = this.db(`respaldo ${a.tipo} del libro`)
    const path = `${a.bookId}/${a.fecha.replace(/[:.]/g, "-")}-${a.tipo}.json`
    const up = await db.storage.from("backups").upload(path, a.body, { contentType: "application/json", upsert: true })
    if (up.error) throw DomainError.upstream("No pudimos guardar el respaldo en la nube. Intenta de nuevo en un momento.", up.error)
    const { error } = await db.from("backups").insert({ book_id: a.bookId, tipo: a.tipo, path, size: a.body.length, created_by: a.userId })
    if (error) throw DomainError.fromPg(error)
    return path
  }

  async list(bookId: string): Promise<BackupRow[]> {
    const { data, error } = await this.db("respaldos: lista del libro").from("backups").select(COLS).eq("book_id", bookId).order("created_at", { ascending: false }).limit(200)
    if (error) throw DomainError.fromPg(error)
    return (data ?? []) as BackupRow[]
  }

  async find(bookId: string, id: string): Promise<BackupRow | null> {
    const { data, error } = await this.db("respaldos: leer uno").from("backups").select(COLS).eq("id", id).eq("book_id", bookId).maybeSingle()
    if (error) throw DomainError.fromPg(error)
    return (data ?? null) as BackupRow | null
  }

  async read(path: string): Promise<string> {
    const { data, error } = await this.db("respaldos: descargar para restaurar").storage.from("backups").download(path)
    if (error || !data) throw DomainError.upstream("No se pudo leer el respaldo", error)
    return data.text()
  }

  async signedUrl(path: string, seconds: number): Promise<string | null> {
    const { data } = await this.db("respaldos: enlace de descarga").storage.from("backups").createSignedUrl(path, seconds, { download: true })
    return data?.signedUrl ?? null
  }

  async remove(bookId: string, row: BackupRow): Promise<void> {
    const db = this.db("respaldos: borrar")
    await db.storage.from("backups").remove([row.path])
    const { error } = await db.from("backups").delete().eq("id", row.id).eq("book_id", bookId)
    if (error) throw DomainError.fromPg(error)
  }
}
