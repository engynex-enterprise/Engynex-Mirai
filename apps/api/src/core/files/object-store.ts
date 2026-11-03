// Puerto ObjectStore (V7-E, D5 y §3.4 de docs/arquitectura/v7-gcp-total.md): lo único que la API sabe del almacenamiento
// de archivos. Los servicios (FilesService, respaldos, IA, contador, consola, supresión de datos) solo conocen esta
// clase; el adaptador se elige con OBJECT_STORE (files.config.ts):
//   supabase    Storage de Supabase con la clave del sistema (hoy; por defecto)
//   gcs         Cloud Storage (ADC; URL firmadas V4 con signBlob, sin llaves)         → adapters/gcp/object-store.ts
//   s3          AWS S3 y compatibles (MinIO en local, Cloudflare R2…)                  → adapters/aws/object-store.ts
//   azure-blob  Azure Blob Storage (identidad administrada + SAS de delegación)       → adapters/azure/object-store.ts
//   memory      pruebas y desarrollo sin nube
// Las rutas lógicas no cambian entre adaptadores: el bucket lógico de Supabase (`attachments`, `avatars`…) va como
// prefijo dentro del bucket físico (private / backups / public), así lo guardado en la base sigue sirviendo.
// La autorización NO vive aquí: la hace quien llama (FilesService con las reglas de cada bucket, BookGuard…).
import type { StoreBucket } from "./buckets"

export type SignedUpload = { url: string; headers: Record<string, string>; expiresAt: string }
export type ObjectInfo = { size: number; contentType: string | null; md5?: string | null; etag?: string | null; updated?: string | null }
export type ObjectEntry = ObjectInfo & { key: string }

export type SignUploadArgs = {
  bucket: StoreBucket
  key: string
  contentType: string
  /** Máximo permitido en el bucket (GCS lo firma como `x-goog-content-length-range`). */
  maxBytes: number
  ttlS: number
  /** Tamaño exacto declarado (S3 lo firma como `content-length`: otro tamaño = firma inválida). */
  size?: number
}
export type SignDownloadArgs = { bucket: StoreBucket; key: string; ttlS: number; download?: boolean; filename?: string }
export type WriteArgs = { bucket: StoreBucket; key: string; body: Buffer | Uint8Array | string; contentType: string; cacheControl?: string }

export abstract class ObjectStore {
  /** Nombre del adaptador (métricas, logs y para que los módulos con adaptador propio de Supabase sepan cuál usar). */
  readonly driver: string = "custom"

  /** URL para subir con PUT directo desde el navegador (expira en `ttlS`; tamaño y tipo ya revisados por quien llama). */
  abstract signUpload(a: SignUploadArgs): Promise<SignedUpload>
  /** URL firmada para leer (o descargar con `download`, opcionalmente con otro nombre de archivo). */
  abstract signDownload(a: SignDownloadArgs): Promise<string>
  /** Tamaño y tipo del objeto, o null si no existe. */
  abstract head(a: { bucket: StoreBucket; key: string }): Promise<ObjectInfo | null>
  /** Contenido del objeto (o un rango de bytes, ambos incluidos), o null si no existe. */
  abstract read(a: { bucket: StoreBucket; key: string; range?: [start: number, end: number] }): Promise<Buffer | null>
  /** Escribe (o reemplaza) un objeto desde el servidor (respaldos, migración). */
  abstract write(a: WriteArgs): Promise<void>
  /** Objetos de una carpeta y sus subcarpetas (`prefix` = carpeta sin "/" final; vacío = todo el bucket lógico). */
  abstract list(a: { bucket: StoreBucket; prefix: string; limit?: number }): Promise<ObjectEntry[]>
  /** Borra objetos (los que no existen se ignoran). Devuelve cuántos pidió borrar que existían o se borraron. */
  abstract remove(bucket: StoreBucket, keys: string[]): Promise<number>
  /** Dirección pública directa (buckets públicos: avatars, ads, public-assets). */
  abstract publicUrl(bucket: StoreBucket, key: string): string

  /** Borra todo lo de una carpeta (supresión de datos, Ley 1581). */
  async removePrefix(bucket: StoreBucket, prefix: string): Promise<number> {
    const keys = (await this.list({ bucket, prefix })).map((o) => o.key)
    let n = 0
    for (let i = 0; i < keys.length; i += 500) n += await this.remove(bucket, keys.slice(i, i + 500))
    return n
  }
}

/** ¿La ruta es segura? (sin `..`, sin `//`, sin barra inicial ni caracteres de control). */
export function assertKey(key: string): string {
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("//") || /[\u0000-\u001f\u007f\\]/.test(key) || key.length > 900)
    throw new Error(`Ruta de archivo inválida: ${JSON.stringify(key.slice(0, 80))}`)
  return key
}

/** Carpeta para listar: sin barras al final y con "/" al final si no está vacía (así `abc` no trae `abcd/…`). */
export const folderPrefix = (prefix: string) => {
  const p = prefix.replace(/^\/+|\/+$/g, "")
  if (p) assertKey(p)
  return p ? `${p}/` : ""
}

/** Nombre del objeto dentro del bucket físico: `<bucket lógico>/<ruta>`. */
export const objectName = (bucket: StoreBucket, key: string) => `${bucket}/${assertKey(key)}`

/** De vuelta: la ruta lógica a partir del nombre del objeto (o null si es de otro bucket lógico). */
export const keyOf = (bucket: StoreBucket, name: string) => (name.startsWith(`${bucket}/`) ? name.slice(bucket.length + 1) : null)

/** `Content-Disposition` para descargar con un nombre (RFC 6266, con versión UTF-8). */
export function contentDisposition(filename: string | undefined, key: string): string {
  const name = (filename || key.split("/").pop() || "archivo").replace(/[\r\n"]/g, "")
  const ascii = name.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/[\\%]/g, "") || "archivo"
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

