import { Module } from "@nestjs/common"

// Módulo `book-tables` (docs/arquitectura/v6-separacion-front-back.md §2.6): CRUD genérico del libro con BOOK_TABLE_POLICY (§2.5).
// Dueño: F2-C (lectura) y F2-D (escritura). Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/book-tables.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class BookTablesModule {}
