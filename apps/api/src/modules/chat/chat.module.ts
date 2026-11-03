import { Module } from "@nestjs/common"

// Módulo `chat` (docs/arquitectura/v6-separacion-front-back.md §2.6): chat en streaming NDJSON, hilos y propuestas.
// Dueño: F2-F. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/chat.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class ChatModule {}
