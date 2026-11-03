import { Module } from "@nestjs/common"
import { MeController } from "./me.controller"
import { MeService } from "./me.service"

// Módulo `me` (auth, §2.6, F2-B-8). Dueño: F2-B. Usa AppContextService del núcleo (también lo usa BookGuard).
@Module({ controllers: [MeController], providers: [MeService], exports: [MeService] })
export class MeModule {}
