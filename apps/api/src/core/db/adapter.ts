// Elige el adaptador de un puerto según DB_ADAPTER (supabase | pg), sin que el servicio lo sepa (§2.1).
import type { Provider, Type } from "@nestjs/common"
import { AppConfig } from "../config/app-config"
import { PgKyselyFactory } from "./pg-kysely.factory"
import { SupabaseJsFactory } from "./supabase-js.factory"

export function repoProvider<P>(port: abstract new (...a: never[]) => P, impl: { supabase: Type<P> & (new (sb: SupabaseJsFactory) => P); pg: Type<P> & (new (pg: PgKyselyFactory) => P) }): Provider {
  return {
    provide: port,
    inject: [AppConfig, SupabaseJsFactory, PgKyselyFactory],
    useFactory: (config: AppConfig, sb: SupabaseJsFactory, pg: PgKyselyFactory) => (config.db.adapter === "pg" ? new impl.pg(pg) : new impl.supabase(sb)),
  }
}
