// Respaldo y exportación del libro activo (F2-D-9): solo Dueño y Administra (permiso "ajustes", Ley 1581), como
// exportBookJson / createBackup de apps/web/features/data/actions.ts.
import { Injectable } from "@nestjs/common"
import { RequestContextService } from "../../core/context/request-context.service"
import { BackupStorage } from "./backup-storage"
import { BookDumpService } from "./book-dump.service"

@Injectable()
export class ImportService {
  constructor(
    private readonly ctx: RequestContextService,
    private readonly dumps: BookDumpService,
    private readonly storage: BackupStorage,
  ) {}

  private get book() {
    const b = this.ctx.book.book
    return { id: b.id, household_id: b.household_id, nombre: b.nombre }
  }

  exportJson() {
    return this.dumps.dump(this.ctx.db, this.book)
  }

  async backup() {
    const dump = await this.dumps.dump(this.ctx.db, this.book)
    const body = JSON.stringify(dump)
    const path = await this.storage.save({ bookId: dump.book_id, tipo: "manual", body, fecha: dump.fecha, userId: this.ctx.user.id })
    return { path, size: body.length }
  }
}
