// Módulo global del almacenamiento de archivos (V7-E): un solo ObjectStore para toda la API, elegido con OBJECT_STORE
// (files.config.ts). Lo importa CoreModule; cualquier módulo inyecta `ObjectStore` sin importar nada más.
// Los adaptadores de nube se cargan con import() (y sus SDK también), así solo se carga el que se usa.
import { Global, Inject, Injectable, Module, type OnApplicationBootstrap } from "@nestjs/common"
import type { Logger } from "pino"
import { SupabaseJsFactory } from "../db/supabase-js.factory"
import { LOGGER } from "../logging/logger"
import { loadFilesConfig, type FilesConfig } from "./files.config"
import { MemoryObjectStore } from "./memory.object-store"
import { ObjectStore } from "./object-store"
import { SupabaseStorageObjectStore } from "./supabase.object-store"

export const FILES_CONFIG = Symbol("mirai.files-config")

/** Crea el adaptador de la configuración (también lo usan las pruebas y la herramienta de migración). */
export async function createObjectStore(cfg: FilesConfig, deps: { sb?: SupabaseJsFactory } = {}): Promise<ObjectStore> {
  switch (cfg.driver) {
    case "memory":
      return new MemoryObjectStore()
    case "s3": {
      const { createS3ObjectStore } = await import("../../adapters/aws/object-store")
      return createS3ObjectStore({ region: cfg.s3.region, endpoint: cfg.s3.endpoint, publicEndpoint: cfg.s3.publicEndpoint, forcePathStyle: cfg.s3.forcePathStyle, buckets: cfg.buckets, publicBaseUrl: cfg.publicBaseUrl })
    }
    case "gcs": {
      const { createGcsObjectStore } = await import("../../adapters/gcp/object-store")
      return createGcsObjectStore({ buckets: cfg.buckets, publicBaseUrl: cfg.publicBaseUrl, endpoint: cfg.gcs.endpoint, signedHost: cfg.gcs.signedHost, project: cfg.gcs.project })
    }
    case "azure-blob": {
      const { createAzureBlobObjectStore } = await import("../../adapters/azure/object-store")
      return createAzureBlobObjectStore({ accounts: cfg.azure.accounts, container: cfg.azure.container, connectionString: cfg.azure.connectionString, endpoint: cfg.azure.endpoint, publicBaseUrl: cfg.publicBaseUrl })
    }
    case "supabase":
      if (!deps.sb) throw new Error("OBJECT_STORE=supabase necesita SupabaseJsFactory")
      return new SupabaseStorageObjectStore(deps.sb)
  }
}

@Injectable()
class ObjectStoreAnnouncer implements OnApplicationBootstrap {
  constructor(
    private readonly store: ObjectStore,
    @Inject(FILES_CONFIG) private readonly cfg: FilesConfig,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}
  onApplicationBootstrap() {
    this.log.debug({ objectStore: this.store.driver, publicFiles: !!this.cfg.publicBaseUrl }, "Archivos listos")
  }
}

@Global()
@Module({
  providers: [
    { provide: FILES_CONFIG, useFactory: () => loadFilesConfig() },
    { provide: ObjectStore, inject: [FILES_CONFIG, SupabaseJsFactory], useFactory: (cfg: FilesConfig, sb: SupabaseJsFactory) => createObjectStore(cfg, { sb }) },
    ObjectStoreAnnouncer,
  ],
  exports: [ObjectStore, FILES_CONFIG],
})
export class ObjectStoreModule {}
