// Configuración del almacenamiento de archivos (V7-E). Solo variables de entorno; cada nube las llena con Terraform
// (infra/terraform/clouds/<nube>: OBJECT_STORE, STORAGE_BUCKET_*, PUBLIC_FILES_URL y las propias de la nube).
// Se valida aparte de config.schema.ts para no mezclar frentes; el mensaje de error solo dice QUÉ variable falta.
//
//   OBJECT_STORE=supabase (por defecto) | gcs | s3 | azure-blob | memory
//   STORAGE_BUCKET_PRIVATE / STORAGE_BUCKET_BACKUPS / STORAGE_BUCKET_PUBLIC   buckets físicos (en Azure: cuentas)
//   PUBLIC_FILES_URL      https://files.mirai.engynex.com (CDN delante del bucket público; sin ella, la URL del bucket)
//   gcs:   GCS_ENDPOINT (fake-gcs-server en local), GCS_SIGNED_HOST (host de las URL firmadas en local), GCP_PROJECT.
//          La cuenta que firma sale sola del servidor de metadatos (Cloud Run) y firma con IAM signBlob.
//   s3:    S3_REGION (o AWS_REGION), S3_ENDPOINT (MinIO, R2…), S3_FORCE_PATH_STYLE=1 (MinIO), S3_PUBLIC_ENDPOINT
//          (la que ve el navegador si difiere de S3_ENDPOINT). Credenciales: la cadena estándar de AWS (rol de la tarea
//          de ECS, variables AWS_*…); nunca en el código.
//   azure: AZURE_STORAGE_ACCOUNT_PRIVATE/_BACKUPS/_PUBLIC (por defecto STORAGE_BUCKET_*), AZURE_STORAGE_CONTAINER
//          (por defecto "objetos"), AZURE_STORAGE_CONNECTION_STRING (solo Azurite/desarrollo; en la nube, identidad
//          administrada con AZURE_CLIENT_ID opcional), AZURE_STORAGE_ENDPOINT (plantilla: https://{account}.blob.core.windows.net)
import { z } from "zod"
import type { PhysicalBucket } from "./buckets"

const opt = z.string().trim().min(1).optional()
const bool = z.enum(["1", "0", "true", "false", ""]).optional().transform((v) => v === "1" || v === "true")

export const FilesEnv = z
  .object({
    OBJECT_STORE: z.enum(["supabase", "gcs", "s3", "azure-blob", "memory"]).default("supabase"),
    STORAGE_BUCKET_PRIVATE: opt,
    STORAGE_BUCKET_BACKUPS: opt,
    STORAGE_BUCKET_PUBLIC: opt,
    PUBLIC_FILES_URL: z.url({ error: "PUBLIC_FILES_URL debe ser una URL (https://…)" }).optional(),
    GCS_ENDPOINT: z.url().optional(),
    GCS_SIGNED_HOST: z.url().optional(),
    GCP_PROJECT: opt,
    S3_REGION: opt,
    AWS_REGION: opt,
    S3_ENDPOINT: z.url().optional(),
    S3_PUBLIC_ENDPOINT: z.url().optional(),
    S3_FORCE_PATH_STYLE: bool,
    AZURE_STORAGE_ACCOUNT_PRIVATE: opt,
    AZURE_STORAGE_ACCOUNT_BACKUPS: opt,
    AZURE_STORAGE_ACCOUNT_PUBLIC: opt,
    AZURE_STORAGE_CONTAINER: z.string().trim().min(3).default("objetos"),
    AZURE_STORAGE_CONNECTION_STRING: opt,
    AZURE_STORAGE_ENDPOINT: opt,
  })
  .transform((e, ctx) => {
    const need = (cond: unknown, path: string, message: string) => {
      if (!cond) ctx.addIssue({ code: "custom", path: [path], message })
    }
    const buckets: Record<PhysicalBucket, string> = { private: e.STORAGE_BUCKET_PRIVATE ?? "", backups: e.STORAGE_BUCKET_BACKUPS ?? "", public: e.STORAGE_BUCKET_PUBLIC ?? "" }
    if (e.OBJECT_STORE === "gcs" || e.OBJECT_STORE === "s3") {
      for (const [k, v] of Object.entries(buckets)) need(v, `STORAGE_BUCKET_${k.toUpperCase()}`, `OBJECT_STORE=${e.OBJECT_STORE} necesita STORAGE_BUCKET_${k.toUpperCase()}`)
    }
    const accounts: Record<PhysicalBucket, string> = {
      private: e.AZURE_STORAGE_ACCOUNT_PRIVATE ?? buckets.private,
      backups: e.AZURE_STORAGE_ACCOUNT_BACKUPS ?? buckets.backups,
      public: e.AZURE_STORAGE_ACCOUNT_PUBLIC ?? buckets.public,
    }
    if (e.OBJECT_STORE === "azure-blob" && !e.AZURE_STORAGE_CONNECTION_STRING)
      for (const [k, v] of Object.entries(accounts)) need(v, `AZURE_STORAGE_ACCOUNT_${k.toUpperCase()}`, `OBJECT_STORE=azure-blob necesita AZURE_STORAGE_ACCOUNT_${k.toUpperCase()} (o STORAGE_BUCKET_${k.toUpperCase()})`)
    if (e.OBJECT_STORE === "s3") need(e.S3_REGION ?? e.AWS_REGION ?? (e.S3_ENDPOINT ? "auto" : undefined), "S3_REGION", "OBJECT_STORE=s3 necesita S3_REGION (o AWS_REGION)")
    return {
      driver: e.OBJECT_STORE,
      buckets,
      publicBaseUrl: e.PUBLIC_FILES_URL?.replace(/\/+$/, ""),
      gcs: { endpoint: e.GCS_ENDPOINT, signedHost: e.GCS_SIGNED_HOST, project: e.GCP_PROJECT },
      s3: { region: e.S3_REGION ?? e.AWS_REGION ?? "auto", endpoint: e.S3_ENDPOINT, publicEndpoint: e.S3_PUBLIC_ENDPOINT, forcePathStyle: e.S3_FORCE_PATH_STYLE },
      azure: {
        accounts,
        container: e.AZURE_STORAGE_CONTAINER,
        connectionString: e.AZURE_STORAGE_CONNECTION_STRING,
        endpoint: e.AZURE_STORAGE_ENDPOINT ?? "https://{account}.blob.core.windows.net",
      },
    }
  })

export type FilesConfig = z.output<typeof FilesEnv>

/** Lee y valida la configuración de archivos. Lanza con los nombres de las variables que faltan (nunca valores). */
export function loadFilesConfig(env: NodeJS.ProcessEnv = process.env): FilesConfig {
  const r = FilesEnv.safeParse(env)
  if (!r.success) throw new Error(`Configuración de archivos inválida:\n${r.error.issues.map((i) => `  - ${i.path.join(".") || "(entorno)"}: ${i.message}`).join("\n")}`)
  return r.data
}
