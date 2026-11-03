// Módulo `files` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D; lo llenó V7-G (E14 de
// docs/arquitectura/v7-gcp-total.md, reglas de §3.4).
// Endpoints: URL firmadas de subida y descarga, borrar archivo.
//
// La autorización de Storage pasa a la API (las políticas de storage.objects no se llevan a otra nube): cada bucket
// lógico tiene su regla, su tamaño máximo y sus tipos de archivo (los de las migraciones):
//   attachments, logos → `{bookId}/…`: miembro del libro (ver: cualquier rol; subir/borrar: «Edita» o más)
//   feedback           → `{userId}/…`: solo la persona (la consola lee con su propia ruta)
//   avatars            → `{userId}/…`: solo la persona; público (URL directa)
//   ads, public-assets → administradores de la plataforma; públicos
// Los respaldos (`backups`) NO van por aquí: tienen sus rutas en `import` (solo «Administra»).
// Flujo: POST uploads → PUT directo a `uploadUrl` con `headers` → POST uploads/complete { uploadId } (revisa que el
// archivo exista y cumpla los límites) → la web guarda la ruta donde corresponda (adjunto, captura, foto…).
export const meta = { id: "files", owner: "F2-D" } as const
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiError, ApiOk, COMMON_ERRORS, Uuid } from "../common"

export const FILE_BUCKETS = ["attachments", "logos", "feedback", "avatars", "ads", "public-assets"] as const
export type FileBucket = (typeof FILE_BUCKETS)[number]

const IMG = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const
/** Tamaño máximo y tipos permitidos por bucket (file_size_limit / allowed_mime_types de las migraciones). */
export const BUCKET_RULES: Record<FileBucket, { maxBytes: number; mime: readonly string[] | null; public: boolean }> = {
  // allowed_mime_types de 20261103001400_seguridad.sql (fotos de facturas del celular: HEIC/HEIF/AVIF).
  attachments: { maxBytes: 15 * 1024 * 1024, mime: ["application/pdf", ...IMG, "image/heic", "image/heif", "image/avif"], public: false },
  logos: { maxBytes: 2 * 1024 * 1024, mime: IMG, public: false },
  feedback: { maxBytes: 5 * 1024 * 1024, mime: IMG, public: false },
  avatars: { maxBytes: 2 * 1024 * 1024, mime: IMG, public: true },
  ads: { maxBytes: 2 * 1024 * 1024, mime: IMG, public: true },
  "public-assets": { maxBytes: 5 * 1024 * 1024, mime: ["image/png", "image/jpeg"], public: true },
}

const Bucket = z.enum(FILE_BUCKETS, { error: "Ese tipo de archivo no se sube por aquí" })
/** Ruta dentro del bucket: carpetas y nombre sin `..`, sin barras al inicio ni caracteres de control. */
export const FileKey = z.string().min(3).max(500).regex(/^(?!\/)(?!.*\.\.)(?!.*\/\/)[\w\-./ ()áéíóúñÁÉÍÓÚÑ]+$/, "Ruta de archivo inválida")

export const NewUpload = z.object({
  bucket: Bucket,
  /** attachments y logos: el libro dueño del archivo. */
  bookId: Uuid.optional(),
  /** Subcarpeta opcional (p. ej. `renta/2025`). */
  folder: z.string().max(80).regex(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/, "Carpeta inválida").optional(),
  name: z.string().trim().min(1, "Falta el nombre del archivo").max(120, "El nombre del archivo es muy largo"),
  type: z.string().min(3).max(100).regex(/^[\w.+-]+\/[\w.+-]+$/, "Tipo de archivo inválido"),
  size: z.number().int().positive("El archivo está vacío"),
})
export type NewUpload = z.infer<typeof NewUpload>

export const Upload = z.object({
  /** Ticket cifrado (bucket, ruta, persona y vencimiento): va en el cuerpo de `complete` (es más largo que un parámetro de ruta). */
  uploadId: z.string(),
  bucket: Bucket,
  key: z.string(),
  method: z.literal("PUT"),
  uploadUrl: z.string(),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string(),
  /** Buckets públicos: la dirección final del archivo. */
  publicUrl: z.string().nullable(),
})
export const Completed = z.object({ bucket: Bucket, key: z.string(), size: z.number(), contentType: z.string().nullable(), publicUrl: z.string().nullable() })
export const FileRef = z.object({ bucket: Bucket, key: FileKey })
export const FileUrlQuery = FileRef.extend({ download: z.enum(["1", "0"]).optional() })
export const FileUrl = z.object({ url: z.string(), expiresAt: z.string().nullable() })

const ERR = { ...COMMON_ERRORS, 502: ApiError } as const

const c = initContract()
export const filesContract = c.router(
  {
    createUpload: { method: "POST", path: "/v1/files/uploads", body: NewUpload, responses: { ...ERR, 200: ApiOk(Upload) }, summary: "Pide una URL firmada para subir un archivo (10 min; revisa permiso, tamaño y tipo; acepta Idempotency-Key)" },
    completeUpload: { method: "POST", path: "/v1/files/uploads/complete", body: z.object({ uploadId: z.string().min(4).max(1000) }), responses: { ...ERR, 200: ApiOk(Completed) }, summary: "Confirma la subida: el archivo existe y cumple los límites (si no, se borra)" },
    url: { method: "GET", path: "/v1/files/url", query: FileUrlQuery, responses: { ...ERR, 200: FileUrl }, summary: "URL para ver o descargar un archivo (privados: firmada de 5 min; públicos: la dirección directa)" },
    remove: { method: "DELETE", path: "/v1/files", body: FileRef, responses: { ...ERR, 200: ApiOk(z.object({ deleted: z.boolean() })) }, summary: "Borra un archivo (mismas reglas que subir)" },
  },
  { strictStatusCodes: true },
)
