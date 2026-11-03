// Módulo raíz: núcleo + módulos de negocio según MODE (api | realtime, D8: el gateway va en otro servicio).
import { type DynamicModule, Module } from "@nestjs/common"
import { CoreModule, type CoreOptions } from "./core/core.module"
import { apiModules, realtimeModules } from "./modules"

@Module({})
export class AppModule {
  static register(o: CoreOptions): DynamicModule {
    return { module: AppModule, imports: [CoreModule.forRoot(o), ...(o.config.mode === "realtime" ? realtimeModules() : apiModules())] }
  }
}
