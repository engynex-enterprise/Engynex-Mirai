// ObjectStore sobre AWS S3 y cualquier compatible (MinIO en Docker para desarrollo y pruebas, Cloudflare R2…).
// OBJECT_STORE=s3. Credenciales: la cadena estándar del SDK (rol de la tarea de ECS/EKS, variables AWS_*, SSO local):
// nunca llaves en el código. Las URL de subida son PUT prefirmados (SigV4) con `content-type` y, si se sabe,
// `content-length` firmados: el navegador no puede subir otro tipo ni otro tamaño. complete() vuelve a revisar.
// El SDK se carga con import() solo si este adaptador es el elegido (regla de ESLint: SDK solo en adapters/aws).
import type { S3Client } from "@aws-sdk/client-s3"
import type { PhysicalBucket, StoreBucket } from "../../core/files/buckets"
import { PHYSICAL } from "../../core/files/buckets"
import { contentDisposition, folderPrefix, keyOf, objectName, ObjectStore, type ObjectEntry, type ObjectInfo, type SignDownloadArgs, type SignedUpload, type SignUploadArgs, type WriteArgs } from "../../core/files/object-store"

type S3Sdk = typeof import("@aws-sdk/client-s3")
type Presigner = typeof import("@aws-sdk/s3-request-presigner")

export type S3StoreOptions = {
  region: string
  /** MinIO / R2 / LocalStack. Sin él, el endpoint de AWS de la región. */
  endpoint?: string
  /** El endpoint que ve el navegador (si el de la API es interno, p. ej. http://minio:9000 en Docker Compose). */
  publicEndpoint?: string
  forcePathStyle?: boolean
  buckets: Record<PhysicalBucket, string>
  /** https://files.mirai.engynex.com (CDN). Sin ella, la URL directa del bucket público. */
  publicBaseUrl?: string
  /** Solo pruebas y desarrollo (MinIO): en la nube va la cadena del SDK. */
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }
}

const isNotFound = (e: unknown) => {
  const x = e as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
  return x?.$metadata?.httpStatusCode === 404 || x?.name === "NotFound" || x?.name === "NoSuchKey" || x?.Code === "NoSuchKey"
}

export class S3ObjectStore extends ObjectStore {
  override readonly driver: string = "s3"
  private readonly signer: S3Client

  constructor(
    private readonly o: S3StoreOptions,
    private readonly sdk: S3Sdk,
    private readonly presigner: Presigner,
    private readonly client: S3Client = S3ObjectStore.client(o, sdk, o.endpoint),
  ) {
    super()
    // Las URL que ve el navegador se firman contra el endpoint público (la firma incluye el host).
    this.signer = o.publicEndpoint && o.publicEndpoint !== o.endpoint ? S3ObjectStore.client(o, sdk, o.publicEndpoint) : client
  }

  static client(o: S3StoreOptions, sdk: S3Sdk, endpoint?: string): S3Client {
    return new sdk.S3Client({
      region: o.region,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: !!o.forcePathStyle,
      ...(o.credentials ? { credentials: o.credentials } : {}),
      // Sin sumas CRC32 automáticas: las URL prefirmadas no las piden al navegador y MinIO/R2 quedan compatibles.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    })
  }

  private bucket(b: StoreBucket) {
    return this.o.buckets[PHYSICAL[b]]
  }

  async signUpload(a: SignUploadArgs): Promise<SignedUpload> {
    const cmd = new this.sdk.PutObjectCommand({ Bucket: this.bucket(a.bucket), Key: objectName(a.bucket, a.key), ContentType: a.contentType, ...(a.size ? { ContentLength: a.size } : {}) })
    const signable = new Set(["content-type", ...(a.size ? ["content-length"] : [])])
    const url = await this.presigner.getSignedUrl(this.signer, cmd, { expiresIn: a.ttlS, signableHeaders: signable })
    return { url, headers: { "content-type": a.contentType }, expiresAt: new Date(Date.now() + a.ttlS * 1000).toISOString() }
  }

  async signDownload(a: SignDownloadArgs): Promise<string> {
    const cmd = new this.sdk.GetObjectCommand({ Bucket: this.bucket(a.bucket), Key: objectName(a.bucket, a.key), ...(a.download ? { ResponseContentDisposition: contentDisposition(a.filename, a.key) } : {}) })
    return this.presigner.getSignedUrl(this.signer, cmd, { expiresIn: a.ttlS })
  }

  async head(a: { bucket: StoreBucket; key: string }): Promise<ObjectInfo | null> {
    try {
      const r = await this.client.send(new this.sdk.HeadObjectCommand({ Bucket: this.bucket(a.bucket), Key: objectName(a.bucket, a.key) }))
      return { size: Number(r.ContentLength ?? 0), contentType: r.ContentType ?? null, etag: r.ETag?.replace(/"/g, "") ?? null, updated: r.LastModified?.toISOString() ?? null }
    } catch (e) {
      if (isNotFound(e)) return null
      throw e
    }
  }

  async read(a: { bucket: StoreBucket; key: string; range?: [number, number] }): Promise<Buffer | null> {
    try {
      const r = await this.client.send(new this.sdk.GetObjectCommand({ Bucket: this.bucket(a.bucket), Key: objectName(a.bucket, a.key), ...(a.range ? { Range: `bytes=${a.range[0]}-${a.range[1]}` } : {}) }))
      return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : Buffer.alloc(0)
    } catch (e) {
      if (isNotFound(e)) return null
      throw e
    }
  }

  async write(a: WriteArgs): Promise<void> {
    const body = typeof a.body === "string" ? Buffer.from(a.body) : a.body
    await this.client.send(new this.sdk.PutObjectCommand({ Bucket: this.bucket(a.bucket), Key: objectName(a.bucket, a.key), Body: body, ContentType: a.contentType, ContentLength: body.length, ...(a.cacheControl ? { CacheControl: a.cacheControl } : {}) }))
  }

  async list(a: { bucket: StoreBucket; prefix: string; limit?: number }): Promise<ObjectEntry[]> {
    const out: ObjectEntry[] = []
    let token: string | undefined
    do {
      const r = await this.client.send(new this.sdk.ListObjectsV2Command({ Bucket: this.bucket(a.bucket), Prefix: `${a.bucket}/${folderPrefix(a.prefix)}`, ContinuationToken: token, MaxKeys: 1000 }))
      for (const o of r.Contents ?? []) {
        const key = o.Key ? keyOf(a.bucket, o.Key) : null
        if (key) out.push({ key, size: Number(o.Size ?? 0), contentType: null, etag: o.ETag?.replace(/"/g, "") ?? null, updated: o.LastModified?.toISOString() ?? null })
        if (a.limit && out.length >= a.limit) return out
      }
      token = r.IsTruncated ? r.NextContinuationToken : undefined
    } while (token)
    return out
  }

  async remove(bucket: StoreBucket, keys: string[]): Promise<number> {
    let n = 0
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000)
      const r = await this.client.send(new this.sdk.DeleteObjectsCommand({ Bucket: this.bucket(bucket), Delete: { Objects: chunk.map((k) => ({ Key: objectName(bucket, k) })), Quiet: true } }))
      n += chunk.length - (r.Errors?.length ?? 0)
    }
    return n
  }

  /** Solo desarrollo y pruebas (MinIO): crea los buckets físicos si no existen. En la nube los crea Terraform. */
  async ensureBuckets(): Promise<void> {
    for (const Bucket of new Set(Object.values(this.o.buckets))) {
      try {
        await this.client.send(new this.sdk.CreateBucketCommand({ Bucket }))
      } catch (e) {
        const n = (e as { name?: string }).name
        if (n !== "BucketAlreadyOwnedByYou" && n !== "BucketAlreadyExists") throw e
      }
    }
  }

  publicUrl(bucket: StoreBucket, key: string): string {
    const name = objectName(bucket, key).split("/").map(encodeURIComponent).join("/")
    if (this.o.publicBaseUrl) return `${this.o.publicBaseUrl}/${name}`
    const b = this.bucket(bucket)
    const ep = (this.o.publicEndpoint ?? this.o.endpoint)?.replace(/\/+$/, "")
    if (ep) return this.o.forcePathStyle ? `${ep}/${b}/${name}` : `${ep.replace("://", `://${b}.`)}/${name}`
    return `https://${b}.s3.${this.o.region}.amazonaws.com/${name}`
  }
}

/** Crea el adaptador cargando el SDK de AWS solo ahora. */
export async function createS3ObjectStore(o: S3StoreOptions): Promise<S3ObjectStore> {
  const [sdk, presigner] = await Promise.all([import("@aws-sdk/client-s3"), import("@aws-sdk/s3-request-presigner")])
  return new S3ObjectStore(o, sdk, presigner)
}
