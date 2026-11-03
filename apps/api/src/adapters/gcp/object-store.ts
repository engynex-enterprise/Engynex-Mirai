// ObjectStore sobre Cloud Storage (OBJECT_STORE=gcs, destino en GCP). Credenciales por ADC: en Cloud Run, la cuenta de
// servicio del servicio; las URL firmadas V4 se firman con IAM signBlob sobre esa misma cuenta (necesita
// roles/iam.serviceAccountTokenCreator sobre sí misma), sin llaves. La subida firma `content-type` y
// `x-goog-content-length-range` (0..máximo del bucket): el navegador debe mandar esos dos encabezados tal cual.
// En local se prueba con fake-gcs-server (GCS_ENDPOINT). El SDK se carga con import() solo si es el elegido.
import type { Bucket, Storage } from "@google-cloud/storage"
import type { PhysicalBucket, StoreBucket } from "../../core/files/buckets"
import { PHYSICAL } from "../../core/files/buckets"
import { contentDisposition, folderPrefix, keyOf, objectName, ObjectStore, type ObjectEntry, type ObjectInfo, type SignDownloadArgs, type SignedUpload, type SignUploadArgs, type WriteArgs } from "../../core/files/object-store"

export type GcsStoreOptions = {
  buckets: Record<PhysicalBucket, string>
  publicBaseUrl?: string
  /** fake-gcs-server u otro emulador (sin autenticación). */
  endpoint?: string
  /** Host de las URL firmadas si el navegador ve otro (p. ej. el emulador detrás de Docker). */
  signedHost?: string
  project?: string
  /** Solo pruebas: llave para firmar sin IAM (el emulador no valida la firma). */
  credentials?: { client_email: string; private_key: string }
}

const notFound = (e: unknown) => (e as { code?: number })?.code === 404

export class GcsObjectStore extends ObjectStore {
  override readonly driver: string = "gcs"

  constructor(
    private readonly o: GcsStoreOptions,
    private readonly storage: Storage,
  ) {
    super()
  }

  private bucket(b: StoreBucket): Bucket {
    return this.storage.bucket(this.o.buckets[PHYSICAL[b]])
  }
  private file(b: StoreBucket, key: string) {
    return this.bucket(b).file(objectName(b, key))
  }
  private host() {
    return this.o.signedHost ? { host: this.o.signedHost } : {}
  }

  async signUpload(a: SignUploadArgs): Promise<SignedUpload> {
    const range = `0,${a.maxBytes}`
    const expires = Date.now() + a.ttlS * 1000
    const [url] = await this.file(a.bucket, a.key).getSignedUrl({ version: "v4", action: "write", expires, contentType: a.contentType, extensionHeaders: { "x-goog-content-length-range": range }, ...this.host() })
    return { url, headers: { "content-type": a.contentType, "x-goog-content-length-range": range }, expiresAt: new Date(expires).toISOString() }
  }

  async signDownload(a: SignDownloadArgs): Promise<string> {
    const [url] = await this.file(a.bucket, a.key).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + a.ttlS * 1000, ...(a.download ? { responseDisposition: contentDisposition(a.filename, a.key) } : {}), ...this.host() })
    return url
  }

  async head(a: { bucket: StoreBucket; key: string }): Promise<ObjectInfo | null> {
    try {
      const [m] = await this.file(a.bucket, a.key).getMetadata()
      return { size: Number(m.size ?? 0), contentType: m.contentType ?? null, md5: m.md5Hash ?? null, etag: m.etag ?? null, updated: m.updated ?? null }
    } catch (e) {
      if (notFound(e)) return null
      throw e
    }
  }

  async read(a: { bucket: StoreBucket; key: string; range?: [number, number] }): Promise<Buffer | null> {
    try {
      const [buf] = await this.file(a.bucket, a.key).download(a.range ? { start: a.range[0], end: a.range[1], validation: false } : {})
      return buf
    } catch (e) {
      if (notFound(e)) return null
      throw e
    }
  }

  async write(a: WriteArgs): Promise<void> {
    await this.file(a.bucket, a.key).save(Buffer.from(a.body), { contentType: a.contentType, resumable: false, metadata: { contentType: a.contentType, ...(a.cacheControl ? { cacheControl: a.cacheControl } : {}) } })
  }

  async list(a: { bucket: StoreBucket; prefix: string; limit?: number }): Promise<ObjectEntry[]> {
    const out: ObjectEntry[] = []
    let pageToken: string | undefined
    do {
      const [files, next] = await this.bucket(a.bucket).getFiles({ prefix: `${a.bucket}/${folderPrefix(a.prefix)}`, autoPaginate: false, maxResults: 1000, pageToken })
      for (const f of files) {
        const key = keyOf(a.bucket, f.name)
        if (key) out.push({ key, size: Number(f.metadata.size ?? 0), contentType: f.metadata.contentType ?? null, md5: f.metadata.md5Hash ?? null, updated: f.metadata.updated ?? null })
        if (a.limit && out.length >= a.limit) return out
      }
      pageToken = (next as { pageToken?: string } | null)?.pageToken
    } while (pageToken)
    return out
  }

  async remove(bucket: StoreBucket, keys: string[]): Promise<number> {
    let n = 0
    for (let i = 0; i < keys.length; i += 10) {
      const r = await Promise.all(keys.slice(i, i + 10).map((k) => this.file(bucket, k).delete({ ignoreNotFound: true }).then(([res]) => ((res as { statusCode?: number } | undefined)?.statusCode === 404 ? 0 : 1))))
      n += r.reduce<number>((s, x) => s + x, 0)
    }
    return n
  }

  /** Solo desarrollo y pruebas (fake-gcs-server): crea los buckets físicos si no existen. En la nube los crea Terraform. */
  async ensureBuckets(): Promise<void> {
    for (const name of new Set(Object.values(this.o.buckets))) {
      const [exists] = await this.storage.bucket(name).exists()
      if (!exists) await this.storage.createBucket(name)
    }
  }

  publicUrl(bucket: StoreBucket, key: string): string {
    const name = objectName(bucket, key).split("/").map(encodeURIComponent).join("/")
    if (this.o.publicBaseUrl) return `${this.o.publicBaseUrl}/${name}`
    const base = (this.o.endpoint ?? "https://storage.googleapis.com").replace(/\/+$/, "")
    return `${base}/${this.o.buckets[PHYSICAL[bucket]]}/${name}`
  }
}

/** Crea el adaptador cargando @google-cloud/storage solo ahora. */
export async function createGcsObjectStore(o: GcsStoreOptions): Promise<GcsObjectStore> {
  const { Storage } = await import("@google-cloud/storage")
  const storage = new Storage({
    ...(o.project ? { projectId: o.project } : {}),
    ...(o.endpoint ? { apiEndpoint: o.endpoint.replace(/\/+$/, ""), useAuthWithCustomEndpoint: false } : {}),
    // Sin llave privada (Cloud Run), la librería descubre la cuenta en el servidor de metadatos y firma con IAM signBlob.
    ...(o.credentials ? { credentials: o.credentials } : {}),
  })
  return new GcsObjectStore(o, storage)
}
