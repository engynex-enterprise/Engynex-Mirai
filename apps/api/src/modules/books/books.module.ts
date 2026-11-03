import { Module } from "@nestjs/common"
import { RowStoreModule } from "../../core/store/row-store.module"
import { HouseholdsModule } from "../households/households.module"
import { BooksController } from "./books.controller"
import { BooksService } from "./books.service"

// Módulo `books` (docs/arquitectura/v6-separacion-front-back.md §2.6): libros y ajustes del libro.
// Dueño: F2-I; V7-G lo llenó: crear (create_book + límite del plan), editar, papelera y «Deshacer», y book_settings.
// Datos por RowStore (core/store: supabase-js hoy, Kysely en Postgres propio) con la sesión de la persona.
@Module({
  imports: [RowStoreModule, HouseholdsModule],
  controllers: [BooksController],
  providers: [BooksService],
})
export class BooksModule {}
