import { Module } from "@nestjs/common"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { ExpensesModule } from "../expenses/expenses.module"
import { BackupStorage, SupabaseBackupStorage } from "./backup-storage"
import { BookDumpService } from "./book-dump.service"
import { ImportController } from "./import.controller"
import { ImportService } from "./import.service"
import { StatementService } from "./statement.service"

// Módulo `import` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// Extractos (vista previa e importar sin duplicar `csv:`), exportar el libro (BookDump v5) y respaldo en Storage.
// Exporta BookDumpService para GET /v1/account/export (F2-I). Pendiente: importar respaldo v4, ejemplo, restaurar y
// borrar respaldos (siguen en la web, features/data/actions.ts e import/v4.ts).
@Module({
  imports: [BookTablesModule, ExpensesModule],
  controllers: [ImportController],
  providers: [StatementService, ImportService, BookDumpService, { provide: BackupStorage, useClass: SupabaseBackupStorage }],
  exports: [BookDumpService, StatementService],
})
export class ImportModule {}
