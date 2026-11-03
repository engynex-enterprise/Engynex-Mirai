import { Module } from "@nestjs/common"

// Módulo `books` (docs/arquitectura/v6-separacion-front-back.md §2.6): libros y ajustes del libro.
// Dueño: F2-I. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/books.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class BooksModule {}
