// Archivos (V7-G, E14): la API decide quién sube, lee o borra cada ruta (las mismas reglas de las políticas de
// storage.objects de las migraciones, §1.5 y §3.4 de docs/arquitectura/v7-gcp-total.md) y firma la operación en el
// puerto ObjectStore de V7-E (core/files: supabase, gcs, s3, azure-blob o memoria). La ruta la arma el servidor (la persona solo elige el libro, una subcarpeta y el nombre).
import { randomUUID } from "node:crypto"
import { Injectable } from "@nestjs/common"
import { BUCKET_RULES, type FileBucket, type NewUpload } from "@mirai/contracts/modules/files"
import { atLeast } from "@mirai/domain/household/roles"
import { AppContextService } from "../../core/context/app-context.service"
import { roleMsg } from "../../core/context/book.guard"
import { RequestContextService } from "../../core/context/request-context.service"
import { CryptoService } from "../../core/crypto/crypto.service"
import { DomainError } from "../../core/errors/domain-error"
import { ObjectStore } from "../../core/files/object-store"
import { contentMatches, SNIFF_BYTES } from "../../core/files/sniff"

export const UPLOAD_TTL_S = 600
export const DOWNLOAD_TTL_S = 300
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" }
const MIME_TXT: Record<string, string> = { "image/png": "PNG", "image/jpeg": "JPG", "image/webp": "WebP", "image/gif": "GIF" }

type Op = "read" | "write"
type Ticket = { b: FileBucket; k: string; u: string; s: number; t: string; e: number }

/** Nombre seguro para la ruta: sin tildes raras ni espacios, máximo 80 caracteres (conserva la extensión). */
export function safeName(name: string): string {
  const clean = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "")
  return (clean || "archivo").slice(-80)
}

const mb = (n: number) => `${Math.round((n / 1024 / 1024) * 10) / 10} MB`

@Injectable()
export class FilesService {
  constructor(
    private readonly store: ObjectStore,
    private readonly ctx: RequestContextService,
    private readonly contexts: AppContextService,
    private readonly crypto: CryptoService,
  ) {}

  private get uid() {
    return this.ctx.user.id
  }

  /** Revisa la regla del bucket para la ruta (404 si el libro no es de la persona; 403 si su rol no alcanza). */
  async authorize(bucket: FileBucket, key: string, op: Op): Promise<void> {
    const first = key.split("/")[0] ?? ""
    switch (bucket) {
      case "attachments":
      case "logos": {
        if (!UUID.test(first)) throw DomainError.notFound("No encontramos ese archivo.")
        const access = await this.contexts.bookAccess(this.ctx.user, first)
        if (!access) throw DomainError.notFound("No encontramos ese libro.")
        if (op === "write" && !atLeast(access.access, "editor")) throw DomainError.role(roleMsg("editor"))
        return
      }
      case "feedback":
      case "avatars": {
        if (first === this.uid) return
        // La consola ve las capturas de las opiniones; nadie más toca la carpeta de otra persona.
        if (bucket === "feedback" && op === "read" && (await this.isAdmin())) return
        if (bucket === "avatars" && op === "read") return
        throw DomainError.role("Solo puedes usar los archivos de tu propia carpeta.")
      }
      case "ads":
      case "public-assets":
        if (op === "read") return
        if (!(await this.isAdmin())) throw DomainError.role("Solo el administrador de Mirai puede subir estos archivos.")
        return
    }
  }

  private async isAdmin() {
    return !!(await this.contexts.raw(this.ctx.user)).admin
  }

  /** Revisa tamaño y tipo contra las reglas del bucket (mensajes para la persona). */
  checkLimits(bucket: FileBucket, size: number, type: string | null) {
    const r = BUCKET_RULES[bucket]
    if (size > r.maxBytes) throw DomainError.validation(`El archivo pesa ${mb(size)}: el máximo aquí es ${mb(r.maxBytes)}.`)
    if (r.mime && (!type || !r.mime.includes(type))) throw DomainError.validation(`Ese tipo de archivo no está permitido aquí. Usa ${r.mime.map((m) => MIME_TXT[m] ?? m).join(", ")}.`)
  }

  /** Ruta del archivo nuevo según el bucket (el servidor la arma: nadie escribe en la carpeta de otro). */
  keyFor(u: NewUpload): string {
    const id = randomUUID()
    const ext = EXT[u.type] ?? (safeName(u.name).split(".").pop() || "bin")
    switch (u.bucket) {
      case "attachments":
      case "logos":
        if (!u.bookId) throw DomainError.validation("Falta el libro del archivo.")
        return [u.bookId, u.folder, `${id}-${safeName(u.name)}`].filter(Boolean).join("/")
      case "feedback":
      case "avatars":
        return `${this.uid}/${id}.${ext}`
      case "ads":
        return `${id}.${ext}`
      case "public-assets":
        return `${u.folder ?? "whatsapp"}/${id}.${ext}`
    }
  }

  private ticket(t: Ticket) {
    return Buffer.from(this.crypto.encrypt(JSON.stringify(t))).toString("base64url")
  }

  private readTicket(id: string): Ticket {
    try {
      const t = JSON.parse(this.crypto.decrypt(Buffer.from(id, "base64url").toString("utf8"))) as Ticket
      if (t.u !== this.uid) throw new Error("otra persona")
      return t
    } catch {
      throw DomainError.notFound("No encontramos esa subida. Vuelve a subir el archivo.")
    }
  }

  async createUpload(u: NewUpload) {
    this.checkLimits(u.bucket, u.size, u.type)
    const key = this.keyFor(u)
    await this.authorize(u.bucket, key, "write")
    const signed = await this.store.signUpload({ bucket: u.bucket, key, contentType: u.type, maxBytes: BUCKET_RULES[u.bucket].maxBytes, ttlS: UPLOAD_TTL_S, size: u.size })
    const uploadId = this.ticket({ b: u.bucket, k: key, u: this.uid, s: u.size, t: u.type, e: Date.now() + UPLOAD_TTL_S * 1000 })
    return {
      uploadId, bucket: u.bucket, key, method: "PUT" as const, uploadUrl: signed.url, headers: signed.headers, expiresAt: signed.expiresAt,
      publicUrl: BUCKET_RULES[u.bucket].public ? this.store.publicUrl(u.bucket, key) : null,
    }
  }

  async completeUpload(uploadId: string) {
    const t = this.readTicket(uploadId)
    await this.authorize(t.b, t.k, "write")
    const info = await this.store.head({ bucket: t.b, key: t.k })
    if (!info) throw DomainError.notFound("No encontramos el archivo subido. Vuelve a subirlo.")
    try {
      this.checkLimits(t.b, info.size, info.contentType ?? t.t)
      // V7-E: el contenido real debe ser del tipo declarado (un .exe renombrado a .png no se queda).
      const first = await this.store.read({ bucket: t.b, key: t.k, range: [0, SNIFF_BYTES - 1] })
      if (first && first.length && !contentMatches(info.contentType ?? t.t, first)) throw DomainError.validation("El contenido del archivo no corresponde a su tipo. Vuelve a elegirlo.")
    } catch (e) {
      // Lo que no cumple los límites no se queda en el almacenamiento.
      await this.store.remove(t.b, [t.k]).catch(() => 0)
      throw e
    }
    return { bucket: t.b, key: t.k, size: info.size, contentType: info.contentType, publicUrl: BUCKET_RULES[t.b].public ? this.store.publicUrl(t.b, t.k) : null }
  }

  async url(bucket: FileBucket, key: string, download?: boolean) {
    await this.authorize(bucket, key, "read")
    if (BUCKET_RULES[bucket].public && !download) return { url: this.store.publicUrl(bucket, key), expiresAt: null }
    const url = await this.store.signDownload({ bucket, key, ttlS: DOWNLOAD_TTL_S, download })
    return { url, expiresAt: new Date(Date.now() + DOWNLOAD_TTL_S * 1000).toISOString() }
  }

  async remove(bucket: FileBucket, key: string) {
    await this.authorize(bucket, key, "write")
    return { deleted: (await this.store.remove(bucket, [key])) > 0 }
  }
}
