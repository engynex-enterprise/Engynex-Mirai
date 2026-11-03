// ObjectStore sobre Supabase Storage (OBJECT_STORE=supabase, el de hoy). Usa la clave del sistema: la autorización ya
// la hizo quien llama (FilesService, BookGuard…), igual que las políticas de storage.objects de las migraciones.
// El bucket lógico es el bucket de Supabase y la ruta es la misma (nada que reescribir en la base).
import { Injectable } from "@nestjs/common"
import { systemScope } from "../db/scope"
import { SupabaseJsFactory } from "../db/supabase-js.factory"
import { DomainError } from "../errors/domain-error"
import type { StoreBucket } from "./buckets"
import { assertKey, folderPrefix, ObjectStore, type ObjectEntry, type ObjectInfo, type SignDownloadArgs, type SignedUpload, type SignUploadArgs, type WriteArgs } from "./object-store"

type ListItem = { name: string; id: string | null; updated_at?: string | null; metadata?: Record<string, unknown> | null }

@Injectable()
export class SupabaseStorageObjectStore extends ObjectStore {
  override readonly driver: string = "supabase"

  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  private storage(bucket: StoreBucket) {
    return this.sb.for(systemScope(`archivos: ${bucket}`)).storage.from(bucket)
  }

  async signUpload(a: SignUploadArgs): Promise<SignedUpload> {
    // Supabase firma la subida por 2 horas (no deja cambiarlo); complete() vuelve a revisar el tamaño y el tipo.
    const { data, error } = await this.storage(a.bucket).createSignedUploadUrl(assertKey(a.key))
    if (error || !data) throw DomainError.upstream("No pudimos preparar la subida del archivo. Intenta de nuevo en un momento.", error)
    return { url: data.signedUrl, headers: { "content-type": a.contentType, "x-upsert": "false" }, expiresAt: new Date(Date.now() + a.ttlS * 1000).toISOString() }
  }

  async signDownload(a: SignDownloadArgs): Promise<string> {
    const { data, error } = await this.storage(a.bucket).createSignedUrl(assertKey(a.key), a.ttlS, a.download ? { download: a.filename || true } : undefined)
    if (error || !data?.signedUrl) throw DomainError.notFound("No encontramos ese archivo.")
    return data.signedUrl
  }

  async head(a: { bucket: StoreBucket; key: string }): Promise<ObjectInfo | null> {
    const key = assertKey(a.key)
    const slash = key.lastIndexOf("/")
    const folder = slash > 0 ? key.slice(0, slash) : ""
    const name = key.slice(slash + 1)
    const { data, error } = await this.storage(a.bucket).list(folder, { limit: 2, search: name })
    if (error) throw DomainError.upstream("No pudimos revisar el archivo. Intenta de nuevo en un momento.", error)
    const f = ((data ?? []) as ListItem[]).find((x) => x.name === name)
    if (!f) return null
    return infoOf(f)
  }

  async read(a: { bucket: StoreBucket; key: string; range?: [number, number] }): Promise<Buffer | null> {
    const { data, error } = await this.storage(a.bucket).download(assertKey(a.key))
    if (error || !data) return null
    const buf = Buffer.from(await data.arrayBuffer())
    return a.range ? buf.subarray(a.range[0], a.range[1] + 1) : buf
  }

  async write(a: WriteArgs): Promise<void> {
    const { error } = await this.storage(a.bucket).upload(assertKey(a.key), Buffer.from(a.body), { contentType: a.contentType, upsert: true, ...(a.cacheControl ? { cacheControl: a.cacheControl } : {}) })
    if (error) throw DomainError.upstream("No pudimos guardar el archivo. Intenta de nuevo en un momento.", error)
  }

  /** Igual que apps/web/features/data/purge.ts: recorre subcarpetas por páginas de 1.000 (máximo 6 niveles). */
  async list(a: { bucket: StoreBucket; prefix: string; limit?: number }): Promise<ObjectEntry[]> {
    const out: ObjectEntry[] = []
    const walk = async (folder: string, depth: number): Promise<void> => {
      if (depth > 6) return
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await this.storage(a.bucket).list(folder, { limit: 1000, offset })
        if (error) throw DomainError.upstream("No pudimos leer la carpeta de archivos.", error)
        const items = (data ?? []) as ListItem[]
        for (const f of items) {
          const key = folder ? `${folder}/${f.name}` : f.name
          if (!f.id && !f.metadata) await walk(key, depth + 1)
          else out.push({ key, ...infoOf(f) })
          if (a.limit && out.length >= a.limit) return
        }
        if (items.length < 1000) break
      }
    }
    await walk(folderPrefix(a.prefix).replace(/\/$/, ""), 0)
    return a.limit ? out.slice(0, a.limit) : out
  }

  async remove(bucket: StoreBucket, keys: string[]): Promise<number> {
    if (!keys.length) return 0
    let n = 0
    for (let i = 0; i < keys.length; i += 500) {
      const { data, error } = await this.storage(bucket).remove(keys.slice(i, i + 500).map(assertKey))
      if (error) throw DomainError.upstream("No pudimos borrar el archivo. Intenta de nuevo en un momento.", error)
      n += data?.length ?? 0
    }
    return n
  }

  publicUrl(bucket: StoreBucket, key: string): string {
    return this.storage(bucket).getPublicUrl(assertKey(key)).data.publicUrl
  }
}

function infoOf(f: ListItem): ObjectInfo {
  const m = (f.metadata ?? {}) as { size?: number; mimetype?: string; eTag?: string; lastModified?: string }
  return { size: Number(m.size ?? 0), contentType: m.mimetype ?? null, etag: m.eTag?.replace(/"/g, "") ?? null, updated: m.lastModified ?? f.updated_at ?? null }
}
