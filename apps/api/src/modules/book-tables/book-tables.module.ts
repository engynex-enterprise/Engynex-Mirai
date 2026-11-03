import { Module } from "@nestjs/common"
import { repoProvider } from "../../core/db/adapter"
import { PgKyselyBookTablesRepo } from "./adapters/pg-kysely.book-tables.repo"
import { SupabaseJsBookTablesRepo } from "./adapters/supabase-js.book-tables.repo"
import { BookTablesController } from "./book-tables.controller"
import { BookTablesRepo } from "./book-tables.repository"
import { BookTablesService } from "./book-tables.service"

// Módulo `book-tables` (docs/arquitectura/v6-separacion-front-back.md §2.5 y §2.6): CRUD genérico del libro con
// BOOK_TABLE_POLICY. Dueño: F2-C (lectura, hecha: lista por tabla y snapshot) y F2-D (escritura: PUT, DELETE y
// restore en este mismo controller/servicio/puerto). Exporta BookTablesService (loadBook) para insights y gami.
@Module({
  controllers: [BookTablesController],
  providers: [BookTablesService, repoProvider(BookTablesRepo, { supabase: SupabaseJsBookTablesRepo, pg: PgKyselyBookTablesRepo })],
  exports: [BookTablesService, BookTablesRepo],
})
export class BookTablesModule {}
