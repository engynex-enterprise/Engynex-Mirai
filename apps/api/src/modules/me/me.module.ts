import { Module } from "@nestjs/common"
import { RowStoreModule } from "../../core/store/row-store.module"
import { MeController } from "./me.controller"
import { MeService } from "./me.service"
import { ProfileController } from "./profile.controller"
import { ProfileService } from "./profile.service"

// Módulo `me` (auth, §2.6, F2-B-8). Dueño: F2-B. Usa AppContextService del núcleo (también lo usa BookGuard).
// V7-G: perfil, preferencias, libro activo y lo público de la plataforma (aviso para todos
// e integraciones encendidas), con RowStore (core/store).
@Module({ imports: [RowStoreModule], controllers: [MeController, ProfileController], providers: [MeService, ProfileService], exports: [MeService] })
export class MeModule {}
