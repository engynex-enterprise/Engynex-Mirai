import { Injectable } from "@nestjs/common"
import { AppConfig } from "../config/app-config"
import { PgKyselyFactory } from "./pg-kysely.factory"
import { SupabaseJsFactory } from "./supabase-js.factory"

/** Revisión de la base para /readyz según el adaptador activo (DB_ADAPTER). */
@Injectable()
export class DbHealth {
  constructor(
    private readonly config: AppConfig,
    private readonly sb: SupabaseJsFactory,
    private readonly pg: PgKyselyFactory,
  ) {}
  check() {
    return this.config.db.adapter === "pg" ? this.pg.ping() : this.sb.ping()
  }
}
