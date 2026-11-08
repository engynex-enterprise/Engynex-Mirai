// Archivos por la API. Flujo:
//   POST /v1/files/uploads (la API revisa permiso, tamaño y tipo, y arma la ruta) → PUT directo al almacenamiento con
//   la URL firmada y sus encabezados (S3, R2, GCS…: la web no sabe cuál) → POST /v1/files/uploads/complete
//   (la API revisa que el archivo exista, pese lo declarado y su contenido sea del tipo; si no, lo borra).
// El núcleo es puro (recibe el cliente y fetch) para probarlo sin red: upload.test.ts.
import type { FileBucket } from "@mirai/contracts/modules/files"
import { BUCKET_RULES } from "@mirai/contracts/modules/files"
import { ApiError } from "@/lib/api/errors"

export type UploadInput = { bucket: FileBucket; body: Blob; name: string; type?: string; bookId?: string; folder?: string }
export type Uploaded = { bucket: FileBucket; key: string; size: number; contentType: string | null; publicUrl: string | null }

type Signed = { uploadId: string; key: string; method: "PUT"; uploadUrl: string; headers: Record<string, string>; publicUrl: string | null }
/** Lo mínimo del cliente tipado que se usa (así la prueba pasa un doble). */
export type FilesApi = {
  createUpload: (a: { body: { bucket: FileBucket; bookId?: string; folder?: string; name: string; type: string; size: number } }) => Promise<{ status: number; body: unknown; headers: Headers }>
  completeUpload: (a: { body: { uploadId: string } }) => Promise<{ status: number; body: unknown; headers: Headers }>
  url: (a: { query: { bucket: FileBucket; key: string; download?: "1" | "0" } }) => Promise<{ status: number; body: unknown; headers: Headers }>
}

const data = <T>(r: { status: number; body: unknown; headers: Headers }): T => {
  if (r.status >= 200 && r.status < 300) {
    const b = r.body as { ok?: boolean; data?: T } | T
    return (b && typeof b === "object" && "ok" in (b as object) ? (b as { data: T }).data : b) as T
  }
  throw ApiError.from(r.status, r.body, r.headers)
}

/** Antes de pedir la firma: los mismos límites de la API, para avisar sin viajar a la red. */
export function precheck(i: Pick<UploadInput, "bucket" | "body" | "type">): string | null {
  const r = BUCKET_RULES[i.bucket]
  const type = i.type || i.body.type
  if (!i.body.size) return "El archivo está vacío."
  if (i.body.size > r.maxBytes) return `El archivo pesa ${(i.body.size / 1024 / 1024).toFixed(1)} MB: el máximo aquí es ${Math.round(r.maxBytes / 1024 / 1024)} MB.`
  if (r.mime && !r.mime.includes(type)) return "Ese tipo de archivo no está permitido aquí."
  return null
}

/** Sube con el cliente dado (puro). Lanza ApiError con el mensaje en español de la API. */
export async function uploadWith(api: FilesApi, i: UploadInput, f: typeof fetch = fetch): Promise<Uploaded> {
  const type = i.type || i.body.type || "application/octet-stream"
  const bad = precheck({ ...i, type })
  if (bad) throw ApiError.from(400, { ok: false, code: "VALIDATION", msg: bad })
  const s = data<Signed>(await api.createUpload({ body: { bucket: i.bucket, bookId: i.bookId, folder: i.folder, name: i.name, type, size: i.body.size } }))
  let put: Response
  try {
    put = await f(s.uploadUrl, { method: s.method, headers: s.headers, body: i.body })
  } catch {
    throw ApiError.from(503, { ok: false, code: "UPSTREAM", msg: "No pudimos subir el archivo. Revisa tu conexión e intenta de nuevo." })
  }
  if (!put.ok) throw ApiError.from(put.status === 403 ? 400 : 502, { ok: false, code: put.status === 403 ? "VALIDATION" : "UPSTREAM", msg: put.status === 403 ? "El archivo no coincide con lo que se iba a subir (tamaño o tipo). Vuelve a elegirlo." : "No pudimos subir el archivo. Intenta de nuevo en un momento." })
  return data<Uploaded>(await api.completeUpload({ body: { uploadId: s.uploadId } }))
}

/** URL para ver (pública directa o firmada de 5 min) o descargar. */
export async function fileUrlWith(api: FilesApi, bucket: FileBucket, key: string, download = false): Promise<string> {
  return data<{ url: string }>(await api.url({ query: { bucket, key, ...(download ? { download: "1" as const } : {}) } })).url
}

const client = async (): Promise<FilesApi> => {
  const { browserApi } = await import("@/lib/api/client")
  return browserApi().files as unknown as FilesApi
}

/** Sube por la API (navegador). */
export async function uploadFile(i: UploadInput): Promise<Uploaded> {
  return uploadWith(await client(), i)
}

/** URL de un archivo por la API (navegador). */
export async function fileUrl(bucket: FileBucket, key: string, download = false): Promise<string> {
  return fileUrlWith(await client(), bucket, key, download)
}
