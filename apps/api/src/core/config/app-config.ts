import type { Config } from "./config.schema"

/**
 * Configuración validada, inyectable por clase (`constructor(private readonly config: AppConfig)`).
 * La interfaz le da al token los campos de Config; el valor lo pone CoreModule con `loadConfig()`.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface AppConfig extends Config {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class AppConfig {}
