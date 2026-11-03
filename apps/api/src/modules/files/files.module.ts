import { Module } from "@nestjs/common"
import { FilesController } from "./files.controller"
import { FilesService } from "./files.service"

// Módulo `files` (docs/arquitectura/v6-separacion-front-back.md §2.6): URL firmadas de subida y descarga.
// Dueño: F2-D; V7-G lo llenó (E14): reglas por bucket en FilesService sobre el puerto ObjectStore de V7-E
// (core/files). El adaptador lo elige OBJECT_STORE (supabase por defecto, gcs, s3, azure-blob, memory) en
// core/files/object-store.module.ts, que es global: opiniones, contador, IA y respaldos inyectan ObjectStore sin
// importar este módulo.
@Module({
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
