// Dónde se guardan los respaldos del libro (bucket privado `backups` + tabla `backups`). Puerto para poder pasar a
// Cloud Storage en la fase 4. El adaptador de hoy usa la clave secreta (SystemScope con motivo): la tabla `backups`
// solo tiene política de lectura para «Administra» y el bucket no deja subir con la sesión (igual que saveBackup).
import { Injectable } from "@nestjs/common"
import { systemScope } from "../../core/db/scope"
import { SupabaseJsFactory } from "../../core/db/supabase-js.factory"
import { DomainError } from "../../core/errors/domain-error"

export type BackupTipo = "auto" | "manual" | "antes_restaurar" | "importado"

export abstract class BackupStorage {
  /** Sube el respaldo y lo registra. Devuelve la ruta en el bucket. */
  abstract save(a: { bookId: string; tipo: BackupTipo; body: string; fecha: string; userId: string | null }): Promise<string>
}

@Injectable()
export class SupabaseBackupStorage extends BackupStorage {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  async save(a: { bookId: string; tipo: BackupTipo; body: string; fecha: string; userId: string | null }): Promise<string> {
    const db = this.sb.for(systemScope(`respaldo ${a.tipo} del libro`))
    const path = `${a.bookId}/${a.fecha.replace(/[:.]/g, "-")}-${a.tipo}.json`
    const up = await db.storage.from("backups").upload(path, a.body, { contentType: "application/json", upsert: true })
    if (up.error) throw DomainError.upstream("No pudimos guardar el respaldo en la nube. Intenta de nuevo en un momento.", up.error)
    const { error } = await db.from("backups").insert({ book_id: a.bookId, tipo: a.tipo, path, size: a.body.length, created_by: a.userId })
    if (error) throw DomainError.fromPg(error)
    return path
  }
}
