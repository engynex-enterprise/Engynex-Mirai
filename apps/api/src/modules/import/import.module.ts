import { Module } from "@nestjs/common"
import { RowStoreModule } from "../../core/store/row-store.module"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { ExpensesModule } from "../expenses/expenses.module"
import { byObjectStore } from "../../core/files/by-driver"
import { BackupStorage, SupabaseBackupStorage } from "./backup-storage"
import { ObjectStoreBackupStorage } from "./object-store.backup-storage"
import { BookDumpService } from "./book-dump.service"
import { DataService } from "./data.service"
import { ImportController } from "./import.controller"
import { ImportService } from "./import.service"
import { StatementService } from "./statement.service"

// Módulo `import` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// Extractos (vista previa e importar sin duplicar `csv:`), exportar el libro (BookDump v5) y respaldo en Storage.
// Exporta BookDumpService para GET /v1/account/export (F2-I). V7-G: DataService (lista, enlace, restaurar y borrar
// respaldos; restaurar JSON v5; importar v4 y libro de ejemplo con v4/importer.ts sobre RowStore; formatear bloques).
@Module({
  imports: [BookTablesModule, ExpensesModule, RowStoreModule],
  controllers: [ImportController],
  providers: [StatementService, ImportService, BookDumpService, DataService, byObjectStore(BackupStorage, SupabaseBackupStorage, ObjectStoreBackupStorage)],
  exports: [BookDumpService, StatementService],
})
export class ImportModule {}
