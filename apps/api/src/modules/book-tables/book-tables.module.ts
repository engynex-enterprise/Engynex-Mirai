import { Module } from "@nestjs/common"
import { repoProvider } from "../../core/db/adapter"
import { PgKyselyBookStore } from "./adapters/pg-kysely.book-store"
import { PgKyselyBookTablesRepo } from "./adapters/pg-kysely.book-tables.repo"
import { SupabaseJsBookStore } from "./adapters/supabase-js.book-store"
import { SupabaseJsBookTablesRepo } from "./adapters/supabase-js.book-tables.repo"
import { BookTablesController } from "./book-tables.controller"
import { BookTablesRepo } from "./book-tables.repository"
import { BookTablesService } from "./book-tables.service"
import { BookStore } from "./book-store"
import { BookWritesService } from "./book-writes.service"

// Módulo `book-tables` (docs/arquitectura/v6-separacion-front-back.md §2.5 y §2.6): CRUD genérico del libro con
// BOOK_TABLE_POLICY. Dueño: F2-C (lectura, hecha: lista por tabla y snapshot) y F2-D (escritura: PUT, DELETE y
// restore con BookWritesService y el puerto BookStore). Exporta BookTablesService (loadBook) para insights y gami, y
// BookStore + BookWritesService para los módulos de escritura (gastos, fijos, tarjetas, préstamos, ahorro…).
@Module({
  controllers: [BookTablesController],
  providers: [
    BookTablesService,
    BookWritesService,
    repoProvider(BookTablesRepo, { supabase: SupabaseJsBookTablesRepo, pg: PgKyselyBookTablesRepo }),
    repoProvider(BookStore, { supabase: SupabaseJsBookStore, pg: PgKyselyBookStore }),
  ],
  exports: [BookTablesService, BookTablesRepo, BookStore, BookWritesService],
})
export class BookTablesModule {}
