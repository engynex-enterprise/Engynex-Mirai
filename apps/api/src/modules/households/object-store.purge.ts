// Supresión de archivos (Ley 1581) sobre el puerto ObjectStore (V7-E): mismas carpetas que SupabaseStoragePurge
// (adjuntos, respaldos y logos de cada libro del hogar; avatar y capturas de la persona), en cualquier nube.
// Lo elige households.module.ts cuando OBJECT_STORE no es `supabase`.
import { Inject, Injectable } from "@nestjs/common"
import type { Logger } from "pino"
import { systemScope } from "../../core/db/scope"
import type { StoreBucket } from "../../core/files/buckets"
import { ObjectStore } from "../../core/files/object-store"
import { LOGGER } from "../../core/logging/logger"
import { RowStore } from "../../core/store/row-store"
import { StoragePurge } from "./ports"

const BOOK_BUCKETS: StoreBucket[] = ["attachments", "backups", "logos"]
const USER_BUCKETS: StoreBucket[] = ["avatars", "feedback"]

@Injectable()
export class ObjectStorePurge extends StoragePurge {
  constructor(
    private readonly files: ObjectStore,
    private readonly rows: RowStore,
    @Inject(LOGGER) private readonly log: Logger,
  ) {
    super()
  }

  async household(householdId: string) {
    const books = await this.rows.select<{ id: string }>(systemScope("borrar archivos (Ley 1581)"), "books", { columns: ["id"], eq: { household_id: householdId } })
    let n = 0
    for (const b of books) for (const bucket of BOOK_BUCKETS) n += await this.files.removePrefix(bucket, b.id)
    this.log.info({ householdId, archivos: n }, "archivos del hogar borrados")
    return n
  }

  async user(userId: string) {
    let n = 0
    for (const bucket of USER_BUCKETS) n += await this.files.removePrefix(bucket, userId)
    return n
  }
}
