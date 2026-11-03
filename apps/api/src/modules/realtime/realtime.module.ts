import { Module } from "@nestjs/common"

// Módulo `realtime` (docs/arquitectura/v6-separacion-front-back.md §2.6): gateway socket.io (servicio aparte, MODE=realtime).
// Dueño: F2-G. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/realtime.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class RealtimeModule {}
