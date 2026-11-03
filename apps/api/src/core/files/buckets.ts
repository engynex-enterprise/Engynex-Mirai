// Buckets lógicos de Mirai (los 7 de Supabase, §1.5 de docs/arquitectura/v7-gcp-total.md) y dónde viven en la nube
// (los 3 buckets físicos de Terraform: capabilities/object-storage → STORAGE_BUCKET_PRIVATE / _BACKUPS / _PUBLIC).
//   attachments  {book_id}/renta/{año}/{uuid}-{nombre}, adjuntos de gastos, documentos para la IA   → private
//   logos        {book_id}/…                                                                       → private
//   feedback     {user_id}/{uuid}.{ext} (capturas de las opiniones)                                → private
//   backups      {book_id}/{fecha}-{tipo}.json (respaldos y exportaciones del libro)               → backups
//   avatars      {user_id}/{uuid}.webp (foto de perfil)                                            → public
//   ads          {uuid}.{ext} (imágenes de anuncios propios)                                       → public
//   public-assets whatsapp/{uuid}.{png,jpg} (encabezados de plantillas de WhatsApp)                → public
import { BUCKET_RULES, FILE_BUCKETS, type FileBucket } from "@mirai/contracts/modules/files"

export type StoreBucket = FileBucket | "backups"
export const STORE_BUCKETS: readonly StoreBucket[] = [...FILE_BUCKETS, "backups"]
export type PhysicalBucket = "private" | "backups" | "public"
export const PHYSICAL_BUCKETS: readonly PhysicalBucket[] = ["private", "backups", "public"]

export const PHYSICAL: Record<StoreBucket, PhysicalBucket> = {
  attachments: "private",
  logos: "private",
  feedback: "private",
  backups: "backups",
  avatars: "public",
  ads: "public",
  "public-assets": "public",
}

/** Límites del bucket de respaldos (file_size_limit / allowed_mime_types de las migraciones). Los respaldos no se suben desde el navegador. */
export const BACKUP_RULE = { maxBytes: 50 * 1024 * 1024, mime: ["application/json"] as readonly string[], public: false }

/** Tamaño máximo, tipos permitidos y si es público, para cualquiera de los 7 buckets. */
export const ruleOf = (b: StoreBucket) => (b === "backups" ? BACKUP_RULE : BUCKET_RULES[b])

export const isStoreBucket = (b: string): b is StoreBucket => (STORE_BUCKETS as readonly string[]).includes(b)
