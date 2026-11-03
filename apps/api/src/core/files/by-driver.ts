// Provider que elige entre el adaptador "de Supabase" de un módulo (el de hoy, idéntico a la web) y el que usa el
// puerto ObjectStore (gcs, s3, azure-blob, memory), según el ObjectStore que quedó configurado (OBJECT_STORE).
//   providers: [byObjectStore(BackupStorage, SupabaseBackupStorage, ObjectStoreBackupStorage)]
import type { Provider, Type } from "@nestjs/common"
import { ModuleRef } from "@nestjs/core"
import { ObjectStore } from "./object-store"

export function byObjectStore<T>(token: abstract new (...a: never[]) => T, supabase: Type<T>, portable: Type<T>): Provider {
  return {
    provide: token,
    inject: [ObjectStore, ModuleRef],
    useFactory: (store: ObjectStore, ref: ModuleRef) => ref.create(store.driver === "supabase" ? supabase : portable),
  }
}
