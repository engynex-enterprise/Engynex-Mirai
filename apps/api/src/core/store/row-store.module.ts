// RowStoreModule: elige el adaptador de RowStore según DB_ADAPTER (supabase | pg), como repoProvider. Los módulos de
// V7-G lo importan; no está en CoreModule para no tocar el núcleo compartido.
import { Module } from "@nestjs/common"
import { repoProvider } from "../db/adapter"
import { PgKyselyRowStore } from "./pg-kysely.row-store"
import { RowStore } from "./row-store"
import { SupabaseJsRowStore } from "./supabase-js.row-store"

@Module({
  providers: [repoProvider(RowStore, { supabase: SupabaseJsRowStore, pg: PgKyselyRowStore })],
  exports: [RowStore],
})
export class RowStoreModule {}
