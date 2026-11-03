// ObjectStore en memoria: pruebas y desarrollo sin nube (OBJECT_STORE=memory). `put` simula la subida directa del
// navegador (solo metadatos) y `write` guarda el contenido.
import { createHash } from "node:crypto"
import { Injectable } from "@nestjs/common"
import { DomainError } from "../errors/domain-error"
import type { StoreBucket } from "./buckets"
import { assertKey, folderPrefix, ObjectStore, type ObjectEntry, type ObjectInfo, type SignDownloadArgs, type SignedUpload, type SignUploadArgs, type WriteArgs } from "./object-store"

type Stored = ObjectInfo & { body?: Buffer }

@Injectable()
export class MemoryObjectStore extends ObjectStore {
  override readonly driver: string = "memory"
  readonly objects = new Map<string, Stored>()
  base = "https://files.mirai.test"

  private id = (bucket: string, key: string) => `${bucket}/${assertKey(key)}`

  /** La subida directa del navegador (solo tamaño y tipo). */
  put(bucket: StoreBucket, key: string, info: ObjectInfo) {
    this.objects.set(this.id(bucket, key), { ...info, updated: new Date().toISOString() })
  }

  async signUpload(a: SignUploadArgs): Promise<SignedUpload> {
    return { url: `${this.base}/upload/${this.id(a.bucket, a.key)}?firma=prueba`, headers: { "content-type": a.contentType }, expiresAt: new Date(Date.now() + a.ttlS * 1000).toISOString() }
  }
  async signDownload(a: SignDownloadArgs): Promise<string> {
    if (!this.objects.has(this.id(a.bucket, a.key))) throw DomainError.notFound("No encontramos ese archivo.")
    return `${this.base}/signed/${this.id(a.bucket, a.key)}?ttl=${a.ttlS}${a.download ? "&download=1" : ""}`
  }
  async head(a: { bucket: StoreBucket; key: string }): Promise<ObjectInfo | null> {
    const o = this.objects.get(this.id(a.bucket, a.key))
    return o ? { size: o.size, contentType: o.contentType, md5: o.md5 ?? null, updated: o.updated ?? null } : null
  }
  async read(a: { bucket: StoreBucket; key: string; range?: [number, number] }): Promise<Buffer | null> {
    const o = this.objects.get(this.id(a.bucket, a.key))
    if (!o) return null
    const body = o.body ?? Buffer.alloc(0)
    return a.range ? body.subarray(a.range[0], a.range[1] + 1) : body
  }
  async write(a: WriteArgs): Promise<void> {
    const body = Buffer.from(a.body)
    this.objects.set(this.id(a.bucket, a.key), { size: body.length, contentType: a.contentType, md5: createHash("md5").update(body).digest("base64"), body, updated: new Date().toISOString() })
  }
  async list(a: { bucket: StoreBucket; prefix: string; limit?: number }): Promise<ObjectEntry[]> {
    const start = `${a.bucket}/${folderPrefix(a.prefix)}`
    const out: ObjectEntry[] = []
    for (const [id, o] of this.objects) if (id.startsWith(start)) out.push({ key: id.slice(a.bucket.length + 1), size: o.size, contentType: o.contentType, md5: o.md5 ?? null, updated: o.updated ?? null })
    out.sort((x, y) => x.key.localeCompare(y.key))
    return a.limit ? out.slice(0, a.limit) : out
  }
  async remove(bucket: StoreBucket, keys: string[]): Promise<number> {
    let n = 0
    for (const k of keys) if (this.objects.delete(this.id(bucket, k))) n++
    return n
  }
  publicUrl(bucket: StoreBucket, key: string): string {
    return `${this.base}/${this.id(bucket, key)}`
  }
}
